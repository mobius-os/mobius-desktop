use std::{path::Path, time::Duration};

use reqwest::{Client, redirect::Policy};
use serde_json::Value;
use thiserror::Error;
use tokio::{net::TcpListener, time::sleep};

use crate::{
    command_runner::{CommandError, CommandResult, run_command},
    models::{
        ContainerState, DEFAULT_LOCAL_PORT, DockerAvailability, LocalProgressPhase,
        LocalRuntimeSettings, LocalRuntimeStatus, SharedFolder, is_safe_shared_folder_destination,
    },
};

pub const LOCAL_CONTAINER_NAME: &str = "mobius-desktop";
const PREVIOUS_CONTAINER_NAME: &str = "mobius-desktop-previous";
pub const LOCAL_DATA_VOLUME: &str = "mobius-desktop-data";
pub const OWNERSHIP_LABEL: &str = "you.mobius.desktop.managed=true";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct ContainerInspection {
    owned: bool,
    state: ContainerState,
    bound_port: Option<u16>,
}

#[derive(Debug, Error)]
#[error("{message}")]
pub struct DockerServiceError {
    pub message: String,
    pub technical_detail: String,
}

impl DockerServiceError {
    fn user(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            technical_detail: String::new(),
        }
    }

    fn with_detail(message: impl Into<String>, detail: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            technical_detail: detail.into(),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ImageSource {
    Downloaded,
    Cached,
}

fn clean_detail(result: &CommandResult) -> String {
    let detail = if result.stderr.trim().is_empty() {
        &result.stdout
    } else {
        &result.stderr
    };
    detail
        .trim()
        .lines()
        .rev()
        .take(8)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<Vec<_>>()
        .join("\n")
}

fn valid_host_path(value: &str) -> bool {
    let windows_drive = value.as_bytes().get(1) == Some(&b':')
        && value
            .as_bytes()
            .get(2)
            .is_some_and(|byte| *byte == b'\\' || *byte == b'/')
        && value
            .as_bytes()
            .first()
            .is_some_and(u8::is_ascii_alphabetic);
    let windows_unc = value.starts_with("\\\\");
    (Path::new(value).is_absolute() || windows_drive || windows_unc)
        && !value.contains('\0')
        && !value.contains(',')
}

fn validate_folder(folder: &SharedFolder) -> Result<(), DockerServiceError> {
    if !valid_host_path(&folder.host_path) {
        return Err(DockerServiceError::with_detail(
            format!(
                "“{}” cannot be shared because its path is not supported.",
                folder.name
            ),
            "Bind-mount source must be absolute and cannot contain commas.",
        ));
    }
    if !is_safe_shared_folder_destination(&folder.container_path) {
        return Err(DockerServiceError::user(
            "A shared folder had an unsafe container destination.",
        ));
    }
    Ok(())
}

fn require_folder_sources(folders: &[SharedFolder]) -> Result<(), DockerServiceError> {
    for folder in folders {
        validate_folder(folder)?;
        if !Path::new(&folder.host_path).is_dir() {
            return Err(DockerServiceError::with_detail(
                format!("“{}” is no longer available on this computer.", folder.name),
                "Choose the folder again, or remove it before restarting the local Möbius.",
            ));
        }
    }
    Ok(())
}

pub fn build_create_arguments(
    settings: &LocalRuntimeSettings,
) -> Result<Vec<String>, DockerServiceError> {
    if settings.port < 1_024 {
        return Err(DockerServiceError::user(
            "Choose a local port between 1024 and 65535.",
        ));
    }

    let origin = format!("http://127.0.0.1:{}", settings.port);
    let mut args = vec![
        "container".into(),
        "create".into(),
        "--name".into(),
        LOCAL_CONTAINER_NAME.into(),
        "--label".into(),
        OWNERSHIP_LABEL.into(),
        "--init".into(),
        "--restart".into(),
        "unless-stopped".into(),
        "--publish".into(),
        format!("127.0.0.1:{}:8000", settings.port),
        "--env".into(),
        format!("FRONTEND_ORIGIN={origin}"),
        "--env".into(),
        format!("MOBIUS_ACCOUNT_CLIENT_ORIGIN={origin}"),
        "--env".into(),
        "MOBIUS_ACCOUNT_ORIGIN=https://www.mobius.you".into(),
        "--env".into(),
        "MOBIUS_AGENT_SUDO=1".into(),
        "--mount".into(),
        format!("type=volume,source={LOCAL_DATA_VOLUME},target=/data"),
    ];

    for folder in &settings.shared_folders {
        validate_folder(folder)?;
        let mut mount = format!(
            "type=bind,source={},target={}",
            folder.host_path, folder.container_path
        );
        if folder.read_only {
            mount.push_str(",readonly");
        }
        args.extend(["--mount".into(), mount]);
    }
    args.push(settings.image.clone());
    Ok(args)
}

pub struct DockerService {
    client: Client,
}

impl DockerService {
    pub fn new() -> Self {
        let client = Client::builder()
            .redirect(Policy::none())
            .timeout(Duration::from_secs(5))
            .build()
            .expect("static HTTP client configuration must be valid");
        Self { client }
    }

    async fn docker(
        &self,
        args: &[String],
        timeout_duration: Duration,
    ) -> Result<CommandResult, CommandError> {
        run_command("docker", args, timeout_duration).await
    }

    pub async fn availability(&self, settings: &LocalRuntimeSettings) -> LocalRuntimeStatus {
        let origin = format!("http://127.0.0.1:{}", settings.port);
        let version = self
            .docker(
                &[
                    "version".into(),
                    "--format".into(),
                    "{{.Server.Version}}".into(),
                ],
                Duration::from_secs(10),
            )
            .await;
        match version {
            Ok(version) if version.code == 0 => {
                match self.inspect_container(LOCAL_CONTAINER_NAME).await {
                    Ok(inspection) => LocalRuntimeStatus {
                        docker: if inspection.state != ContainerState::Absent && !inspection.owned {
                            DockerAvailability::Error
                        } else {
                            DockerAvailability::Ready
                        },
                        docker_version: non_empty(version.stdout.trim()),
                        container: inspection.state,
                        detail: if inspection.owned {
                            "Docker is ready and the local Möbius belongs to this app.".into()
                        } else if inspection.state == ContainerState::Absent {
                            "Docker is ready.".into()
                        } else {
                            "A different container is using the Möbius Desktop name. Rename or remove that container before trying again.".into()
                        },
                        origin: inspection
                            .bound_port
                            .map(|port| format!("http://127.0.0.1:{port}"))
                            .unwrap_or(origin),
                        image: settings.image.clone(),
                    },
                    Err(error) => LocalRuntimeStatus {
                        docker: DockerAvailability::Error,
                        docker_version: non_empty(version.stdout.trim()),
                        container: ContainerState::Unknown,
                        detail: error.message,
                        origin,
                        image: settings.image.clone(),
                    },
                }
            }
            Ok(_) => LocalRuntimeStatus {
                docker: DockerAvailability::Stopped,
                docker_version: None,
                container: ContainerState::Unknown,
                detail: "Docker is installed, but its engine is not running.".into(),
                origin,
                image: settings.image.clone(),
            },
            Err(CommandError::Start { source, .. })
                if source.kind() == std::io::ErrorKind::NotFound =>
            {
                LocalRuntimeStatus {
                    docker: DockerAvailability::Missing,
                    docker_version: None,
                    container: ContainerState::Unknown,
                    detail: "A Docker-compatible engine is not installed on this computer.".into(),
                    origin,
                    image: settings.image.clone(),
                }
            }
            Err(_) => LocalRuntimeStatus {
                docker: DockerAvailability::Error,
                docker_version: None,
                container: ContainerState::Unknown,
                detail: "Möbius Desktop could not check Docker.".into(),
                origin,
                image: settings.image.clone(),
            },
        }
    }

    async fn inspect_container(
        &self,
        name: &str,
    ) -> Result<ContainerInspection, DockerServiceError> {
        let result = self
            .docker(
                &["container".into(), "inspect".into(), name.into()],
                Duration::from_secs(10),
            )
            .await
            .map_err(command_error)?;
        if result.code != 0 {
            let detail = clean_detail(&result).to_lowercase();
            if detail.contains("no such container") || detail.contains("not found") {
                return Ok(ContainerInspection {
                    owned: false,
                    state: ContainerState::Absent,
                    bound_port: None,
                });
            }
            return Err(DockerServiceError::with_detail(
                "Docker could not inspect the local Möbius.",
                clean_detail(&result),
            ));
        }

        let payload: Value = serde_json::from_str(&result.stdout).map_err(|_| {
            DockerServiceError::user("Docker returned an unreadable container description.")
        })?;
        let Some(container) = payload.as_array().and_then(|items| items.first()) else {
            return Err(DockerServiceError::user(
                "Docker returned an unreadable container description.",
            ));
        };
        let owned = container
            .pointer("/Config/Labels/you.mobius.desktop.managed")
            .and_then(Value::as_str)
            == Some("true");
        let state = match container.pointer("/State/Status").and_then(Value::as_str) {
            Some("running") => ContainerState::Running,
            Some("created") => ContainerState::Created,
            Some("exited") => ContainerState::Stopped,
            _ => ContainerState::Unknown,
        };
        let bound_port = container
            .pointer("/HostConfig/PortBindings/8000~1tcp/0/HostPort")
            .and_then(Value::as_str)
            .and_then(|port| port.parse().ok());
        Ok(ContainerInspection {
            owned,
            state,
            bound_port,
        })
    }

    async fn require_docker(
        &self,
        settings: &LocalRuntimeSettings,
    ) -> Result<(), DockerServiceError> {
        let status = self.availability(settings).await;
        match status.docker {
            DockerAvailability::Ready => Ok(()),
            DockerAvailability::Missing => Err(DockerServiceError::user(
                "Install a Docker-compatible engine before starting a local Möbius.",
            )),
            _ => Err(DockerServiceError::user("Start Docker, then try again.")),
        }
    }

    async fn pull_image(&self, image: &str) -> Result<ImageSource, DockerServiceError> {
        let pull = self
            .docker(
                &["image".into(), "pull".into(), image.into()],
                Duration::from_secs(10 * 60),
            )
            .await
            .map_err(command_error)?;
        if pull.code == 0 {
            return Ok(ImageSource::Downloaded);
        }
        let installed = self
            .docker(
                &["image".into(), "inspect".into(), image.into()],
                Duration::from_secs(20),
            )
            .await
            .map_err(command_error)?;
        if installed.code == 0 {
            return Ok(ImageSource::Cached);
        }
        Err(DockerServiceError::with_detail(
            "Möbius could not be downloaded.",
            clean_detail(&pull),
        ))
    }

    async fn remove_owned_container(&self, name: &str) -> Result<(), DockerServiceError> {
        let inspection = self.inspect_container(name).await?;
        if inspection.state == ContainerState::Absent {
            return Ok(());
        }
        if !inspection.owned {
            return Err(DockerServiceError::with_detail(
                format!("Möbius Desktop will not remove the container named “{name}”."),
                "That container was not created by Möbius Desktop.",
            ));
        }
        let result = self
            .docker(
                &[
                    "container".into(),
                    "rm".into(),
                    "--force".into(),
                    name.into(),
                ],
                Duration::from_secs(60),
            )
            .await
            .map_err(command_error)?;
        if result.code != 0 {
            return Err(DockerServiceError::with_detail(
                "Docker could not remove an old Möbius Desktop container.",
                clean_detail(&result),
            ));
        }
        Ok(())
    }

    async fn rename_container(&self, from: &str, to: &str) -> Result<(), DockerServiceError> {
        let result = self
            .docker(
                &["container".into(), "rename".into(), from.into(), to.into()],
                Duration::from_secs(30),
            )
            .await
            .map_err(command_error)?;
        if result.code != 0 {
            return Err(DockerServiceError::with_detail(
                "Docker could not preserve the previous local Möbius container.",
                clean_detail(&result),
            ));
        }
        Ok(())
    }

    async fn start_named_container(&self, name: &str) -> Result<(), DockerServiceError> {
        let result = self
            .docker(
                &["container".into(), "start".into(), name.into()],
                Duration::from_secs(60),
            )
            .await
            .map_err(command_error)?;
        if result.code != 0 {
            return Err(DockerServiceError::with_detail(
                "Docker could not start the local Möbius.",
                clean_detail(&result),
            ));
        }
        Ok(())
    }

    async fn stop_named_container(&self, name: &str) -> Result<(), DockerServiceError> {
        let result = self
            .docker(
                &[
                    "container".into(),
                    "stop".into(),
                    "--time".into(),
                    "15".into(),
                    name.into(),
                ],
                Duration::from_secs(45),
            )
            .await
            .map_err(command_error)?;
        if result.code != 0 {
            return Err(DockerServiceError::with_detail(
                "Docker could not stop the local Möbius.",
                clean_detail(&result),
            ));
        }
        Ok(())
    }

    async fn is_ready(&self, origin: &str) -> bool {
        let Ok(response) = self.client.get(format!("{origin}/api/ready")).send().await else {
            return false;
        };
        if !response.status().is_success() {
            return false;
        }
        response
            .json::<Value>()
            .await
            .is_ok_and(|payload| payload.get("status").and_then(Value::as_str) == Some("ready"))
    }

    async fn recover_interrupted_replacement(
        &self,
        settings: &LocalRuntimeSettings,
    ) -> Result<ContainerInspection, DockerServiceError> {
        let current = self.inspect_container(LOCAL_CONTAINER_NAME).await?;
        let previous = self.inspect_container(PREVIOUS_CONTAINER_NAME).await?;
        if previous.state == ContainerState::Absent {
            return Ok(current);
        }
        if !previous.owned {
            return Err(DockerServiceError::with_detail(
                "A different Docker container is using Möbius Desktop’s recovery name.",
                format!("Rename or remove “{PREVIOUS_CONTAINER_NAME}” before trying again."),
            ));
        }

        if current.state != ContainerState::Absent {
            if !current.owned {
                return Err(DockerServiceError::user(
                    "Möbius Desktop found an interrupted update beside a container it does not own.",
                ));
            }
            let port = current.bound_port.unwrap_or(settings.port);
            let origin = format!("http://127.0.0.1:{port}");
            if current.state == ContainerState::Running && self.is_ready(&origin).await {
                self.remove_owned_container(PREVIOUS_CONTAINER_NAME).await?;
                return Ok(current);
            }
            self.remove_owned_container(LOCAL_CONTAINER_NAME).await?;
        }

        self.rename_container(PREVIOUS_CONTAINER_NAME, LOCAL_CONTAINER_NAME)
            .await?;
        self.start_named_container(LOCAL_CONTAINER_NAME).await?;
        self.inspect_container(LOCAL_CONTAINER_NAME).await
    }

    async fn restore_previous_container(
        &self,
        should_restart: bool,
    ) -> Result<(), DockerServiceError> {
        self.remove_owned_container(LOCAL_CONTAINER_NAME).await?;
        let previous = self.inspect_container(PREVIOUS_CONTAINER_NAME).await?;
        if previous.state == ContainerState::Absent {
            return Ok(());
        }
        if !previous.owned {
            return Err(DockerServiceError::user(
                "Möbius Desktop could not restore the previous container because its recovery name is now owned by something else.",
            ));
        }
        self.rename_container(PREVIOUS_CONTAINER_NAME, LOCAL_CONTAINER_NAME)
            .await?;
        if should_restart {
            self.start_named_container(LOCAL_CONTAINER_NAME).await?;
        }
        Ok(())
    }

    async fn with_rollback_detail(
        &self,
        original: DockerServiceError,
        should_restart: bool,
    ) -> DockerServiceError {
        match self.restore_previous_container(should_restart).await {
            Ok(()) => original,
            Err(rollback) => DockerServiceError::with_detail(
                original.message,
                format!(
                    "{}\nMöbius Desktop also could not restore the previous container: {} {}",
                    original.technical_detail, rollback.message, rollback.technical_detail
                )
                .trim()
                .to_owned(),
            ),
        }
    }

    async fn wait_until_ready(&self, origin: &str) -> Result<(), DockerServiceError> {
        for _ in 0..120 {
            if self.is_ready(origin).await {
                return Ok(());
            }
            sleep(Duration::from_millis(1_500)).await;
        }
        let logs = self
            .docker(
                &[
                    "container".into(),
                    "logs".into(),
                    "--tail".into(),
                    "80".into(),
                    LOCAL_CONTAINER_NAME.into(),
                ],
                Duration::from_secs(20),
            )
            .await
            .map_err(command_error)?;
        Err(DockerServiceError::with_detail(
            "The local Möbius started, but did not become ready in time.",
            clean_detail(&logs),
        ))
    }

    pub async fn start<F>(
        &self,
        mut settings: LocalRuntimeSettings,
        mut on_progress: F,
    ) -> Result<(LocalRuntimeStatus, LocalRuntimeSettings), DockerServiceError>
    where
        F: FnMut(LocalProgressPhase),
    {
        on_progress(LocalProgressPhase::CheckingDocker);
        self.require_docker(&settings).await?;
        require_folder_sources(&settings.shared_folders)?;
        let existing = self.recover_interrupted_replacement(&settings).await?;
        if existing.state != ContainerState::Absent && !existing.owned {
            return Err(DockerServiceError::with_detail(
                "A different Docker container is already named “mobius-desktop”.",
                "Rename or remove that container before Möbius Desktop manages this name.",
            ));
        }

        settings.port = if existing.owned
            && existing.state == ContainerState::Running
            && existing.bound_port == Some(settings.port)
        {
            settings.port
        } else {
            available_port(settings.port).await?
        };
        let create_arguments = build_create_arguments(&settings)?;

        on_progress(LocalProgressPhase::Downloading);
        let image_source = self.pull_image(&settings.image).await?;

        on_progress(LocalProgressPhase::PreservingData);
        let volume = self
            .docker(
                &["volume".into(), "create".into(), LOCAL_DATA_VOLUME.into()],
                Duration::from_secs(30),
            )
            .await
            .map_err(command_error)?;
        if volume.code != 0 {
            return Err(DockerServiceError::with_detail(
                "Docker could not prepare persistent local data.",
                clean_detail(&volume),
            ));
        }
        let restart_previous = existing.state == ContainerState::Running;
        if existing.state != ContainerState::Absent {
            if restart_previous {
                self.stop_named_container(LOCAL_CONTAINER_NAME).await?;
            }
            if let Err(error) = self
                .rename_container(LOCAL_CONTAINER_NAME, PREVIOUS_CONTAINER_NAME)
                .await
            {
                if restart_previous {
                    let _ = self.start_named_container(LOCAL_CONTAINER_NAME).await;
                }
                return Err(error);
            }
        }

        on_progress(LocalProgressPhase::Creating);
        let create = match self
            .docker(&create_arguments, Duration::from_secs(10 * 60))
            .await
        {
            Ok(result) => result,
            Err(error) => {
                let error = command_error(error);
                return Err(self.with_rollback_detail(error, restart_previous).await);
            }
        };
        if create.code != 0 {
            let error = DockerServiceError::with_detail(
                "Docker could not create the local Möbius. The previous container was kept.",
                clean_detail(&create),
            );
            return Err(self.with_rollback_detail(error, restart_previous).await);
        }

        on_progress(LocalProgressPhase::Starting);
        if let Err(error) = self.start_named_container(LOCAL_CONTAINER_NAME).await {
            return Err(self.with_rollback_detail(error, restart_previous).await);
        }

        let origin = format!("http://127.0.0.1:{}", settings.port);
        on_progress(LocalProgressPhase::Waiting);
        if let Err(error) = self.wait_until_ready(&origin).await {
            return Err(self.with_rollback_detail(error, restart_previous).await);
        }
        self.remove_owned_container(PREVIOUS_CONTAINER_NAME).await?;
        on_progress(LocalProgressPhase::Ready);
        Ok((
            LocalRuntimeStatus {
                docker: DockerAvailability::Ready,
                docker_version: None,
                container: ContainerState::Running,
                detail: if image_source == ImageSource::Cached {
                    "Your local Möbius is ready using the previously downloaded image. It continues while Docker runs."
                } else {
                    "Your local Möbius is ready and continues while Docker runs."
                }
                .into(),
                origin,
                image: settings.image.clone(),
            },
            settings,
        ))
    }

    pub async fn stop(
        &self,
        settings: &LocalRuntimeSettings,
    ) -> Result<LocalRuntimeStatus, DockerServiceError> {
        self.require_docker(settings).await?;
        let inspection = self.inspect_container(LOCAL_CONTAINER_NAME).await?;
        let origin = format!("http://127.0.0.1:{}", settings.port);
        if inspection.state == ContainerState::Absent {
            return Ok(LocalRuntimeStatus {
                docker: DockerAvailability::Ready,
                docker_version: None,
                container: ContainerState::Absent,
                detail: "No local Möbius container exists yet.".into(),
                origin,
                image: settings.image.clone(),
            });
        }
        if !inspection.owned {
            return Err(DockerServiceError::user(
                "Möbius Desktop will not stop a container it did not create.",
            ));
        }
        self.stop_named_container(LOCAL_CONTAINER_NAME).await?;
        Ok(LocalRuntimeStatus {
            docker: DockerAvailability::Ready,
            docker_version: None,
            container: ContainerState::Stopped,
            detail: "The local Möbius is stopped. Its Docker data and folder choices were kept."
                .into(),
            origin,
            image: settings.image.clone(),
        })
    }
}

fn non_empty(value: &str) -> Option<String> {
    (!value.is_empty()).then(|| value.to_owned())
}

fn command_error(error: CommandError) -> DockerServiceError {
    DockerServiceError::with_detail("Docker could not complete that action.", error.to_string())
}

async fn available_port(preferred: u16) -> Result<u16, DockerServiceError> {
    let candidates = std::iter::once(preferred)
        .chain((1..=20).filter_map(|offset| DEFAULT_LOCAL_PORT.checked_add(offset)));
    for port in candidates {
        if let Ok(listener) = TcpListener::bind(("127.0.0.1", port)).await {
            drop(listener);
            return Ok(port);
        }
    }
    Err(DockerServiceError::user(
        "Möbius Desktop could not find an available local port.",
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::DEFAULT_LOCAL_IMAGE;

    fn settings() -> LocalRuntimeSettings {
        LocalRuntimeSettings {
            image: DEFAULT_LOCAL_IMAGE.into(),
            port: DEFAULT_LOCAL_PORT,
            shared_folders: vec![SharedFolder {
                id: "projects".into(),
                name: "Projects".into(),
                host_path: "/home/person/Projects".into(),
                container_path: "/data/shared/desktop/projects-a1b2c3".into(),
                read_only: true,
            }],
        }
    }

    #[test]
    fn create_arguments_keep_the_service_on_loopback_and_preserve_data() {
        let args = build_create_arguments(&settings()).unwrap();
        assert!(
            args.windows(2)
                .any(|pair| pair == ["--publish", "127.0.0.1:15123:8000"])
        );
        assert!(
            args.iter()
                .any(|arg| arg == "type=volume,source=mobius-desktop-data,target=/data")
        );
        assert!(args.iter().any(|arg| arg == "type=bind,source=/home/person/Projects,target=/data/shared/desktop/projects-a1b2c3,readonly"));
        assert_eq!(args.last().unwrap(), DEFAULT_LOCAL_IMAGE);
    }

    #[test]
    fn write_access_is_explicit_and_container_destinations_are_confined() {
        let mut writable = settings();
        writable.shared_folders[0].read_only = false;
        let args = build_create_arguments(&writable).unwrap();
        assert!(args.iter().any(|arg| arg == "type=bind,source=/home/person/Projects,target=/data/shared/desktop/projects-a1b2c3"));

        writable.shared_folders[0].container_path = "/etc".into();
        assert!(build_create_arguments(&writable).is_err());
        writable.shared_folders[0].container_path = "/data/shared/desktop/../../etc".into();
        assert!(build_create_arguments(&writable).is_err());
    }

    #[test]
    fn windows_paths_are_accepted_without_shell_interpolation() {
        let mut windows = settings();
        windows.shared_folders[0].host_path = r"C:\Users\person\Projects".into();
        let args = build_create_arguments(&windows).unwrap();
        assert!(
            args.iter()
                .any(|arg| arg.contains(r"source=C:\Users\person\Projects"))
        );
    }
}
