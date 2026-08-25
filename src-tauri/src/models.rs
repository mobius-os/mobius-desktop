use serde::{Deserialize, Serialize};

pub const STATE_VERSION: u8 = 2;
pub const DEFAULT_LOCAL_PORT: u16 = 15_123;
pub const DEFAULT_LOCAL_IMAGE: &str = "ghcr.io/mobius-os/mobius@sha256:8a1c8f876fb598c1a2f130dfe2333ef2b9e6c52876fbb7749e7524e39bcbef5a";
pub const SHARED_FOLDER_ROOT: &str = "/data/shared/desktop/";

pub fn is_safe_shared_folder_destination(value: &str) -> bool {
    value.strip_prefix(SHARED_FOLDER_ROOT).is_some_and(|name| {
        !name.is_empty()
            && name.len() <= 80
            && name
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
    })
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum InstanceKind {
    Hosted,
    Existing,
    Local,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SharedFolder {
    pub id: String,
    pub name: String,
    pub host_path: String,
    pub container_path: String,
    pub read_only: bool,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedInstance {
    pub id: String,
    pub kind: InstanceKind,
    pub name: String,
    pub origin: String,
    pub created_at: String,
    pub last_opened_at: Option<String>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalRuntimeSettings {
    pub image: String,
    pub port: u16,
    pub shared_folders: Vec<SharedFolder>,
}

impl Default for LocalRuntimeSettings {
    fn default() -> Self {
        Self {
            image: DEFAULT_LOCAL_IMAGE.to_owned(),
            port: DEFAULT_LOCAL_PORT,
            shared_folders: Vec::new(),
        }
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopState {
    pub version: u8,
    pub instances: Vec<SavedInstance>,
    pub local_runtime: LocalRuntimeSettings,
}

impl Default for DesktopState {
    fn default() -> Self {
        Self {
            version: STATE_VERSION,
            instances: Vec::new(),
            local_runtime: LocalRuntimeSettings::default(),
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum DockerAvailability {
    Ready,
    Missing,
    Stopped,
    Error,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ContainerState {
    Absent,
    Created,
    Running,
    Stopped,
    Unknown,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalRuntimeStatus {
    pub docker: DockerAvailability,
    pub docker_version: Option<String>,
    pub container: ContainerState,
    pub detail: String,
    pub origin: String,
    pub image: String,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum LocalProgressPhase {
    CheckingDocker,
    Downloading,
    PreservingData,
    Creating,
    Starting,
    Waiting,
    Ready,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveInstanceInput {
    pub kind: InstanceKind,
    pub name: String,
    pub url: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderSelection {
    pub id: String,
    pub read_only: bool,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartLocalInput {
    pub folders: Vec<FolderSelection>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopDiagnostics {
    pub app_version: String,
    pub operating_system: String,
    pub architecture: String,
    pub state_version: u8,
    pub image: String,
    pub port: u16,
    pub docker: DockerAvailability,
    pub docker_version: Option<String>,
    pub container: ContainerState,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheck {
    pub configured: bool,
    pub current_version: String,
    pub available: bool,
    pub version: Option<String>,
    pub body: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInstallProgress {
    pub downloaded_bytes: u64,
    pub total_bytes: Option<u64>,
}
