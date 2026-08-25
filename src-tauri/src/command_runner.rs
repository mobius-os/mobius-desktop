use std::{process::Stdio, time::Duration};

use thiserror::Error;
use tokio::{
    io::{AsyncRead, AsyncReadExt},
    process::{Child, Command},
    time::timeout,
};

const MAX_OUTPUT_BYTES: usize = 1024 * 1024;

enum CollectError {
    Io(std::io::Error),
    OutputLimit,
}

impl From<std::io::Error> for CollectError {
    fn from(error: std::io::Error) -> Self {
        Self::Io(error)
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CommandResult {
    pub code: i32,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Debug, Error)]
pub enum CommandError {
    #[error("Could not start {command}.")]
    Start {
        command: String,
        #[source]
        source: std::io::Error,
    },
    #[error("Could not read output from {command}.")]
    Read {
        command: String,
        #[source]
        source: std::io::Error,
    },
    #[error("{0} did not finish in time.")]
    Timeout(String),
    #[error("{0} produced too much output.")]
    OutputLimit(String),
}

pub async fn run_command(
    command: &str,
    args: &[String],
    timeout_duration: Duration,
) -> Result<CommandResult, CommandError> {
    let mut process = Command::new(command);
    process
        .args(args)
        .kill_on_drop(true)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = process.spawn().map_err(|source| CommandError::Start {
        command: command.to_owned(),
        source,
    })?;

    let collected = timeout(timeout_duration, collect_output(&mut child)).await;
    let (status, stdout, stderr) = match collected {
        Ok(Ok(output)) => output,
        Ok(Err(CollectError::Io(source))) => {
            stop_child(&mut child).await;
            return Err(CommandError::Read {
                command: command.to_owned(),
                source,
            });
        }
        Ok(Err(CollectError::OutputLimit)) => {
            stop_child(&mut child).await;
            return Err(CommandError::OutputLimit(command.to_owned()));
        }
        Err(_) => {
            stop_child(&mut child).await;
            return Err(CommandError::Timeout(command.to_owned()));
        }
    };

    Ok(CommandResult {
        code: status.code().unwrap_or(-1),
        stdout: String::from_utf8_lossy(&stdout).into_owned(),
        stderr: String::from_utf8_lossy(&stderr).into_owned(),
    })
}

async fn collect_output(
    child: &mut Child,
) -> Result<(std::process::ExitStatus, Vec<u8>, Vec<u8>), CollectError> {
    let mut stdout = child.stdout.take().expect("stdout was configured as piped");
    let mut stderr = child.stderr.take().expect("stderr was configured as piped");
    let mut stdout_bytes = Vec::new();
    let mut stderr_bytes = Vec::new();
    let mut stdout_open = true;
    let mut stderr_open = true;

    while stdout_open || stderr_open {
        tokio::select! {
            read = read_chunk(&mut stdout, &mut stdout_bytes), if stdout_open => {
                stdout_open = read?;
            }
            read = read_chunk(&mut stderr, &mut stderr_bytes), if stderr_open => {
                stderr_open = read?;
            }
        }

        if stdout_bytes.len() + stderr_bytes.len() > MAX_OUTPUT_BYTES {
            return Err(CollectError::OutputLimit);
        }
    }

    let status = child.wait().await?;
    Ok((status, stdout_bytes, stderr_bytes))
}

async fn read_chunk(
    reader: &mut (impl AsyncRead + Unpin),
    destination: &mut Vec<u8>,
) -> Result<bool, std::io::Error> {
    let mut chunk = [0_u8; 8192];
    let read = reader.read(&mut chunk).await?;
    destination.extend_from_slice(&chunk[..read]);
    Ok(read > 0)
}

async fn stop_child(child: &mut Child) {
    let _ = child.kill().await;
    let _ = child.wait().await;
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    #[test]
    fn captures_both_streams() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let result = runtime
            .block_on(run_command(
                "sh",
                &["-c".into(), "printf output; printf warning >&2".into()],
                Duration::from_secs(5),
            ))
            .unwrap();

        assert_eq!(result.code, 0);
        assert_eq!(result.stdout, "output");
        assert_eq!(result.stderr, "warning");
    }

    #[test]
    fn stops_a_process_that_exceeds_the_output_limit() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let error = runtime
            .block_on(run_command(
                "sh",
                &["-c".into(), "head -c 1100000 /dev/zero".into()],
                Duration::from_secs(5),
            ))
            .unwrap_err();

        assert!(matches!(error, CommandError::OutputLimit(_)));
    }
}
