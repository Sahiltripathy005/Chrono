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
pub struct TimerModel {
    pub id: String,
    pub label: String,
    #[serde(rename = "type")]
    pub timer_type: String, // "countdown" or "deadline"
    pub duration_secs: u64, // for countdown
    pub deadline_timestamp: u64, // for deadline (epoch ms)
}

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
    
    // New settings fields for Alarm Center & Deadline Mode
    #[serde(default)]
    pub launch_at_startup: bool,
    #[serde(default)]
    pub active_timer_id: String,
    #[serde(default)]
    pub timers: Vec<TimerModel>,
    #[serde(default = "default_true")]
    pub notification_sound: bool,
    #[serde(default)]
    pub notification_auto_switch: bool,
    #[serde(default = "default_true")]
    pub auto_dock: bool,
}

fn default_true() -> bool {
    true
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
            last_timer_duration_secs: 300,
            launch_at_startup: false,
            active_timer_id: "default".to_string(),
            timers: vec![TimerModel {
                id: "default".to_string(),
                label: "Countdown".to_string(),
                timer_type: "countdown".to_string(),
                duration_secs: 300,
                deadline_timestamp: 0,
            }],
            notification_sound: true,
            notification_auto_switch: false,
            auto_dock: true,
        }
    }
}

pub struct AppState {
    pub settings: Mutex<AppSettings>,
    pub show_seconds_item: CheckMenuItem<tauri::Wry>,
    pub always_on_top_item: CheckMenuItem<tauri::Wry>,
    pub is_config_mode: Mutex<bool>,
    pub saved_x: Mutex<i32>,
    pub saved_y: Mutex<i32>,
    pub saved_width: Mutex<f64>,
    pub saved_height: Mutex<f64>,
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

#[cfg(target_os = "windows")]
fn set_autostart(_app_handle: &tauri::AppHandle, enabled: bool) -> Result<(), String> {
    use winreg::enums::*;
    use winreg::RegKey;
    
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let run_key = hkcu
        .open_subkey_with_flags(
            r"Software\Microsoft\Windows\CurrentVersion\Run",
            KEY_WRITE | KEY_READ,
        )
        .map_err(|e| e.to_string())?;

    let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe_str = exe_path.to_string_lossy().to_string();

    if enabled {
        run_key
            .set_value("Chrono", &exe_str)
            .map_err(|e| e.to_string())?;
    } else {
        let _ = run_key.delete_value("Chrono");
    }
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
fn set_config_mode(state: State<'_, AppState>, val: bool) -> Result<(), String> {
    *state.is_config_mode.lock().unwrap() = val;
    Ok(())
}

#[tauri::command]
fn get_monitor_work_area(window: Window) -> Result<(f64, f64, f64, f64), String> {
    let monitor = window.current_monitor().ok().flatten().unwrap_or_else(|| {
        window.primary_monitor().ok().flatten().expect("Must have a monitor")
    });
    let scale_factor = monitor.scale_factor();
    let m_pos = monitor.position().to_logical::<f64>(scale_factor);
    let m_size = monitor.size().to_logical::<f64>(scale_factor);
    Ok((m_pos.x, m_pos.y, m_size.width, m_size.height))
}

#[tauri::command]
fn animate_window(
    window: Window,
    start_x: f64,
    start_y: f64,
    start_w: f64,
    start_h: f64,
    end_x: f64,
    end_y: f64,
    end_w: f64,
    end_h: f64,
    duration_ms: u64,
) -> Result<(), String> {
    std::thread::spawn(move || {
        let steps = 15;
        let sleep_ms = duration_ms / steps;
        
        for i in 0..=steps {
            let t = i as f64 / steps as f64;
            // Ease in out cubic
            let ease_t = if t < 0.5 {
                4.0 * t * t * t
            } else {
                let f = (2.0 * t) - 2.0;
                0.5 * f * f * f + 1.0
            };

            let cur_x = start_x + (end_x - start_x) * ease_t;
            let cur_y = start_y + (end_y - start_y) * ease_t;
            let cur_w = start_w + (end_w - start_w) * ease_t;
            let cur_h = start_h + (end_h - start_h) * ease_t;

            let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(
                cur_x.round() as i32,
                cur_y.round() as i32,
            )));
            let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize::new(
                cur_w.round() as u32,
                cur_h.round() as u32,
            )));

            std::thread::sleep(std::time::Duration::from_millis(sleep_ms));
        }
    });
    Ok(())
}

