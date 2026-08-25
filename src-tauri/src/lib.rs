mod command_runner;
mod commands;
mod docker;
mod models;
mod state;
mod url_policy;
mod windows;

use commands::AppRuntime;
use docker::DockerService;
use state::StateStore;
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            windows::show_launcher(app);
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let state_path = app.path().app_data_dir()?.join("state.json");
            let legacy_root = app.path().config_dir()?;
            let legacy_paths = ["Möbius Desktop", "mobius-desktop"]
                .map(|directory| legacy_root.join(directory).join("state.json"))
                .into_iter()
                .filter(|path| path != &state_path)
                .collect();
            app.manage(AppRuntime {
                store: std::sync::Mutex::new(StateStore::with_legacy_paths(
                    state_path,
                    legacy_paths,
                )),
                docker: DockerService::new(),
            });
            windows::show_launcher(app.handle());
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed)
                && window.label().starts_with("instance-")
            {
                windows::show_launcher(window.app_handle());
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_state,
            commands::save_instance,
            commands::remove_instance,
            commands::open_instance,
            commands::open_instance_in_browser,
            commands::open_hosted_setup,
            commands::open_external,
            commands::choose_folder,
            commands::get_local_status,
            commands::start_local,
            commands::stop_local,
            commands::get_diagnostics,
            commands::check_for_update,
            commands::install_update,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Möbius Desktop");
}
