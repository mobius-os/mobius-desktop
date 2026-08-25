use std::{
    fs::{self, File},
    io::{self, Write},
    path::{Path, PathBuf},
};

use tempfile::NamedTempFile;
use thiserror::Error;

use crate::{
    models::{
        DEFAULT_LOCAL_IMAGE, DesktopState, InstanceKind, LocalRuntimeSettings, STATE_VERSION,
        SavedInstance, SharedFolder, is_safe_shared_folder_destination,
    },
    url_policy::normalize_instance_origin,
};

#[derive(Debug, Error)]
pub enum StateError {
    #[error("Möbius Desktop could not read its saved deployments.")]
    Read(#[source] io::Error),
    #[error("Möbius Desktop found damaged saved state and left the original file untouched.")]
    Corrupt(#[source] serde_json::Error),
    #[error("This saved state was written by a newer Möbius Desktop (format {0}).")]
    NewerVersion(u64),
    #[error("Möbius Desktop could not encode its deployment state.")]
    Serialize(#[source] serde_json::Error),
    #[error("Möbius Desktop could not save its deployment state.")]
    Write(#[source] io::Error),
}

pub struct StateStore {
    file_path: PathBuf,
    legacy_paths: Vec<PathBuf>,
    state: Option<DesktopState>,
}

impl StateStore {
    #[cfg(test)]
    pub fn new(file_path: PathBuf) -> Self {
        Self {
            file_path,
            legacy_paths: Vec::new(),
            state: None,
        }
    }

    pub fn with_legacy_paths(file_path: PathBuf, legacy_paths: Vec<PathBuf>) -> Self {
        Self {
            file_path,
            legacy_paths,
            state: None,
        }
    }

    pub fn read(&mut self) -> Result<DesktopState, StateError> {
        if let Some(state) = &self.state {
            return Ok(state.clone());
        }

        let state = match fs::read_to_string(&self.file_path) {
            Ok(raw) => {
                let value =
                    serde_json::from_str::<serde_json::Value>(&raw).map_err(StateError::Corrupt)?;
                normalize_state(value)?
            }
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                let mut migrated = None;
                for legacy_path in &self.legacy_paths {
                    match fs::read_to_string(legacy_path) {
                        Ok(raw) => {
                            let value = serde_json::from_str::<serde_json::Value>(&raw)
                                .map_err(StateError::Corrupt)?;
                            migrated = Some(normalize_state(value)?);
                            break;
                        }
                        Err(error) if error.kind() == io::ErrorKind::NotFound => continue,
                        Err(error) => return Err(StateError::Read(error)),
                    }
                }
                match migrated {
                    Some(state) => return self.write(state),
                    None => DesktopState::default(),
                }
            }
            Err(error) => return Err(StateError::Read(error)),
        };
        self.state = Some(state.clone());
        Ok(state)
    }

    pub fn write(&mut self, state: DesktopState) -> Result<DesktopState, StateError> {
        let value = serde_json::to_value(state).map_err(StateError::Serialize)?;
        let normalized = normalize_state(value)?;
        let directory = self.file_path.parent().unwrap_or_else(|| Path::new("."));
        fs::create_dir_all(directory).map_err(StateError::Write)?;

        let mut temporary = NamedTempFile::new_in(directory).map_err(StateError::Write)?;
        set_private_permissions(temporary.as_file()).map_err(StateError::Write)?;
        serde_json::to_writer_pretty(&mut temporary, &normalized)
            .map_err(|error| StateError::Write(io::Error::other(error)))?;
        temporary.write_all(b"\n").map_err(StateError::Write)?;
        temporary.as_file().sync_all().map_err(StateError::Write)?;
        temporary
            .persist(&self.file_path)
            .map_err(|error| StateError::Write(error.error))?;
        sync_parent_directory(directory).map_err(StateError::Write)?;
        self.state = Some(normalized.clone());
        Ok(normalized)
    }

    pub fn upsert_instance(&mut self, instance: SavedInstance) -> Result<DesktopState, StateError> {
        let mut state = self.read()?;
        let matching = state.instances.iter().position(|candidate| {
            candidate.id == instance.id
                || (candidate.kind == InstanceKind::Local && instance.kind == InstanceKind::Local)
        });
        if let Some(index) = matching {
            state.instances[index] = instance;
        } else {
            state.instances.push(instance);
        }
        self.write(state)
    }

    pub fn remove_instance(&mut self, id: &str) -> Result<DesktopState, StateError> {
        let mut state = self.read()?;
        state.instances.retain(|instance| instance.id != id);
        self.write(state)
    }

    pub fn save_local_runtime(
        &mut self,
        settings: LocalRuntimeSettings,
    ) -> Result<DesktopState, StateError> {
        let mut state = self.read()?;
        state.local_runtime = settings;
        self.write(state)
    }

    pub fn save_folder_grant(&mut self, folder: SharedFolder) -> Result<SharedFolder, StateError> {
        let mut state = self.read()?;
        if let Some(existing) = state
            .local_runtime
            .shared_folders
            .iter()
            .find(|candidate| candidate.host_path == folder.host_path)
        {
            return Ok(existing.clone());
        }
        state.local_runtime.shared_folders.push(folder.clone());
        self.write(state)?;
        Ok(folder)
    }

    pub fn mark_opened(&mut self, id: &str) -> Result<Option<SavedInstance>, StateError> {
        let mut state = self.read()?;
        let Some(instance) = state
            .instances
            .iter_mut()
            .find(|candidate| candidate.id == id)
        else {
            return Ok(None);
        };
        instance.last_opened_at = Some(chrono::Utc::now().to_rfc3339());
        let opened = instance.clone();
        self.write(state)?;
        Ok(Some(opened))
    }
}

#[cfg(unix)]
fn set_private_permissions(file: &File) -> io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    file.set_permissions(fs::Permissions::from_mode(0o600))
}

#[cfg(not(unix))]
fn set_private_permissions(_file: &File) -> io::Result<()> {
    Ok(())
}

#[cfg(unix)]
fn sync_parent_directory(directory: &Path) -> io::Result<()> {
    File::open(directory)?.sync_all()
}

#[cfg(not(unix))]
fn sync_parent_directory(_directory: &Path) -> io::Result<()> {
    Ok(())
}

fn normalize_state(value: serde_json::Value) -> Result<DesktopState, StateError> {
    let version = value
        .get("version")
        .and_then(serde_json::Value::as_u64)
        .unwrap_or(0);
    if version > u64::from(STATE_VERSION) {
        return Err(StateError::NewerVersion(version));
    }
    let mut state = serde_json::from_value::<DesktopState>(value).map_err(StateError::Corrupt)?;
    state.version = STATE_VERSION;
    state.local_runtime.image = DEFAULT_LOCAL_IMAGE.to_owned();
    if !(1_024..=65_535).contains(&state.local_runtime.port) {
        state.local_runtime.port = crate::models::DEFAULT_LOCAL_PORT;
    }
    state.instances.retain_mut(|instance| {
        let Ok(origin) = normalize_instance_origin(&instance.origin) else {
            return false;
        };
        instance.origin = origin;
        !instance.id.is_empty()
            && !instance.name.trim().is_empty()
            && instance.name.chars().count() <= 80
    });
    state.local_runtime.shared_folders.retain(|folder| {
        !folder.id.is_empty()
            && Path::new(&folder.host_path).is_absolute()
            && is_safe_shared_folder_destination(&folder.container_path)
    });
    Ok(state)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{DEFAULT_LOCAL_PORT, InstanceKind};

    #[test]
    fn persisted_origins_are_revalidated_and_the_image_is_pinned() {
        let state = normalize_state(serde_json::json!({
            "version": 1,
            "instances": [
                {
                    "id": "good",
                    "kind": "existing",
                    "name": "Good",
                    "origin": "https://example.com/shell/",
                    "createdAt": "2026-08-25T00:00:00Z",
                    "lastOpenedAt": null
                },
                {
                    "id": "bad",
                    "kind": "existing",
                    "name": "Bad",
                    "origin": "file:///tmp/unsafe.html",
                    "createdAt": "2026-08-25T00:00:00Z",
                    "lastOpenedAt": null
                }
            ],
            "localRuntime": {
                "image": "ghcr.io/mobius-os/mobius:main",
                "port": 80,
                "sharedFolders": []
            }
        }))
        .unwrap();

        assert_eq!(state.instances.len(), 1);
        assert_eq!(state.instances[0].origin, "https://example.com");
        assert_eq!(state.local_runtime.image, DEFAULT_LOCAL_IMAGE);
        assert_eq!(state.local_runtime.port, DEFAULT_LOCAL_PORT);
        assert_eq!(state.instances[0].kind, InstanceKind::Existing);
    }

    #[test]
    fn state_writes_atomically_and_remains_private() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("state.json");
        let mut store = StateStore::new(path.clone());
        store.write(DesktopState::default()).unwrap();
        let state = store.read().unwrap();
        assert_eq!(state.version, STATE_VERSION);

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(path).unwrap().permissions().mode() & 0o777,
                0o600
            );
        }
    }

    #[test]
    fn corrupt_state_is_not_replaced_with_an_empty_state() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("state.json");
        fs::write(&path, "{not-json").unwrap();
        let mut store = StateStore::new(path.clone());
        assert!(matches!(store.read(), Err(StateError::Corrupt(_))));
        assert_eq!(fs::read_to_string(path).unwrap(), "{not-json");
    }

    #[test]
    fn newer_state_formats_fail_without_downgrading_data() {
        let error = normalize_state(serde_json::json!({
            "version": 99,
            "instances": [],
            "localRuntime": {
                "image": DEFAULT_LOCAL_IMAGE,
                "port": DEFAULT_LOCAL_PORT,
                "sharedFolders": []
            }
        }))
        .unwrap_err();
        assert!(matches!(error, StateError::NewerVersion(99)));
    }

    #[test]
    fn legacy_electron_state_is_copied_forward_without_deleting_the_source() {
        let directory = tempfile::tempdir().unwrap();
        let legacy_path = directory.path().join("electron").join("state.json");
        let new_path = directory.path().join("tauri").join("state.json");
        fs::create_dir_all(legacy_path.parent().unwrap()).unwrap();
        fs::write(
            &legacy_path,
            serde_json::to_vec(&serde_json::json!({
                "version": 1,
                "instances": [],
                "localRuntime": {
                    "image": "ghcr.io/mobius-os/mobius:main",
                    "port": DEFAULT_LOCAL_PORT,
                    "sharedFolders": []
                }
            }))
            .unwrap(),
        )
        .unwrap();
        let mut store = StateStore::with_legacy_paths(new_path.clone(), vec![legacy_path.clone()]);
        let state = store.read().unwrap();
        assert_eq!(state.version, STATE_VERSION);
        assert_eq!(state.local_runtime.image, DEFAULT_LOCAL_IMAGE);
        assert!(new_path.exists());
        assert!(legacy_path.exists());
    }
}