#[tauri::command]
fn enter_config_mode(window: Window, state: State<'_, AppState>, width: f64, height: f64) -> Result<(), String> {
    // 1. Mark as config mode to pause saving overlay dimensions and positions
    *state.is_config_mode.lock().unwrap() = true;

    // 2. Cache current user settings overlay dimensions and position
    let settings = state.settings.lock().unwrap();
    *state.saved_x.lock().unwrap() = settings.x;
    *state.saved_y.lock().unwrap() = settings.y;
    *state.saved_width.lock().unwrap() = settings.width;
    *state.saved_height.lock().unwrap() = settings.height;

    // 3. Find target coordinates to ensure full visibility on current monitor
    let monitor = window.current_monitor().ok().flatten().unwrap_or_else(|| {
        window.primary_monitor().ok().flatten().expect("Must have at least one monitor")
    });

    let scale_factor = monitor.scale_factor();
    let m_pos = monitor.position().to_logical::<f64>(scale_factor);
    let m_size = monitor.size().to_logical::<f64>(scale_factor);

    let left_bound = m_pos.x + 10.0;
    let top_bound = m_pos.y + 10.0;
    let right_bound = m_pos.x + m_size.width - 10.0;
    let bottom_bound = m_pos.y + m_size.height - 50.0; // 48px Windows taskbar + margin

    let mut target_x = settings.x as f64;
    let mut target_y = settings.y as f64;

    if target_x + width > right_bound {
        target_x = right_bound - width;
    }
    if target_y + height > bottom_bound {
        target_y = bottom_bound - height;
    }
    if target_x < left_bound {
        target_x = left_bound;
    }
    if target_y < top_bound {
        target_y = top_bound;
    }

    // 4. Update window size & position, and disable resizing
    let _ = window.set_size(tauri::LogicalSize::new(width, height));
    let _ = window.set_position(tauri::LogicalPosition::new(target_x, target_y));
    let _ = window.set_resizable(false);

    Ok(())
}

#[tauri::command]
fn exit_config_mode(window: Window, state: State<'_, AppState>) -> Result<(), String> {
    // 1. Get cached user dimensions and position
    let x = *state.saved_x.lock().unwrap();
    let y = *state.saved_y.lock().unwrap();
    let w = *state.saved_width.lock().unwrap();
    let h = *state.saved_height.lock().unwrap();

    // 2. Restore window position and size, and allow resizing
    let _ = window.set_position(tauri::LogicalPosition::new(x as f64, y as f64));
    let _ = window.set_size(tauri::LogicalSize::new(w, h));
    let _ = window.set_resizable(true);

    // 3. Resume saving overlay dimensions and positions
    *state.is_config_mode.lock().unwrap() = false;
    Ok(())
}

#[tauri::command]
fn save_settings_data(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    settings: AppSettings,
) -> Result<(), String> {
    // Update autostart registry key on Windows
    #[cfg(target_os = "windows")]
    {
        let _ = set_autostart(&app_handle, settings.launch_at_startup);
    }

    let mut current_settings = state.settings.lock().unwrap();
    
    // If in config mode, preserve cached user dimensions
    let (x, y) = if *state.is_config_mode.lock().unwrap() {
        (*state.saved_x.lock().unwrap(), *state.saved_y.lock().unwrap())
    } else {
        (current_settings.x, current_settings.y)
    };

    let (width, height) = if *state.is_config_mode.lock().unwrap() {
        (*state.saved_width.lock().unwrap(), *state.saved_height.lock().unwrap())
    } else {
        (current_settings.width, current_settings.height)
    };

    *current_settings = settings;
    current_settings.x = x;
    current_settings.y = y;
    current_settings.width = width;
    current_settings.height = height;

    let settings_clone = current_settings.clone();
    let app_handle_clone = app_handle.clone();
    tauri::async_runtime::spawn(async move {
        let _ = save_settings(&app_handle_clone, &settings_clone);
    });

    let _ = app_handle.emit("settings-updated", ());
    Ok(())
}

