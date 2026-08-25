use std::collections::HashSet;

use sha2::{Digest, Sha256};
use tauri::{
    AppHandle, Manager, Runtime, WebviewUrl, WebviewWindowBuilder, webview::NewWindowResponse,
};
use tauri_plugin_opener::OpenerExt;
use url::Url;

use crate::{
    models::SavedInstance,
    url_policy::{is_safe_external_url, normalize_instance_origin},
};

const AUTH_ORIGINS: &[&str] = &[
    "https://www.mobius.you",
    "https://mobius.you",
    "https://accounts.google.com",
    "https://appleid.apple.com",
];

fn window_label(instance_id: &str) -> String {
    let digest = Sha256::digest(instance_id.as_bytes());
    let hash = digest[..10]
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    format!("instance-{hash}")
}

fn allowed_navigation_origins(origin: &str) -> HashSet<String> {
    std::iter::once(origin.to_owned())
        .chain(AUTH_ORIGINS.iter().map(|origin| (*origin).to_owned()))
        .collect()
}

pub fn show_launcher<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("launcher") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub fn open_instance<R: Runtime>(
    app: &AppHandle<R>,
    instance: &SavedInstance,
) -> Result<(), String> {
    let origin = normalize_instance_origin(&instance.origin).map_err(|error| error.to_string())?;
    let label = window_label(&instance.id);
    if let Some(window) = app.get_webview_window(&label) {
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
        return Ok(());
    }

    let page = Url::parse(&format!("{origin}/shell/")).map_err(|error| error.to_string())?;
    let allowed = allowed_navigation_origins(&origin);
    let navigation_opener = app.clone();
    let popup_opener = app.clone();
    let title = format!("{} · Möbius", instance.name);
    let window = WebviewWindowBuilder::new(app, label, WebviewUrl::External(page))
        .title(title)
        .inner_size(1440.0, 920.0)
        .min_inner_size(840.0, 620.0)
        .visible(false)
        .on_navigation(move |url| {
            if allowed.contains(url.origin().ascii_serialization().as_str()) {
                true
            } else {
                if url.scheme() == "https" {
                    let _ = navigation_opener
                        .opener()
                        .open_url(url.as_str(), None::<&str>);
                }
                false
            }
        })
        .on_new_window(move |url, _| {
            if is_safe_external_url(url.as_str()) {
                let _ = popup_opener.opener().open_url(url.as_str(), None::<&str>);
            }
            NewWindowResponse::Deny
        })
        .build()
        .map_err(|error| error.to_string())?;
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn instance_window_labels_do_not_expose_saved_ids() {
        let label = window_label("private-deployment-name");
        assert!(label.starts_with("instance-"));
        assert!(!label.contains("private"));
    }

    #[test]
    fn navigation_is_limited_to_the_instance_and_known_auth_origins() {
        let allowed = allowed_navigation_origins("https://example.com");
        assert!(allowed.contains("https://example.com"));
        assert!(allowed.contains("https://accounts.google.com"));
        assert!(!allowed.contains("https://example.org"));
    }
}
