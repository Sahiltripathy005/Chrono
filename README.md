# Chrono

A lightweight, transparent, always-on-top countdown timer that behaves like a native Windows overlay.

## Features

- **Always on Top**: Stays visible above all normal Windows applications.
- **Borderless & Transparent**: A clean, digital clock design with customizable opacity and rounded corners.
- **Native Behavior**: Draggable, resizable, and remembers its size/position across restarts (restoring safely to the primary monitor if multiple monitors change).
- **Digital Display**: Renders remaining time using the embedded high-contrast DSEG7 Classic font.
- **System Tray Integration**: Minimizes to system tray on close; click/double-click to restore or toggle options.
- **Global Shortcut**: Press `Ctrl + Alt + T` from anywhere in Windows to show or hide the timer.
- **Keyboard Shortcuts**: Start or pause using `Space`, reset using `R`, or hide using `Esc`.

## Screenshots

*(Screenshots will be placed here)*

## Build Instructions

### Prerequisites
- Node.js & pnpm
- Rust toolchain (cargo)

### Running Dev Mode
```bash
pnpm tauri dev
```

### Building Release Package
```bash
pnpm tauri build
```

## Folder Structure

```
Chrono/
├── README.md
├── package.json
├── index.html
├── vite.config.ts
├── tsconfig.json
├── Assets/
│   └── Fonts/
│       └── DSEG7Classic-Regular.ttf
├── src/
│   ├── App.tsx
│   ├── index.css
│   └── main.tsx
└── src-tauri/
    ├── Cargo.toml
    ├── tauri.conf.json
    ├── capabilities/
    └── src/
        ├── lib.rs
        └── main.rs
```

## Future Enhancements

- Stopwatch Mode
- Pomodoro Mode
- Multiple Timers
- Theme Customization
- Sound Notifications & Alarms
- Global Hotkeys Customization
- Click-through Mode