#[cfg(target_os = "windows")]
#[link(name = "user32")]
extern "system" {
    fn GetCursorPos(lpPoint: *mut POINT) -> i32;
}

#[cfg(target_os = "windows")]
#[repr(C)]
#[derive(Copy, Clone, Debug, Default)]
pub struct POINT {
    pub x: i32,
    pub y: i32,
}

#[tauri::command]
fn get_cursor_position() -> Result<(i32, i32), String> {
    #[cfg(target_os = "windows")]
    {
        let mut point = POINT::default();
        unsafe {
            if GetCursorPos(&mut point) != 0 {
                Ok((point.x, point.y))
            } else {
                Err("Failed to get cursor position".to_string())
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok((0, 0))
    }
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

            // Populate default timer if list is empty
            if settings.timers.is_empty() {
                settings.timers.push(TimerModel {
                    id: "default".to_string(),
                    label: "Countdown".to_string(),
                    timer_type: "countdown".to_string(),
                    duration_secs: 300,
                    deadline_timestamp: 0,
                });
            }

            // Sync autostart preference on Windows
            #[cfg(target_os = "windows")]
            {
                let _ = set_autostart(&app_handle, settings.launch_at_startup);
            }

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

            // Set WS_EX_TOOLWINDOW style to exclude the window from Alt+Tab
            #[cfg(target_os = "windows")]
            {
                use windows::Win32::Foundation::HWND;
                use windows::Win32::UI::WindowsAndMessaging::{
                    GetWindowLongPtrW, SetWindowLongPtrW, GWL_EXSTYLE, WS_EX_TOOLWINDOW,
                };
                if let Ok(hwnd_raw) = window.hwnd() {
                    let hwnd = HWND(hwnd_raw.0);
                    unsafe {
                        let ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
                        let _ = SetWindowLongPtrW(
                            hwnd,
                            GWL_EXSTYLE,
                            ex_style | WS_EX_TOOLWINDOW.0 as isize,
                        );
                    }
                }
            }

            // Set up Window Events (Moved and Resized)
            let app_handle_clone = app_handle.clone();
            let window_clone = window.clone();
            window.on_window_event(move |event| {
                match event {
                    tauri::WindowEvent::Moved(pos) => {
                        let is_config = if let Some(state) = app_handle_clone.try_state::<AppState>() {
                            *state.is_config_mode.lock().unwrap()
                        } else {
                            false
                        };

                        if !is_config {
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
                    }
                    tauri::WindowEvent::Resized(size) => {
                        let is_config = if let Some(state) = app_handle_clone.try_state::<AppState>() {
                            *state.is_config_mode.lock().unwrap()
                        } else {
                            false
                        };

                        if !is_config {
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

            // Register global shortcuts plugin and Ctrl + Alt + T / Ctrl + ` shortcuts
            app.handle().plugin(
                tauri_plugin_global_shortcut::Builder::new()
                    .with_shortcuts(["ctrl+alt+t", "ctrl+`"])?
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
                            } else if shortcut.matches(Modifiers::CONTROL, Code::Backquote) {
                                let _ = ah.emit("toggle-mode", ());
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
                is_config_mode: Mutex::new(false),
                saved_x: Mutex::new(100),
                saved_y: Mutex::new(100),
                saved_width: Mutex::new(320.0),
                saved_height: Mutex::new(130.0),
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_settings,
            save_timer_state,
            save_settings_data,
            enter_config_mode,
            exit_config_mode,
            set_always_on_top,
            set_show_seconds,
            set_opacity,
            hide_window,
            reset_window_size,
            animate_window,
            get_monitor_work_area,
            set_config_mode,
            get_cursor_position
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
