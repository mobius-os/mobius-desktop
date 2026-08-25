use std::{
    collections::HashSet,
    path::PathBuf,
    sync::{Mutex, MutexGuard},
};

use tauri::{AppHandle, Emitter, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_updater::{Error as UpdaterError, UpdaterExt};
use uuid::Uuid;

use crate::{
    docker::DockerService,
    models::{
        DesktopDiagnostics, DesktopState, FolderSelection, InstanceKind, LocalProgressPhase,
        LocalRuntimeStatus, SHARED_FOLDER_ROOT, STATE_VERSION, SaveInstanceInput, SavedInstance,
        SharedFolder, StartLocalInput, UpdateCheck, UpdateInstallProgress,
    },
    state::StateStore,
    url_policy::{is_safe_external_url, normalize_instance_origin, verify_mobius_origin},
    windows,
};

pub struct AppRuntime {
    pub store: Mutex<StateStore>,
    pub docker: DockerService,
}

fn require_launcher(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == "launcher" {
        Ok(())
    } else {
        Err("This desktop action is available only to the packaged launcher.".into())
    }
}

fn lock_store(runtime: &AppRuntime) -> Result<MutexGuard<'_, StateStore>, String> {
    runtime
        .store
        .lock()
        .map_err(|_| "Möbius Desktop could not access its saved deployments.".into())
}

fn clean_name(value: &str) -> Result<String, String> {
    let name = value.trim();
    if name.is_empty() || name.chars().count() > 80 {
        return Err("Use a name between 1 and 80 characters.".into());
    }
    Ok(name.to_owned())
}

fn safe_folder_name(value: &str) -> String {
    let mut cleaned = String::new();
    let mut separator = false;
    for character in value.chars() {
        if character.is_ascii_alphanumeric() {
            if separator && !cleaned.is_empty() {
                cleaned.push('-');
            }
            cleaned.push(character.to_ascii_lowercase());
            separator = false;
        } else {
            separator = true;
        }
        if cleaned.len() >= 32 {
            break;
        }
    }
    let cleaned = cleaned
        .trim_matches('-')
        .to_owned()
        .chars()
        .take(32)
        .collect::<String>();
    if cleaned.is_empty() {
        "folder".to_owned()
    } else {
        cleaned
    }
}

