// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Command, Child, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use std::thread;

/// Global handle to the Node sidecar process so we can kill it on exit.
static SERVER_PROCESS: Mutex<Option<Child>> = Mutex::new(None);
static SERVER_PORT: Mutex<u16> = Mutex::new(5173);

/// Start the Node.js API server (reuses electron/server.mjs).
fn start_node_server() -> Result<u16, String> {
    let port: u16 = 5173;

    // Path to server.mjs relative to the Tauri binary
    // In dev: ../../electron/server.mjs
    // In prod: bundled in resources
    let server_script = if cfg!(debug_assertions) {
        // Dev mode — relative to src-tauri/
        std::path::PathBuf::from("../../electron/server.mjs")
    } else {
        // Production — look next to the binary or in resources
        let exe_dir = std::env::current_exe()
            .map_err(|e| e.to_string())?
            .parent()
            .unwrap()
            .to_path_buf();
        // macOS: Contents/Resources/bin/server.mjs
        let resources = exe_dir.join("../Resources/bin/server.mjs");
        if resources.exists() {
            resources
        } else {
            exe_dir.join("bin/server.mjs")
        }
    };

    println!("[Tauri] Starting Node server: {:?}", server_script);

    let child = Command::new("node")
        .arg("--experimental-modules")
        .arg(&server_script)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start Node server: {}", e))?;

    *SERVER_PROCESS.lock().unwrap() = Some(child);
    *SERVER_PORT.lock().unwrap() = port;

    // Wait for the server to be ready (poll health endpoint)
    let start = Instant::now();
    let timeout = Duration::from_secs(15);

    while start.elapsed() < timeout {
        thread::sleep(Duration::from_millis(300));
        if let Ok(resp) = reqwest::blocking::get(format!("http://127.0.0.1:{}/api/oni/status", port)) {
            if resp.status().is_success() {
                println!("[Tauri] Node server ready on port {}", port);
                return Ok(port);
            }
        }
    }

    Err("Node server did not become ready within 15 seconds".into())
}

/// Kill the sidecar Node process.
fn stop_node_server() {
    if let Ok(mut guard) = SERVER_PROCESS.lock() {
        if let Some(ref mut child) = *guard {
            println!("[Tauri] Stopping Node server");
            let _ = child.kill();
            let _ = child.wait();
        }
        *guard = None;
    }
}

#[tauri::command]
fn get_server_port() -> u16 {
    *SERVER_PORT.lock().unwrap()
}

fn main() {
    // In production, start the Node sidecar server
    let use_sidecar = !cfg!(debug_assertions);

    if use_sidecar {
        match start_node_server() {
            Ok(port) => println!("[Tauri] Production server on port {}", port),
            Err(e) => eprintln!("[Tauri] WARNING: {}", e),
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![get_server_port])
        .on_window_event(|_window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                stop_node_server();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running OniOS");
}
