// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{
    menu::{CheckMenuItem, CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder},
    tray::{TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, State, Window,
};
use tauri_plugin_global_shortcut::{Code, Modifiers, ShortcutState};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AppSettings {
    pub x: i32,
    pub y: i32,
    pub width: f64,
    pub height: f64,
    pub opacity: f64,
    pub always_on_top: bool,
    pub show_seconds: bool,
    pub last_timer_duration_secs: u64,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            x: 100,
            y: 100,
            width: 320.0,
            height: 130.0,
            opacity: 0.9,
            always_on_top: true,
            show_seconds: true,
            last_timer_duration_secs: 300, // 5 minutes default
        }
    }
}

pub struct AppState {
    pub settings: Mutex<AppSettings>,
    pub show_seconds_item: CheckMenuItem<tauri::Wry>,
    pub always_on_top_item: CheckMenuItem<tauri::Wry>,
}

fn get_settings_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let config_dir = app_handle
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?;
    Ok(config_dir.join("settings.json"))
}

fn load_settings(app_handle: &tauri::AppHandle) -> AppSettings {
    if let Ok(path) = get_settings_path(app_handle) {
        if path.exists() {
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(settings) = serde_json::from_str::<AppSettings>(&content) {
                    return settings;
                }
            }
        }
    }
    AppSettings::default()
}

fn save_settings(app_handle: &tauri::AppHandle, settings: &AppSettings) -> Result<(), String> {
    let path = get_settings_path(app_handle)?;
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let content = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())?;
    Ok(())
}

// Commands
#[tauri::command]
fn get_settings(state: State<'_, AppState>) -> AppSettings {
    state.settings.lock().unwrap().clone()
}

#[tauri::command]
fn save_timer_state(app_handle: tauri::AppHandle, state: State<'_, AppState>, duration_secs: u64) -> Result<(), String> {
    let mut settings = state.settings.lock().unwrap();
    settings.last_timer_duration_secs = duration_secs;
    let settings_clone = settings.clone();
    let app_handle_clone = app_handle.clone();
    tauri::async_runtime::spawn(async move {
        let _ = save_settings(&app_handle_clone, &settings_clone);
    });
    Ok(())
}

#[tauri::command]
fn set_always_on_top(
    window: Window,
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    always_on_top: bool,
) -> Result<(), String> {
    let _ = window.set_always_on_top(always_on_top);
    let _ = state.always_on_top_item.set_checked(always_on_top);

    {
        let mut settings = state.settings.lock().unwrap();
        settings.always_on_top = always_on_top;
        let settings_clone = settings.clone();
        let app_handle_clone = app_handle.clone();
        tauri::async_runtime::spawn(async move {
            let _ = save_settings(&app_handle_clone, &settings_clone);
        });
    }

    let _ = app_handle.emit("settings-updated", ());
    Ok(())
}

#[tauri::command]
fn set_show_seconds(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    show_seconds: bool,
) -> Result<(), String> {
    let _ = state.show_seconds_item.set_checked(show_seconds);

    {
        let mut settings = state.settings.lock().unwrap();
        settings.show_seconds = show_seconds;
        let settings_clone = settings.clone();
        let app_handle_clone = app_handle.clone();
        tauri::async_runtime::spawn(async move {
            let _ = save_settings(&app_handle_clone, &settings_clone);
        });
    }

    let _ = app_handle.emit("settings-updated", ());
    Ok(())
}

#[tauri::command]
fn set_opacity(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    opacity: f64,
) -> Result<(), String> {
    {
        let mut settings = state.settings.lock().unwrap();
        settings.opacity = opacity;
        let settings_clone = settings.clone();
        let app_handle_clone = app_handle.clone();
        tauri::async_runtime::spawn(async move {
            let _ = save_settings(&app_handle_clone, &settings_clone);
        });
    }

    let _ = app_handle.emit("settings-updated", ());
    Ok(())
}

#[tauri::command]
fn hide_window(window: Window) -> Result<(), String> {
    let _ = window.hide();
    Ok(())
}

