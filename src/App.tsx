import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Settings, X, GripHorizontal } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

// Format total seconds into a digital clock string
const formatTime = (totalSeconds: number, showSeconds: boolean): string => {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  const pad = (num: number) => String(num).padStart(2, '0');

  if (hrs > 0) {
    if (showSeconds) {
      return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
    } else {
      return `${pad(hrs)}:${pad(mins)}`;
    }
  } else {
    if (showSeconds) {
      return `${pad(mins)}:${pad(secs)}`;
    } else {
      return `${pad(mins)}`;
    }
  }
};

// Parse user entered string (e.g. "10", "05:30", "01:20:00") into total seconds
const parseTimeToSeconds = (input: string): number | null => {
  const parts = input.trim().split(':');
  if (parts.length === 1) {
    // Treat single number as minutes
    const mins = parseInt(parts[0], 10);
    if (isNaN(mins) || mins < 0) return null;
    return mins * 60;
  } else if (parts.length === 2) {
    // MM:SS
    const mins = parseInt(parts[0], 10);
    const secs = parseInt(parts[1], 10);
    if (isNaN(mins) || isNaN(secs) || mins < 0 || secs < 0 || secs >= 60) return null;
    return mins * 60 + secs;
  } else if (parts.length === 3) {
    // HH:MM:SS
    const hrs = parseInt(parts[0], 10);
    const mins = parseInt(parts[1], 10);
    const secs = parseInt(parts[2], 10);
    if (
      isNaN(hrs) || isNaN(mins) || isNaN(secs) ||
      hrs < 0 || mins < 0 || mins >= 60 || secs < 0 || secs >= 60
    ) return null;
    return hrs * 3600 + mins * 60 + secs;
  }
  return null;
};

interface AppSettings {
  show_seconds: boolean;
  always_on_top: boolean;
  opacity: number;
  last_timer_duration_secs: number;
}

