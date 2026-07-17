# Chrono

A professional, lightweight, transparent, and borderless multi-timer desktop utility for Windows. Designed with React, Tailwind CSS, and Tauri, Chrono behaves like a native desktop overlay with rich visual feedback, system tray integration, and global shortcut control.

---

## Key Features

- **Multi-Timer Management**:
  - Support for multiple countdown and deadline-based timers running concurrently in the background.
  - **Alarm Center Dashboard**: Real-time management panel to monitor timer states (Running, Paused, Expired, Completed), start/pause countdowns, and configure new alerts.
- **Dynamic Timer Selection Modes**:
  - **Automatic (Next Due)**: Automatically displays the nearest pending, active, or overdue timer on the overlay.
  - **Manual**: Gives the user full control to click and select which timer remains active on the floating display.
- **Premium Frosted Glass Alarm System**:
  - When a timer expires, the entire overlay enters a visually rich **Alarm State**.
  - Uses hardware-accelerated, non-intrusive CSS keyframe fades (Normal $\rightarrow$ Translucent Red $\rightarrow$ Normal $\rightarrow$ Translucent White $\rightarrow$ Repeat) at a smooth 600ms cadence.
  - Countdown text transitions to a stable red (`text-rose-500`) with no independent blinking for optimal readability.
  - Includes a clear **Dismiss Alarm** action button directly on the overlay.
- **Customizable Alerts**:
  - Toggle sound alerts individually for each timer in the Add/Edit form.
- **Native OS Integration**:
  - **Always on Top**: Keeps the active timer visible above all other windows.
  - **Window Memory**: Remembers position and dimensions across launches.
  - **Monitor Bounds Verification**: Automatically recalculates coordinate safety bounds to restore the window safely to the primary monitor if display layouts change.
  - **Global Shortcut**: Press `Ctrl + Alt + T` anywhere in Windows to instantly show or hide the overlay.
  - **Keyboard Controls**: `Space` to start/pause/dismiss active timer, `R` to reset timer, and `Esc` to minimize to tray.

---

## Keyboard Shortcuts

| Shortcut | Description |
| :--- | :--- |
| **`Space`** | Toggle Start/Pause (or Acknowledge/Dismiss active alarm) |
| **`R`** | Reset active timer (marks completed state inactive, clears active alarm) |
| **`Esc`** | Minimize overlay window to System Tray |
| **`Ctrl + Alt + T`** | Global hotkey to toggle overlay visibility from anywhere |

---

## Build Instructions

### Prerequisites
- [Node.js](https://nodejs.org/) & [pnpm](https://pnpm.io/)
- [Rust toolchain](https://www.rust-lang.org/tools/install) (cargo)

### Running Dev Mode
Starts the Vite dev server and launches the Tauri window:
```bash
pnpm tauri dev
```

### Building Release Package
Compiles the React assets and packages the production-ready Windows binary:
```bash
pnpm tauri build
```

---

## Folder Structure

```text
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