#[tauri::command]
pub fn get_state(
    window: WebviewWindow,
    runtime: State<AppRuntime>,
) -> Result<DesktopState, String> {
    require_launcher(&window)?;
    lock_store(runtime.inner())?
        .read()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn save_instance(
    window: WebviewWindow,
    runtime: State<'_, AppRuntime>,
    input: SaveInstanceInput,
) -> Result<SavedInstance, String> {
    require_launcher(&window)?;
    if !matches!(input.kind, InstanceKind::Hosted | InstanceKind::Existing) {
        return Err("Choose a supported deployment type.".into());
    }
    let origin = verify_mobius_origin(&input.url)
        .await
        .map_err(|error| error.to_string())?;
    let name = clean_name(&input.name)?;
    let mut store = lock_store(runtime.inner())?;
    let state = store.read().map_err(|error| error.to_string())?;
    let matching = state
        .instances
        .iter()
        .find(|instance| instance.origin == origin);
    let instance = SavedInstance {
        id: matching
            .map(|instance| instance.id.clone())
            .unwrap_or_else(|| Uuid::new_v4().to_string()),
        kind: input.kind,
        name,
        origin,
        created_at: matching
            .map(|instance| instance.created_at.clone())
            .unwrap_or_else(|| chrono::Utc::now().to_rfc3339()),
        last_opened_at: matching.and_then(|instance| instance.last_opened_at.clone()),
    };
    store
        .upsert_instance(instance.clone())
        .map_err(|error| error.to_string())?;
    Ok(instance)
}

#[tauri::command]
pub fn remove_instance(
    window: WebviewWindow,
    runtime: State<AppRuntime>,
    id: String,
) -> Result<DesktopState, String> {
    require_launcher(&window)?;
    if id.is_empty() {
        return Err("Choose a saved Möbius.".into());
    }
    lock_store(runtime.inner())?
        .remove_instance(&id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn open_instance(
    app: AppHandle,
    window: WebviewWindow,
    runtime: State<AppRuntime>,
    id: String,
) -> Result<(), String> {
    require_launcher(&window)?;
    let instance = lock_store(runtime.inner())?
        .mark_opened(&id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "That saved Möbius is no longer available.".to_owned())?;
    windows::open_instance(&app, &instance)
}

#[tauri::command]
pub fn open_instance_in_browser(
    app: AppHandle,
    window: WebviewWindow,
    runtime: State<AppRuntime>,
    id: String,
) -> Result<(), String> {
    require_launcher(&window)?;
    let state = lock_store(runtime.inner())?
        .read()
        .map_err(|error| error.to_string())?;
    let instance = state
        .instances
        .iter()
        .find(|candidate| candidate.id == id)
        .ok_or_else(|| "That saved Möbius is no longer available.".to_owned())?;
    let origin = normalize_instance_origin(&instance.origin).map_err(|error| error.to_string())?;
    app.opener()
        .open_url(format!("{origin}/shell/"), None::<&str>)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn open_hosted_setup(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    require_launcher(&window)?;
    app.opener()
        .open_url("https://www.mobius.you/", None::<&str>)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn open_external(app: AppHandle, window: WebviewWindow, url: String) -> Result<(), String> {
    require_launcher(&window)?;
    if !is_safe_external_url(&url) {
        return Err("External help links must use HTTPS.".into());
    }
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn choose_folder(
    app: AppHandle,
    window: WebviewWindow,
    runtime: State<AppRuntime>,
) -> Result<Option<SharedFolder>, String> {
    require_launcher(&window)?;
    let selected = app
        .dialog()
        .file()
        .set_title("Share a folder with local Möbius")
        .set_parent(&window)
        .blocking_pick_folder();
    let Some(selected) = selected else {
        return Ok(None);
    };
    let host_path: PathBuf = selected
        .into_path()
        .map_err(|_| "That folder does not have a local filesystem path.".to_owned())?;
    let name = host_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("Folder")
        .to_owned();
    let id = Uuid::new_v4().to_string();
    let folder = SharedFolder {
        id: id.clone(),
        name: name.clone(),
        host_path: host_path.to_string_lossy().into_owned(),
        container_path: format!(
            "{SHARED_FOLDER_ROOT}{}-{}",
            safe_folder_name(&name),
            &id[..6]
        ),
        read_only: true,
    };
    lock_store(runtime.inner())?
        .save_folder_grant(folder)
        .map(Some)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn get_local_status(
    window: WebviewWindow,
    runtime: State<'_, AppRuntime>,
) -> Result<LocalRuntimeStatus, String> {
    require_launcher(&window)?;
    let settings = lock_store(runtime.inner())?
        .read()
        .map_err(|error| error.to_string())?
        .local_runtime;
    Ok(runtime.docker.availability(&settings).await)
}

fn resolve_folder_selections(
    state: &DesktopState,
    selections: &[FolderSelection],
) -> Result<Vec<SharedFolder>, String> {
    let mut seen = HashSet::new();
    selections
        .iter()
        .map(|selection| {
            if !seen.insert(selection.id.as_str()) {
                return Err("A shared folder was selected more than once.".into());
            }
            let mut folder = state
                .local_runtime
                .shared_folders
                .iter()
                .find(|folder| folder.id == selection.id)
                .cloned()
                .ok_or_else(|| {
                    "Choose every shared folder through the operating system picker.".to_owned()
                })?;
            folder.read_only = selection.read_only;
            Ok(folder)
        })
        .collect()
}

#[tauri::command]
pub async fn start_local(
    app: AppHandle,
    window: WebviewWindow,
    runtime: State<'_, AppRuntime>,
    input: StartLocalInput,
) -> Result<SavedInstance, String> {
    require_launcher(&window)?;
    let state = lock_store(runtime.inner())?
        .read()
        .map_err(|error| error.to_string())?;
    let mut settings = state.local_runtime.clone();
    settings.shared_folders = resolve_folder_selections(&state, &input.folders)?;

    let progress_app = app.clone();
    let (status, settings) = runtime
        .docker
        .start(settings, move |phase: LocalProgressPhase| {
            let _ = progress_app.emit_to("launcher", "local-progress", phase);
        })
        .await
        .map_err(|error| {
            if error.technical_detail.is_empty() {
                error.message
            } else {
                format!("{}\n\n{}", error.message, error.technical_detail)
            }
        })?;

    let mut store = lock_store(runtime.inner())?;
    store
        .save_local_runtime(settings)
        .map_err(|error| error.to_string())?;
    let current = store
        .read()
        .map_err(|error| error.to_string())?
        .instances
        .into_iter()
        .find(|instance| instance.kind == InstanceKind::Local);
    let instance = SavedInstance {
        id: current
            .as_ref()
            .map(|instance| instance.id.clone())
            .unwrap_or_else(|| Uuid::new_v4().to_string()),
        kind: InstanceKind::Local,
        name: current
            .as_ref()
            .map(|instance| instance.name.clone())
            .unwrap_or_else(|| "Local Möbius".into()),
        origin: normalize_instance_origin(&status.origin).map_err(|error| error.to_string())?,
        created_at: current
            .as_ref()
            .map(|instance| instance.created_at.clone())
            .unwrap_or_else(|| chrono::Utc::now().to_rfc3339()),
        last_opened_at: current.and_then(|instance| instance.last_opened_at),
    };
    store
        .upsert_instance(instance.clone())
        .map_err(|error| error.to_string())?;
    Ok(instance)
}

#[tauri::command]
pub async fn stop_local(
    window: WebviewWindow,
    runtime: State<'_, AppRuntime>,
) -> Result<LocalRuntimeStatus, String> {
    require_launcher(&window)?;
    let settings = lock_store(runtime.inner())?
        .read()
        .map_err(|error| error.to_string())?
        .local_runtime;
    runtime.docker.stop(&settings).await.map_err(|error| {
        if error.technical_detail.is_empty() {
            error.message
        } else {
            format!("{}\n\n{}", error.message, error.technical_detail)
        }
    })
}

#[tauri::command]
pub async fn get_diagnostics(
    app: AppHandle,
    window: WebviewWindow,
    runtime: State<'_, AppRuntime>,
) -> Result<DesktopDiagnostics, String> {
    require_launcher(&window)?;
    let state = lock_store(runtime.inner())?
        .read()
        .map_err(|error| error.to_string())?;
    let status = runtime.docker.availability(&state.local_runtime).await;
    Ok(DesktopDiagnostics {
        app_version: app.package_info().version.to_string(),
        operating_system: std::env::consts::OS.into(),
        architecture: std::env::consts::ARCH.into(),
        state_version: STATE_VERSION,
        image: state.local_runtime.image,
        port: state.local_runtime.port,
        docker: status.docker,
        docker_version: status.docker_version,
        container: status.container,
    })
}

#[tauri::command]
pub async fn check_for_update(
    app: AppHandle,
    window: WebviewWindow,
) -> Result<UpdateCheck, String> {
    require_launcher(&window)?;
    let current_version = app.package_info().version.to_string();
    let updater = match app.updater() {
        Ok(updater) => updater,
        Err(UpdaterError::EmptyEndpoints) => {
            return Ok(UpdateCheck {
                configured: false,
                current_version,
                available: false,
                version: None,
                body: None,
            });
        }
        Err(error) => {
            return Err(format!(
                "Möbius Desktop could not prepare its updater. {error}"
            ));
        }
    };
    let update = updater
        .check()
        .await
        .map_err(|error| format!("Möbius Desktop could not check for updates. {error}"))?;
    Ok(match update {
        Some(update) => UpdateCheck {
            configured: true,
            current_version,
            available: true,
            version: Some(update.version),
            body: update
                .body
                .map(|body| body.chars().take(2_000).collect::<String>()),
        },
        None => UpdateCheck {
            configured: true,
            current_version,
            available: false,
            version: None,
            body: None,
        },
    })
}

#[tauri::command]
pub async fn install_update(
    app: AppHandle,
    window: WebviewWindow,
    expected_version: String,
) -> Result<(), String> {
    require_launcher(&window)?;
    if expected_version.is_empty() || expected_version.len() > 64 {
        return Err("Check for updates again before installing.".into());
    }
    let updater = app.updater().map_err(|error| match error {
        UpdaterError::EmptyEndpoints => {
            "Updates are not configured for this development build.".to_owned()
        }
        error => format!("Möbius Desktop could not prepare its updater. {error}"),
    })?;
    let update = updater
        .check()
        .await
        .map_err(|error| format!("Möbius Desktop could not check for updates. {error}"))?
        .ok_or_else(|| "Möbius Desktop is already up to date.".to_owned())?;
    if update.version != expected_version {
        return Err(
            "The available version changed. Check for updates again before installing.".into(),
        );
    }
    let progress_app = app.clone();
    let mut downloaded_bytes = 0_u64;
    update
        .download_and_install(
            move |chunk_bytes, total_bytes| {
                downloaded_bytes = downloaded_bytes.saturating_add(chunk_bytes as u64);
                let _ = progress_app.emit_to(
                    "launcher",
                    "update-progress",
                    UpdateInstallProgress {
                        downloaded_bytes,
                        total_bytes,
                    },
                );
            },
            || {},
        )
        .await
        .map_err(|error| format!("Möbius Desktop could not install the update. {error}"))?;
    app.restart()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{DesktopState, LocalRuntimeSettings};

    #[test]
    fn folder_selections_cannot_invent_host_paths() {
        let state = DesktopState {
            local_runtime: LocalRuntimeSettings {
                shared_folders: vec![SharedFolder {
                    id: "grant".into(),
                    name: "Projects".into(),
                    host_path: "/home/person/Projects".into(),
                    container_path: "/data/shared/desktop/projects-a1b2c3".into(),
                    read_only: true,
                }],
                ..LocalRuntimeSettings::default()
            },
            ..DesktopState::default()
        };
        let selected = resolve_folder_selections(
            &state,
            &[FolderSelection {
                id: "grant".into(),
                read_only: false,
            }],
        )
        .unwrap();
        assert_eq!(selected[0].host_path, "/home/person/Projects");
        assert!(!selected[0].read_only);
        assert!(
            resolve_folder_selections(
                &state,
                &[FolderSelection {
                    id: "invented".into(),
                    read_only: false,
                }]
            )
            .is_err()
        );
    }

    #[test]
    fn new_folder_names_are_safe_for_container_destinations() {
        assert_eq!(safe_folder_name(" Client work / 2026 "), "client-work-2026");
        assert_eq!(safe_folder_name("🎉"), "folder");
    }
}