export default function App() {
  // Timer States
  const [remainingSeconds, setRemainingSeconds] = useState(300);
  const [totalDuration, setTotalDuration] = useState(300);
  const [isRunning, setIsRunning] = useState(false);
  const [isFlashing, setIsFlashing] = useState(false);

  // UI Panel States
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  // App Settings (Synced with Rust backend)
  const [settings, setSettings] = useState<AppSettings>({
    show_seconds: true,
    always_on_top: true,
    opacity: 0.9,
    last_timer_duration_secs: 300,
  });

  // Refs for precise countdown updates
  const timerIntervalRef = useRef<number | null>(null);
  const endTimeRef = useRef<number | null>(null);
  const flashingIntervalRef = useRef<number | null>(null);
  const [flashVisible, setFlashVisible] = useState(true);

  // Drag start ref for tracking click vs drag
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  // Load Settings on start & listen to updates
  useEffect(() => {
    const loadInitialSettings = async () => {
      try {
        const s = await invoke('get_settings') as AppSettings;
        setSettings(s);
        setTotalDuration(s.last_timer_duration_secs);
        setRemainingSeconds(s.last_timer_duration_secs);
      } catch (err) {
        console.error("Failed to fetch settings from Rust backend:", err);
      }
    };
    loadInitialSettings();

    // Listen for setting changes updated from tray
    const unlisten = listen('settings-updated', async () => {
      try {
        const s = await invoke('get_settings') as AppSettings;
        setSettings(s);
      } catch (err) {
        console.error("Failed to sync settings:", err);
      }
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, []);

  // Sync remaining seconds if timer is not running and last duration changes
  useEffect(() => {
    if (!isRunning && !isFlashing) {
      setRemainingSeconds(settings.last_timer_duration_secs);
      setTotalDuration(settings.last_timer_duration_secs);
    }
  }, [settings.last_timer_duration_secs]);

  // Handle timer countdown
  const startTimer = (seconds: number) => {
    if (seconds <= 0) return;
    setIsRunning(true);
    setIsFlashing(false);
    setFlashVisible(true);

    const endTime = Date.now() + seconds * 1000;
    endTimeRef.current = endTime;

    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = window.setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((endTime - now) / 1000));
      setRemainingSeconds(remaining);

      if (remaining <= 0) {
        pauseTimer();
        setIsFlashing(true);
        // Save the timer state at 0
        invoke('save_timer_state', { durationSecs: 0 }).catch(console.error);
      }
    }, 100);
  };

  const pauseTimer = () => {
    setIsRunning(false);
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  };

  const toggleTimer = () => {
    if (isEditing) return;
    if (isRunning) {
      pauseTimer();
      // Save current progress
      invoke('save_timer_state', { durationSecs: remainingSeconds }).catch(console.error);
    } else {
      if (remainingSeconds <= 0) {
        // If elapsed, start from total duration
        setRemainingSeconds(totalDuration);
        startTimer(totalDuration);
      } else {
        startTimer(remainingSeconds);
      }
    }
  };

  const resetTimer = () => {
    pauseTimer();
    setIsFlashing(false);
    setFlashVisible(true);
    setRemainingSeconds(totalDuration);
    invoke('save_timer_state', { durationSecs: totalDuration }).catch(console.error);
  };

  // Handle flashing alert when timer ends
  useEffect(() => {
    if (isFlashing) {
      flashingIntervalRef.current = window.setInterval(() => {
        setFlashVisible(prev => !prev);
      }, 500);
    } else {
      if (flashingIntervalRef.current) {
        clearInterval(flashingIntervalRef.current);
        flashingIntervalRef.current = null;
      }
      setFlashVisible(true);
    }
    return () => {
      if (flashingIntervalRef.current) clearInterval(flashingIntervalRef.current);
    };
  }, [isFlashing]);

  // Window actions
  const handleHide = async () => {
    await invoke('hide_window');
  };

  const handleResetSize = async () => {
    await invoke('reset_window_size');
  };

  // Dragging handlers (Tauri v2 window move integration)
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left mouse click

    const target = e.target as HTMLElement;
    // Don't drag if clicking buttons, inputs, or other settings controls
    if (
      target.closest('button') ||
      target.closest('input') ||
      target.closest('a') ||
      target.closest('.interactive-control')
    ) {
      return;
    }

    dragStartRef.current = { x: e.clientX, y: e.clientY };
    getCurrentWindow().startDragging().catch(console.error);
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (dragStartRef.current) {
      const dx = Math.abs(e.clientX - dragStartRef.current.x);
      const dy = Math.abs(e.clientY - dragStartRef.current.y);
      dragStartRef.current = null;

      // If clicked without moving, trigger edit mode for the clock display
      if (dx < 3 && dy < 3) {
        const target = e.target as HTMLElement;
        if (target.closest('.clock-display')) {
          handleEnterEdit();
        }
      }
    }
  };

  // Keyboard Shortcuts (Space: Start/Pause, R: Reset, Esc: Hide)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept shortcuts when editing duration input
      if (isEditing) return;

      if (e.code === 'Space') {
        e.preventDefault();
        toggleTimer();
      } else if (e.code === 'KeyR') {
        e.preventDefault();
        resetTimer();
      } else if (e.code === 'Escape') {
        e.preventDefault();
        handleHide();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditing, isRunning, remainingSeconds, totalDuration]);

  // Enter Edit Mode
  const handleEnterEdit = () => {
    pauseTimer();
    setIsFlashing(false);
    setEditValue(formatTime(remainingSeconds, settings.show_seconds));
    setIsEditing(true);
  };

  // Save Duration Edit
  const handleSaveEdit = () => {
    const parsed = parseTimeToSeconds(editValue);
    if (parsed !== null && parsed > 0) {
      setTotalDuration(parsed);
      setRemainingSeconds(parsed);
      invoke('save_timer_state', { durationSecs: parsed }).catch(console.error);
    }
    setIsEditing(false);
  };

  // Settings Panel handlers
  const toggleAlwaysOnTop = async () => {
    const newVal = !settings.always_on_top;
    await invoke('set_always_on_top', { alwaysOnTop: newVal });
  };

  const toggleShowSeconds = async () => {
    const newVal = !settings.show_seconds;
    await invoke('set_show_seconds', { showSeconds: newVal });
  };

  const handleOpacityChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = parseFloat(e.target.value);
    await invoke('set_opacity', { opacity: newVal });
  };

  // Format active remaining seconds and background LCD segments
  const formattedTime = formatTime(remainingSeconds, settings.show_seconds);
  const placeholderDigits = formattedTime.replace(/\d/g, '8');

  return (
    <div 
      className="w-full h-full rounded-2xl bg-zinc-950/85 border border-zinc-800/40 shadow-2xl relative overflow-hidden backdrop-blur-md select-none group flex flex-col transition-all duration-300"
      onDoubleClick={handleResetSize}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      style={{ opacity: settings.opacity }}
    >
      {/* Header bar (Visible on hover or settings active) */}
      <div 
        className={`h-7 w-full flex items-center justify-between px-3 border-b border-zinc-800/20 bg-zinc-900/10 cursor-move transition-opacity duration-300 ${showSettings ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
      >
        <div className="flex items-center gap-1.5 text-zinc-500 text-[10px] font-semibold tracking-wider">
          <GripHorizontal className="w-3.5 h-3.5 text-zinc-600" />
          <span>CHRONO</span>
        </div>
        <button 
          onClick={handleHide} 
          className="text-zinc-500 hover:text-zinc-300 p-0.5 rounded transition-colors duration-150 interactive-control"
          title="Minimize to Tray (Esc)"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Main Panel Area */}
      <div 
        className="flex-1 flex items-center justify-center relative px-4"
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
      >
        {!showSettings ? (
          <div className="w-full flex flex-col items-center justify-center">
            {/* Clock display */}
            {isEditing ? (
              <input
                type="text"
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={handleSaveEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveEdit();
                  if (e.key === 'Escape') setIsEditing(false);
                }}
                className="w-full text-center text-5xl bg-transparent border-none outline-none text-white font-bold placeholder-zinc-700 caret-white"
                style={{ fontFamily: 'DSEG7Classic' }}
              />
            ) : (
              <div 
                className="clock-display relative cursor-pointer select-none py-1"
                title="Click to edit duration"
              >
                {/* Underlay (dim background 88:88 segment cells) */}
                <div 
                  className="text-white/5 text-5xl font-bold select-none pointer-events-none"
                  style={{ fontFamily: 'DSEG7Classic' }}
                >
                  {placeholderDigits}
                </div>
                {/* Foreground (active remaining time digits) */}
                <div 
                  className={`absolute top-0 left-0 w-full text-center text-5xl font-bold text-white transition-opacity duration-150 py-1 ${flashVisible ? 'opacity-100' : 'opacity-0'}`}
                  style={{ fontFamily: 'DSEG7Classic' }}
                >
                  {formattedTime}
                </div>
              </div>
            )}

            {/* Quick hover controls */}
            <div className="flex items-center justify-center gap-4 mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <button
                onClick={toggleTimer}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/50 transition-all duration-200 interactive-control"
                title={isRunning ? "Pause (Space)" : "Start (Space)"}
              >
                {isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
              <button
                onClick={resetTimer}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/50 transition-all duration-200 interactive-control"
                title="Reset (R)"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowSettings(true)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/50 transition-all duration-200 interactive-control"
                title="Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          /* Glassmorphic Settings Panel */
          <div className="absolute inset-0 bg-zinc-950/95 flex flex-col p-3 z-10">
            <div className="flex items-center justify-between pb-1.5 border-b border-zinc-800/40">
              <span className="text-xs font-semibold text-zinc-400 tracking-wider">SETTINGS</span>
              <button 
                onClick={() => setShowSettings(false)}
                className="text-zinc-500 hover:text-zinc-300 p-0.5 rounded transition-colors duration-150 interactive-control"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 flex flex-col gap-2 mt-2 text-[11px] overflow-y-auto pr-1">
              {/* Opacity slider */}
              <div className="flex items-center justify-between gap-4">
                <span className="text-zinc-500">Opacity</span>
                <div className="flex items-center gap-2 flex-1 max-w-[120px]">
                  <input
                    type="range"
                    min="0.2"
                    max="1.0"
                    step="0.05"
                    value={settings.opacity}
                    onChange={handleOpacityChange}
                    className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-white interactive-control"
                  />
                  <span className="text-zinc-400 min-w-[24px] text-right">{Math.round(settings.opacity * 100)}%</span>
                </div>
              </div>

              {/* Toggles */}
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Show Seconds</span>
                <button
                  onClick={toggleShowSeconds}
                  className={`w-7 h-4 rounded-full p-0.5 transition-colors duration-200 focus:outline-none interactive-control ${settings.show_seconds ? 'bg-zinc-200' : 'bg-zinc-800'}`}
                >
                  <div className={`w-3 h-3 rounded-full transition-transform duration-200 ${settings.show_seconds ? 'translate-x-3 bg-zinc-950' : 'translate-x-0 bg-white'}`} />
                </button>
              </div>

              <div className="flex-1 flex items-center justify-between">
                <span className="text-zinc-500">Always On Top</span>
                <button
                  onClick={toggleAlwaysOnTop}
                  className={`w-7 h-4 rounded-full p-0.5 transition-colors duration-200 focus:outline-none interactive-control ${settings.always_on_top ? 'bg-zinc-200' : 'bg-zinc-800'}`}
                >
                  <div className={`w-3 h-3 rounded-full transition-transform duration-200 ${settings.always_on_top ? 'translate-x-3 bg-zinc-950' : 'translate-x-0 bg-white'}`} />
                </button>
              </div>

              {/* Shortcuts help */}
              <div className="mt-1 pt-1.5 border-t border-zinc-800/40 text-[9px] text-zinc-650 flex justify-between">
                <span>Space: Play/Pause</span>
                <span>R: Reset</span>
                <span>Esc: Hide</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
