use std::net::TcpListener;
use std::process::Command;
use std::sync::Mutex;
use std::time::Duration;

use tauri::Manager;

mod tray;

/// State holding the sidecar child process and port.
struct SidecarState {
    child: Option<std::process::Child>,
    port: u16,
}

/// Pick a random free TCP port on localhost.
fn pick_free_port() -> u16 {
    let listener = TcpListener::bind("127.0.0.1:0").expect("failed to bind to a free port");
    listener.local_addr().unwrap().port()
}

/// Wait until the Go sidecar is responding on the health endpoint.
fn wait_for_health(port: u16, timeout: Duration) -> Result<(), String> {
    let start = std::time::Instant::now();
    let url = format!("http://127.0.0.1:{}/healthz", port);

    while start.elapsed() < timeout {
        if let Ok(resp) = reqwest::blocking::get(&url) {
            if resp.status().is_success() {
                return Ok(());
            }
        }
        std::thread::sleep(Duration::from_millis(200));
    }

    Err(format!(
        "sidecar did not become healthy within {}s",
        timeout.as_secs()
    ))
}

/// Resolve the path to the sidecar binary.
/// In development, use the Go binary built by `just dev`.
/// In production, use the bundled sidecar next to the Tauri binary.
fn sidecar_path(app: &tauri::AppHandle) -> std::path::PathBuf {
    // In production, the sidecar is in the binaries/ dir next to the app.
    let resource_dir = app
        .path()
        .resource_dir()
        .expect("failed to get resource dir");

    let binary_name = if cfg!(target_os = "windows") {
        "webmail-api.exe"
    } else {
        "webmail-api"
    };

    let sidecar = resource_dir.join("binaries").join(binary_name);
    if sidecar.exists() {
        return sidecar;
    }

    // Fallback: try finding the Go binary in PATH (dev mode).
    which::which("webmail-api").unwrap_or_else(|_| {
        panic!(
            "sidecar binary not found at {:?} or in PATH",
            sidecar
        )
    })
}

pub fn run() {
    let port = pick_free_port();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Focus the main window when a second instance is launched.
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .setup(move |app| {
            let handle = app.handle().clone();

            // Spawn the Go sidecar.
            let sidecar_bin = sidecar_path(&handle);
            let listen_addr = format!("127.0.0.1:{}", port);

            let child = Command::new(&sidecar_bin)
                .env("WEBMAIL_LISTEN_ADDR", &listen_addr)
                .spawn()
                .unwrap_or_else(|e| {
                    panic!("failed to spawn sidecar {:?}: {}", sidecar_bin, e)
                });

            eprintln!("sidecar spawned on port {} (pid {})", port, child.id());

            // Store child process for cleanup.
            app.manage(Mutex::new(SidecarState {
                child: Some(child),
                port,
            }));

            // Wait for the sidecar to become healthy.
            wait_for_health(port, Duration::from_secs(10))
                .expect("sidecar health check failed");

            eprintln!("sidecar healthy, creating window");

            // Create the main window pointing at the sidecar.
            let url = format!("http://127.0.0.1:{}", port);
            let _window = tauri::WebviewWindowBuilder::new(
                app,
                "main",
                tauri::WebviewUrl::External(url.parse().unwrap()),
            )
            .title("Webmail")
            .inner_size(1200.0, 800.0)
            .min_inner_size(800.0, 500.0)
            .visible(true)
            .build()?;

            // Set up system tray.
            tray::setup(app)?;

            Ok(())
        })
        .on_window_event(|_window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                // Window destroyed — sidecar cleanup happens in Drop/exit hook.
            }
        })
        .invoke_handler(tauri::generate_handler![get_sidecar_port])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                // Kill the sidecar on exit.
                let state = app.state::<Mutex<SidecarState>>();
                let mut guard = state.lock().unwrap();
                if let Some(ref mut child) = guard.child {
                    eprintln!("killing sidecar (pid {})", child.id());
                    let _ = child.kill();
                    let _ = child.wait();
                }
            }
        });
}

/// IPC command: get the sidecar port (for JS bridge).
#[tauri::command]
fn get_sidecar_port(state: tauri::State<'_, Mutex<SidecarState>>) -> u16 {
    state.lock().unwrap().port
}