#[tauri::command]
fn reset_window_size(window: Window) -> Result<(), String> {
    let _ = window.set_size(tauri::LogicalSize::new(320.0, 130.0));
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_handle = app.handle().clone();
            let window = app.get_webview_window("main").unwrap();

            // Load settings
            let mut settings = load_settings(&app_handle);

            // Determine if the position is on any active monitor
            let mut pos_valid = false;
            if let Ok(monitors) = window.available_monitors() {
                for monitor in monitors {
                    let m_pos = monitor.position();
                    let m_size = monitor.size();
                    let scale_factor = monitor.scale_factor();
                    
                    let start_x = m_pos.x;
                    let end_x = m_pos.x + m_size.width as i32;
                    let start_y = m_pos.y;
                    let end_y = m_pos.y + m_size.height as i32;

                    let phys_x = (settings.x as f64 * scale_factor) as i32;
                    let phys_y = (settings.y as f64 * scale_factor) as i32;

                    if phys_x >= start_x && phys_x < end_x && phys_y >= start_y && phys_y < end_y {
                        pos_valid = true;
                        break;
                    }
                }
            }

            // If first run or monitor disconnected, center near top-right of primary monitor
            if !pos_valid {
                if let Ok(Some(monitor)) = window.primary_monitor() {
                    let monitor_size = monitor.size();
                    let scale_factor = monitor.scale_factor();
                    let width = settings.width;
                    let screen_w = monitor_size.width as f64 / scale_factor;
                    settings.x = (screen_w - width - 40.0) as i32;
                    settings.y = 40;
                    let _ = save_settings(&app_handle, &settings);
                }
            }

            // Apply size, position, always on top
            let _ = window.set_position(tauri::LogicalPosition::new(settings.x as f64, settings.y as f64));
            let _ = window.set_size(tauri::LogicalSize::new(settings.width, settings.height));
            let _ = window.set_always_on_top(settings.always_on_top);

            // Show window
            let _ = window.show();

            // Set up Window Events (Moved and Resized)
            let app_handle_clone = app_handle.clone();
            let window_clone = window.clone();
            window.on_window_event(move |event| {
                match event {
                    tauri::WindowEvent::Moved(pos) => {
                        if let Ok(scale_factor) = window_clone.scale_factor() {
                            let logical_pos = pos.to_logical::<f64>(scale_factor);
                            if let Some(state) = app_handle_clone.try_state::<AppState>() {
                                let mut s = state.settings.lock().unwrap();
                                s.x = logical_pos.x as i32;
                                s.y = logical_pos.y as i32;
                                let s_clone = s.clone();
                                let ah = app_handle_clone.clone();
                                tauri::async_runtime::spawn(async move {
                                    let _ = save_settings(&ah, &s_clone);
                                });
                            }
                        }
                    }
                    tauri::WindowEvent::Resized(size) => {
                        if let Ok(scale_factor) = window_clone.scale_factor() {
                            let logical_size = size.to_logical::<f64>(scale_factor);
                            if let Some(state) = app_handle_clone.try_state::<AppState>() {
                                let mut s = state.settings.lock().unwrap();
                                s.width = logical_size.width;
                                s.height = logical_size.height;
                                let s_clone = s.clone();
                                let ah = app_handle_clone.clone();
                                tauri::async_runtime::spawn(async move {
                                    let _ = save_settings(&ah, &s_clone);
                                });
                            }
                        }
                    }
                    _ => {}
                }
            });

            // Create Menu Items for Tray Icon
            let show_item = MenuItemBuilder::with_id("show", "Show").build(app)?;
            let hide_item = MenuItemBuilder::with_id("hide", "Hide").build(app)?;
            let show_seconds_item = CheckMenuItemBuilder::with_id("show_seconds", "Show Seconds")
                .checked(settings.show_seconds)
                .build(app)?;
            let always_on_top_item = CheckMenuItemBuilder::with_id("always_on_top", "Always On Top")
                .checked(settings.always_on_top)
                .build(app)?;
            let exit_item = MenuItemBuilder::with_id("exit", "Exit").build(app)?;

            // Build Tray Menu
            let tray_menu = MenuBuilder::new(app)
                .item(&show_item)
                .item(&hide_item)
                .separator()
                .item(&show_seconds_item)
                .item(&always_on_top_item)
                .separator()
                .item(&exit_item)
                .build()?;

            // Build Tray Icon
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&tray_menu)
                .on_menu_event(move |ah, event| {
                    let state = ah.state::<AppState>();
                    match event.id().as_ref() {
                        "show" => {
                            if let Some(win) = ah.get_webview_window("main") {
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                        }
                        "hide" => {
                            if let Some(win) = ah.get_webview_window("main") {
                                let _ = win.hide();
                            }
                        }
                        "show_seconds" => {
                            let is_checked = state.show_seconds_item.is_checked().unwrap_or(true);
                            {
                                let mut s = state.settings.lock().unwrap();
                                s.show_seconds = is_checked;
                                let s_clone = s.clone();
                                let ah_clone = ah.clone();
                                tauri::async_runtime::spawn(async move {
                                    let _ = save_settings(&ah_clone, &s_clone);
                                });
                            }
                            let _ = ah.emit("settings-updated", ());
                        }
                        "always_on_top" => {
                            let is_checked = state.always_on_top_item.is_checked().unwrap_or(true);
                            if let Some(win) = ah.get_webview_window("main") {
                                let _ = win.set_always_on_top(is_checked);
                            }
                            {
                                let mut s = state.settings.lock().unwrap();
                                s.always_on_top = is_checked;
                                let s_clone = s.clone();
                                let ah_clone = ah.clone();
                                tauri::async_runtime::spawn(async move {
                                    let _ = save_settings(&ah_clone, &s_clone);
                                });
                            }
                            let _ = ah.emit("settings-updated", ());
                        }
                        "exit" => {
                            ah.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    match event {
                        TrayIconEvent::DoubleClick { .. } => {
                            if let Some(win) = tray.app_handle().get_webview_window("main") {
                                let is_visible = win.is_visible().unwrap_or(false);
                                if is_visible {
                                    let _ = win.hide();
                                } else {
                                    let _ = win.show();
                                    let _ = win.set_focus();
                                }
                            }
                        }
                        _ => {}
                    }
                })
                .build(app)?;

            // Register global shortcuts plugin and Ctrl + Alt + T shortcut
            app.handle().plugin(
                tauri_plugin_global_shortcut::Builder::new()
                    .with_shortcuts(["ctrl+alt+t"])?
                    .with_handler(move |ah, shortcut, event| {
                        if event.state() == ShortcutState::Pressed {
                            if shortcut.matches(Modifiers::CONTROL | Modifiers::ALT, Code::KeyT) {
                                if let Some(win) = ah.get_webview_window("main") {
                                    let is_visible = win.is_visible().unwrap_or(false);
                                    if is_visible {
                                        let _ = win.hide();
                                    } else {
                                        let _ = win.show();
                                        let _ = win.set_focus();
                                    }
                                }
                            }
                        }
                    })
                    .build(),
            )?;

            // Manage state
            app.manage(AppState {
                settings: Mutex::new(settings),
                show_seconds_item,
                always_on_top_item,
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_settings,
            save_timer_state,
            set_always_on_top,
            set_show_seconds,
            set_opacity,
            hide_window,
            reset_window_size
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
