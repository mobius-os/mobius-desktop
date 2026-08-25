use std::time::Duration;

use reqwest::{Client, redirect::Policy};
use serde_json::Value;
use thiserror::Error;
use url::{Host, Url};

const ALLOWED_PATHS: &[&str] = &["", "/", "/shell", "/shell/"];

#[derive(Debug, Error)]
pub enum InstanceUrlError {
    #[error("Enter the address of your Möbius.")]
    Empty,
    #[error("Use a complete address, such as https://my-mobius.example.")]
    Invalid,
    #[error("Do not put a username or password in the address.")]
    Credentials,
    #[error("Remove the query or fragment from this address.")]
    QueryOrFragment,
    #[error("Use the main address for this Möbius, not a page inside it.")]
    NestedPath,
    #[error("Remote Möbius addresses must use HTTPS. HTTP is allowed only on this computer.")]
    Insecure,
    #[error("Möbius answered with status {0}.")]
    Status(u16),
    #[error("That server answered, but it did not identify itself as a ready Möbius.")]
    NotMobius,
    #[error("Möbius took too long to answer. Check the address and try again.")]
    Timeout,
    #[error("Could not reach a ready Möbius at that address.")]
    Unreachable,
}

fn is_loopback_url(url: &Url) -> bool {
    match url.host() {
        Some(Host::Domain(host)) => host.eq_ignore_ascii_case("localhost"),
        Some(Host::Ipv4(address)) => address.is_loopback(),
        Some(Host::Ipv6(address)) => address.is_loopback(),
        None => false,
    }
}

pub fn normalize_instance_origin(value: &str) -> Result<String, InstanceUrlError> {
    let raw = value.trim();
    if raw.is_empty() {
        return Err(InstanceUrlError::Empty);
    }

    let parsed = Url::parse(raw).map_err(|_| InstanceUrlError::Invalid)?;
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err(InstanceUrlError::Credentials);
    }
    if parsed.query().is_some() || parsed.fragment().is_some() {
        return Err(InstanceUrlError::QueryOrFragment);
    }
    if !ALLOWED_PATHS.contains(&parsed.path()) {
        return Err(InstanceUrlError::NestedPath);
    }

    let secure_remote = parsed.scheme() == "https";
    let loopback = parsed.scheme() == "http" && is_loopback_url(&parsed);
    if !secure_remote && !loopback {
        return Err(InstanceUrlError::Insecure);
    }

    Ok(parsed.origin().ascii_serialization())
}

pub fn is_safe_external_url(value: &str) -> bool {
    Url::parse(value).is_ok_and(|url| url.scheme() == "https")
}

pub async fn verify_mobius_origin(value: &str) -> Result<String, InstanceUrlError> {
    let origin = normalize_instance_origin(value)?;
    let client = Client::builder()
        .redirect(Policy::none())
        .timeout(Duration::from_secs(8))
        .build()
        .map_err(|_| InstanceUrlError::Unreachable)?;

    let response = client
        .get(format!("{origin}/api/ready"))
        .send()
        .await
        .map_err(|error| {
            if error.is_timeout() {
                InstanceUrlError::Timeout
            } else {
                InstanceUrlError::Unreachable
            }
        })?;
    if !response.status().is_success() {
        return Err(InstanceUrlError::Status(response.status().as_u16()));
    }

    let payload: Value = response
        .json()
        .await
        .map_err(|_| InstanceUrlError::NotMobius)?;
    if payload.get("status").and_then(Value::as_str) != Some("ready") {
        return Err(InstanceUrlError::NotMobius);
    }
    Ok(origin)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn remote_origins_require_https() {
        assert_eq!(
            normalize_instance_origin("http://example.com")
                .unwrap_err()
                .to_string(),
            "Remote Möbius addresses must use HTTPS. HTTP is allowed only on this computer."
        );
        assert_eq!(
            normalize_instance_origin("https://example.com/shell/").unwrap(),
            "https://example.com"
        );
    }

    #[test]
    fn loopback_http_accepts_ipv4_ipv6_and_localhost() {
        for value in [
            "http://127.0.0.1:15123",
            "http://localhost:15123",
            "http://[::1]:15123",
        ] {
            assert!(normalize_instance_origin(value).is_ok(), "{value}");
        }
    }

    #[test]
    fn nested_paths_credentials_and_fragments_are_rejected() {
        assert!(matches!(
            normalize_instance_origin("https://example.com/chats/1"),
            Err(InstanceUrlError::NestedPath)
        ));
        assert!(matches!(
            normalize_instance_origin("https://user:pass@example.com"),
            Err(InstanceUrlError::Credentials)
        ));
        assert!(matches!(
            normalize_instance_origin("https://example.com/#chat"),
            Err(InstanceUrlError::QueryOrFragment)
        ));
    }
}
