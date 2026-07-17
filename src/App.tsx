import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Settings, 
  X, 
  GripHorizontal, 
  List, 
  Plus, 
  Trash2, 
  ChevronLeft,
  Edit2
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { PhysicalSize, PhysicalPosition } from '@tauri-apps/api/dpi';

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

interface TimerModel {
  id: string;
  label: string;
  type: 'countdown' | 'deadline';
  duration_secs: number; // for countdown
  deadline_timestamp: number; // for deadline (epoch ms)
}

interface AppSettings {
  show_seconds: boolean;
  always_on_top: boolean;
  opacity: number;
  last_timer_duration_secs: number;
  launch_at_startup: boolean;
  active_timer_id: string;
  timers: TimerModel[];
  notification_sound: boolean;
  notification_auto_switch: boolean;
  auto_dock: boolean;
}

type AutoDockState = 'HOME' | 'DOCKING' | 'DOCKED' | 'RETURNING';

export default function App() {
  // Main settings state synced from Rust
  const [settings, setSettings] = useState<AppSettings>({
    show_seconds: true,
    always_on_top: true,
    opacity: 0.9,
    last_timer_duration_secs: 300,
    launch_at_startup: false,
    active_timer_id: 'default',
    timers: [
      {
        id: 'default',
        label: 'Countdown',
        type: 'countdown',
        duration_secs: 300,
        deadline_timestamp: 0,
      }
    ],
    notification_sound: true,
    notification_auto_switch: false,
    auto_dock: true,
  });

  // Mode States (Focus Mode is default)
  const [isCustomizeMode, setIsCustomizeModeState] = useState(false);
  const [isDocked, setIsDockedState] = useState(false);
  const [badgeText, setBadgeText] = useState<string | null>(null);

  // Deterministic 4-State Auto Dock Machine
  const [dockState, setDockStateState] = useState<AutoDockState>('HOME');
  const dockStateRef = useRef<AutoDockState>('HOME');

  const setDockState = (state: AutoDockState) => {
    const prev = dockStateRef.current;
    if (prev !== state) {
      console.log(`[AUTO_DOCK] [${new Date().toISOString()}] STATE:\n${prev} -> ${state}`);
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
      if (leaveTimeoutRef.current) {
        clearTimeout(leaveTimeoutRef.current);
        leaveTimeoutRef.current = null;
      }
    }
    setDockStateState(state);
    dockStateRef.current = state;
  };

  // Sync refs to avoid stale closures in event listeners
  const isCustomizeModeRef = useRef(false);
  const isDockedRef = useRef(false);
  const currentPanelRef = useRef<'timer' | 'settings' | 'manager' | 'add' | 'edit'>('timer');

  const setIsCustomizeMode = (val: boolean | ((prev: boolean) => boolean)) => {
    setIsCustomizeModeState(prev => {
      const next = typeof val === 'function' ? val(prev) : val;
      isCustomizeModeRef.current = next;
      return next;
    });
  };

  const setIsDocked = (val: boolean) => {
    setIsDockedState(val);
    isDockedRef.current = val;
  };

  // Hover and Docking position cache refs
  const hoverTimeoutRef = useRef<number | null>(null);
  const leaveTimeoutRef = useRef<number | null>(null);
  const badgeTimeoutRef = useRef<number | null>(null);
  const homeRectRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const homeLogicalSizeRef = useRef<{ width: number; height: number } | null>(null);
  const lastReturnTimeRef = useRef(0);
  const isArmedRef = useRef(true);
  const originalInteractionRegionRef = useRef<{ left: number; top: number; right: number; bottom: number } | null>(null);

  const logStateSummary = async (customMessage?: string, animationName: 'None' | 'Docking' | 'Returning' = 'None') => {
    try {
      const win = getCurrentWindow();
      const pos = await win.innerPosition();
      const size = await win.innerSize();
      
      const homeX = homeRectRef.current ? Math.round(homeRectRef.current.x) : 'N/A';
      const homeY = homeRectRef.current ? Math.round(homeRectRef.current.y) : 'N/A';
      
      const origRegion = originalInteractionRegionRef.current;
      const origL = origRegion ? Math.round(origRegion.left) : 'N/A';
      const origT = origRegion ? Math.round(origRegion.top) : 'N/A';
      const origR = origRegion ? Math.round(origRegion.right) : 'N/A';
      const origB = origRegion ? Math.round(origRegion.bottom) : 'N/A';

      const winL = Math.round(pos.x);
      const winT = Math.round(pos.y);
      const winR = Math.round(pos.x + size.width);
      const winB = Math.round(pos.y + size.height);

      const el = document.querySelector('.countdown-text-element');
      const compStyle = el ? window.getComputedStyle(el) : null;
      const fontSize = compStyle?.fontSize ?? 'N/A';
      const fontWeight = compStyle?.fontWeight ?? 'N/A';
      const letterSpacing = compStyle?.letterSpacing ?? 'N/A';
      const lineHeight = compStyle?.lineHeight ?? 'N/A';
      const transform = compStyle?.transform ?? 'N/A';
      
      let scale = 'N/A';
      if (compStyle?.transform && compStyle.transform.startsWith('matrix(')) {
        const parts = compStyle.transform.slice(7, -1).split(',');
        if (parts.length >= 6) {
          const sx = parseFloat(parts[0]);
          const sy = parseFloat(parts[3]);
          scale = `X: ${sx}, Y: ${sy}`;
        }
      }

      console.log(
        `[AUTO_DOCK] [${new Date().toISOString()}]${customMessage ? ' - ' + customMessage : ''}\n` +
        `------------------------------------------------\n` +
        `HOME Position\n` +
        `X\n` +
        `${homeX}\n` +
        `Y\n` +
        `${homeY}\n` +
        `------------------------------------------------\n` +
        `Current Window Position\n` +
        `X\n` +
        `${winL}\n` +
        `Y\n` +
        `${winT}\n` +
        `------------------------------------------------\n` +
        `Window Size\n` +
        `Width\n` +
        `${size.width}\n` +
        `Height\n` +
        `${size.height}\n` +
        `------------------------------------------------\n` +
        `Original Interaction Region\n` +
        `Left\n` +
        `${origL}\n` +
        `Top\n` +
        `${origT}\n` +
        `Right\n` +
        `${origR}\n` +
        `Bottom\n` +
        `${origB}\n` +
        `------------------------------------------------\n` +
        `Current Window Bounds\n` +
        `Left\n` +
        `${winL}\n` +
        `Top\n` +
        `${winT}\n` +
        `Right\n` +
        `${winR}\n` +
        `Bottom\n` +
        `${winB}\n` +
        `------------------------------------------------\n` +
        `Computed Typography\n` +
        `Font Size\n` +
        `${fontSize}\n` +
        `Font Weight\n` +
        `${fontWeight}\n` +
        `Letter Spacing\n` +
        `${letterSpacing}\n` +
        `Line Height\n` +
        `${lineHeight}\n` +
        `Transform\n` +
        `${transform}\n` +
        `Scale\n` +
        `${scale}\n` +
        `------------------------------------------------\n` +
        `Current State\n` +
        `${dockStateRef.current}\n` +
        `------------------------------------------------\n` +
        `Hover Timer\n` +
        `${hoverTimeoutRef.current !== null ? 'Running' : 'Stopped'}\n` +
        `------------------------------------------------\n` +
        `Return Timer\n` +
        `${leaveTimeoutRef.current !== null ? 'Running' : 'Stopped'}\n` +
        `------------------------------------------------\n` +
        `Animation\n` +
        `${animationName}\n` +
        `------------------------------------------------`
      );
    } catch (err) {
      console.error("Error logging state summary:", err);
    }
  };

  // Track window dimensions dynamically
  const [windowSize, setWindowSize] = useState({ 
    width: window.innerWidth, 
    height: window.innerHeight 
  });

  // Panel state: 'timer' | 'settings' | 'manager' | 'add' | 'edit'
  const [currentPanel, setCurrentPanelState] = useState<'timer' | 'settings' | 'manager' | 'add' | 'edit'>('timer');
  const [editingTimerId, setEditingTimerId] = useState<string | null>(null);

  const setCurrentPanel = (panel: 'timer' | 'settings' | 'manager' | 'add' | 'edit') => {
    setCurrentPanelState(panel);
    currentPanelRef.current = panel;
  };

  // Timer run states (In-Memory Only)
  const [isRunning, setIsRunning] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(300);
  const [isFlashing, setIsFlashing] = useState(false);
  const [flashVisible, setFlashVisible] = useState(true);

  // Refs for state caching and timing
  const flashingIntervalRef = useRef<number | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const countdownRemainingRef = useRef<Record<string, number>>({});
  const expiredTimersRef = useRef<Record<string, boolean>>({});

  // Add/Edit Form State
  const [formType, setFormType] = useState<'countdown' | 'deadline'>('countdown');
  const [formLabel, setFormLabel] = useState('');
  
  // Countdown Form Values
  const [formHours, setFormHours] = useState(0);
  const [formMinutes, setFormMinutes] = useState(5);
  const [formSeconds, setFormSeconds] = useState(0);

  // Custom Calendar/Date Form Values
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedHour, setSelectedHour] = useState('12');
  const [selectedMinute, setSelectedMinute] = useState('00');
  const [selectedAmPm, setSelectedAmPm] = useState<'AM' | 'PM'>('PM');

  // Show badge for 2 seconds
  const triggerBadge = (text: string) => {
    if (badgeTimeoutRef.current) clearTimeout(badgeTimeoutRef.current);
    setBadgeText(text);
    badgeTimeoutRef.current = window.setTimeout(() => {
      setBadgeText(null);
    }, 2000);
  };

  // Auto Dock action
  const triggerDock = async () => {
    if (isCustomizeModeRef.current || currentPanelRef.current !== 'timer') return;

    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = null;
    }

    // Transition state machine to DOCKING
    setDockState('DOCKING');

    // Pause window saving coordinates
    await invoke('set_config_mode', { val: true });

    const win = getCurrentWindow();
    const factor = await win.scaleFactor();
    const physPos = await win.innerPosition();
    const physSize = await win.innerSize();

    // Round physical coordinates to integers before storing
    homeRectRef.current = {
      x: Math.round(physPos.x),
      y: Math.round(physPos.y),
      width: Math.round(physSize.width),
      height: Math.round(physSize.height)
    };

    homeLogicalSizeRef.current = {
      width: windowSize.width,
      height: windowSize.height
    };

    // Capture and expand by 25 pixels on every side (converted to physical)
    originalInteractionRegionRef.current = {
      left: Math.round(physPos.x - 25 * factor),
      top: Math.round(physPos.y - 25 * factor),
      right: Math.round(physPos.x + physSize.width + 25 * factor),
      bottom: Math.round(physPos.y + physSize.height + 25 * factor)
    };

    // Log the summary BEFORE docking
    await logStateSummary('Before docking begins', 'Docking');

    // Dock dimensions: 160 x 54 in physical pixels
    const physDockW = Math.round(160 * factor);
    const physDockH = Math.round(54 * factor);

    const [mX, mY, _, mH] = await invoke('get_monitor_work_area') as [number, number, number, number];
    const targetX = Math.round(mX * factor) + Math.round(16 * factor); 
    const targetY = Math.round(mY * factor) + Math.round(mH * factor) - physDockH - Math.round(6 * factor); 

    await invoke('animate_window', {
      startX: Math.round(physPos.x),
      startY: Math.round(physPos.y),
      startW: Math.round(physSize.width),
      startH: Math.round(physSize.height),
      endX: targetX,
      endY: targetY,
      endW: physDockW,
      endH: physDockH,
      durationMs: 200
    });

    // Complete transition to DOCKED after animation finishes
    setTimeout(async () => {
      setDockState('DOCKED');
      setIsDocked(true);
      
      // Log the summary AFTER docking
      await logStateSummary('Dock animation finished', 'None');
    }, 220);
  };

  // Auto Dock restore action
  const triggerUndock = async () => {
    if (!homeRectRef.current) return;

    // Log the summary BEFORE returning
    await logStateSummary('Before returning begins', 'Returning');

    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = null;
    }

    // Transition state machine to RETURNING
    setDockState('RETURNING');

    const home = homeRectRef.current;
    const win = getCurrentWindow();
    const physPos = await win.innerPosition();
    const physSize = await win.innerSize();

    // End size and position are exactly the cached home physical bounds
    await invoke('animate_window', {
      startX: Math.round(physPos.x),
      startY: Math.round(physPos.y),
      startW: Math.round(physSize.width),
      startH: Math.round(physSize.height),
      endX: home.x,
      endY: home.y,
      endW: home.width,
      endH: home.height,
      durationMs: 200
    });

    // Complete transition to HOME after return finishes
    setTimeout(async () => {
      setIsDocked(false);
      await win.setResizable(false);
      await win.setAlwaysOnTop(true);
      await invoke('set_config_mode', { val: false });
      
      lastReturnTimeRef.current = Date.now();
      
      try {
        const pos = await win.innerPosition();
        const size = await win.innerSize();
        
        // Update originalInteractionRegion to current HOME bounds
        originalInteractionRegionRef.current = {
          left: pos.x,
          top: pos.y,
          right: pos.x + size.width,
          bottom: pos.y + size.height
        };
        
        const [cX, cY] = await invoke('get_cursor_position') as [number, number];
        const isInside = (
          cX >= pos.x &&
          cX <= pos.x + size.width &&
          cY >= pos.y &&
          cY <= pos.y + size.height
        );
        
        isArmedRef.current = !isInside;
      } catch (_) {
        isArmedRef.current = true;
      }
      
      setDockState('HOME');

      // Log the summary AFTER returning
      await logStateSummary('Return animation finished', 'None');
    }, 220);
  };

  // Hover docking triggers
  const handleMouseEnter = () => {
    if (isCustomizeModeRef.current || currentPanelRef.current !== 'timer') return;
    if (!settings.auto_dock) return;

    // Guard: Ignore synthetic enter events triggered by window repositioning
    if (Date.now() - lastReturnTimeRef.current < 800) {
      return;
    }

    if (dockStateRef.current === 'HOME') {
      if (!isArmedRef.current) return;
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
      console.log(`[AUTO_DOCK] [${new Date().toISOString()}] Hover timer started`);
      hoverTimeoutRef.current = window.setTimeout(() => {
        console.log(`[AUTO_DOCK] [${new Date().toISOString()}] Hover timer fired`);
        triggerDock();
      }, 250);
    }
  };

  const handleMouseLeave = () => {
    if (isCustomizeModeRef.current || currentPanelRef.current !== 'timer') return;

    if (dockStateRef.current === 'HOME') {
      isArmedRef.current = true;
      if (hoverTimeoutRef.current) {
        console.log(`[AUTO_DOCK] [${new Date().toISOString()}] Hover timer cancelled`);
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
    }
  };

  // Listen to Global Shortcut Mode Toggle
  useEffect(() => {
    const unlisten = listen('toggle-mode', async () => {
      setIsCustomizeMode(prev => {
        const nextMode = !prev;
        triggerBadge(nextMode ? 'Customize Mode' : 'Focus Mode');
        
        if (nextMode) {
          // If in any state other than HOME, restore instantly
          if (dockStateRef.current !== 'HOME' && homeRectRef.current) {
            if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
            if (leaveTimeoutRef.current) clearTimeout(leaveTimeoutRef.current);
            
            const home = homeRectRef.current;
            const win = getCurrentWindow();
            
            win.setSize(new PhysicalSize(home.width, home.height));
            win.setPosition(new PhysicalPosition(home.x, home.y));
            
            invoke('set_config_mode', { val: false }).catch(console.error);
            setIsDocked(false);
            setDockState('HOME');
          }
        } else {
          // Transitioning back to Focus Mode
          if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
          if (leaveTimeoutRef.current) clearTimeout(leaveTimeoutRef.current);
          
          isArmedRef.current = true;
          setIsDocked(false);
          setDockState('HOME');
        }
        return nextMode;
      });
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, []);

  // Polling interval for DOCKED safe zone cursor tracking
  useEffect(() => {
    if (dockState !== 'DOCKED') return;

    let pollInterval: number | null = null;

    const checkCursorPosition = async () => {
      try {
        const win = getCurrentWindow();
        const pos = await win.innerPosition();
        const size = await win.innerSize();
        const [cX, cY] = await invoke('get_cursor_position') as [number, number];

        const region = originalInteractionRegionRef.current;
        const origL = region?.left ?? 0;
        const origT = region?.top ?? 0;
        const origR = region?.right ?? 0;
        const origB = region?.bottom ?? 0;

        const isInsideOriginalRegion = (
          cX >= origL &&
          cX <= origR &&
          cY >= origT &&
          cY <= origB
        );

        const currL = pos.x;
        const currT = pos.y;
        const currR = pos.x + size.width;
        const currB = pos.y + size.height;

        console.log(
          `[AUTO_DOCK] [${new Date().toISOString()}]\n` +
          `Cursor:\n(${cX}, ${cY})\n\n` +
          `Current Window Bounds:\nL=${currL}\nT=${currT}\nR=${currR}\nB=${currB}\n\n` +
          `Original Interaction Region:\nL=${origL}\nT=${origT}\nR=${origR}\nB=${origB}\n\n` +
          `Inside Original Region:\n${isInsideOriginalRegion}`
        );

        if (isInsideOriginalRegion) {
          // If cursor is inside original region, clear return timeout immediately
          if (leaveTimeoutRef.current) {
            console.log(`[AUTO_DOCK] [${new Date().toISOString()}]\nReturn timer CANCELLED\n\nReason:\nCursor re-entered interaction region`);
            clearTimeout(leaveTimeoutRef.current);
            leaveTimeoutRef.current = null;
          }
        } else {
          // If cursor is outside original region, start 500ms return timer if not already running
          if (!leaveTimeoutRef.current) {
            console.log(`[AUTO_DOCK] [${new Date().toISOString()}]\nReturn timer STARTED\n\nReason:\nCursor exited ORIGINAL interaction region`);
            leaveTimeoutRef.current = window.setTimeout(() => {
              console.log(`[AUTO_DOCK] [${new Date().toISOString()}]\nReturn timer EXPIRED\n\nStarting return animation`);
              triggerUndock();
            }, 500);
          }
        }
      } catch (err) {
        console.error("Error checking cursor position:", err);
      }
    };

    pollInterval = window.setInterval(checkCursorPosition, 100);

    return () => {
      if (pollInterval) clearInterval(pollInterval);
      if (leaveTimeoutRef.current) {
        clearTimeout(leaveTimeoutRef.current);
        leaveTimeoutRef.current = null;
      }
    };
  }, [dockState]);



  // Update window resizability and always-on-top modes dynamically
  useEffect(() => {
    const applyModeFlags = async () => {
      // Only modify flags if not in editing/config panel
      if (currentPanel === 'timer' && dockStateRef.current === 'HOME') {
        const win = getCurrentWindow();
        if (isCustomizeMode) {
          await win.setResizable(true);
          await win.setAlwaysOnTop(settings.always_on_top);
        } else {
          await win.setResizable(false);
          await win.setAlwaysOnTop(true);
        }
      }
    };
    applyModeFlags();
  }, [isCustomizeMode, dockState, currentPanel, settings.always_on_top]);

  // Track window resizing
  useEffect(() => {
    const handleResize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Load Settings on startup and listen to changes
  useEffect(() => {
    const loadInitialSettings = async () => {
      try {
        const s = await invoke('get_settings') as AppSettings;
        setSettings(s);
      } catch (err) {
        console.error("Failed to load settings:", err);
      }
    };
    loadInitialSettings();

    const unlisten = listen('settings-updated', async () => {
      try {
        const s = await invoke('get_settings') as AppSettings;
        setSettings(s);
      } catch (err) {
        console.error("Failed to sync settings:", err);
      }
    });

    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }

    return () => {
      unlisten.then(fn => fn());
    };
  }, []);

  const activeTimer = settings.timers.find(t => t.id === settings.active_timer_id) || settings.timers[0];

  // Helper: trigger notification sound + alert
  const triggerExpirationNotification = (timer: TimerModel) => {
    if (Notification.permission === 'granted') {
      new Notification(`Chrono - Timer Finished`, {
        body: `"${timer.label || 'Timer'}" has completed!`,
      });
    }

    if (settings.notification_sound) {
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const playTone = (freq: number, start: number, duration: number) => {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, audioCtx.currentTime + start);
          gain.gain.setValueAtTime(0.15, audioCtx.currentTime + start);
          gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + start + duration);
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.start(audioCtx.currentTime + start);
          osc.stop(audioCtx.currentTime + start + duration);
        };

        playTone(523.25, 0, 0.4);   // C5
        playTone(659.25, 0.15, 0.6); // E5
      } catch (e) {
        console.error("Audio synth failed", e);
      }
    }

    if (settings.notification_auto_switch) {
      const now = Date.now();
      const nextTimer = settings.timers.find(t => {
        if (t.id === timer.id) return false;
        if (t.type === 'deadline') {
          return t.deadline_timestamp > now;
        } else {
          const rem = countdownRemainingRef.current[t.id] ?? t.duration_secs;
          return rem > 0;
        }
      });

      if (nextTimer) {
        setTimeout(() => {
          setSettings(prev => {
            const updated = { ...prev, active_timer_id: nextTimer.id };
            invoke('save_settings_data', { settings: updated }).catch(console.error);
            return updated;
          });
          setIsRunning(true);
        }, 2000);
      }
    }
  };

  // Transition helper that invokes enter/exit configuration mode
  const changePanel = async (panel: 'timer' | 'settings' | 'manager' | 'add' | 'edit') => {
    if (panel === 'timer') {
      await invoke('exit_config_mode');
    } else {
      if (currentPanel === 'timer') {
        // Fixed target sizing for desktop utility dialogs (560 x 400)
        await invoke('enter_config_mode', { width: 560, height: 400 });
      }
    }
    setCurrentPanel(panel);
  };

  // Precise countdown tick effect
  useEffect(() => {
    if (!activeTimer) return;
    setIsFlashing(false);

    if (activeTimer.type === 'countdown') {
      if (countdownRemainingRef.current[activeTimer.id] === undefined) {
        countdownRemainingRef.current[activeTimer.id] = activeTimer.duration_secs;
      }
      
      setRemainingSeconds(countdownRemainingRef.current[activeTimer.id]);

      if (!isRunning) return;

      const interval = setInterval(() => {
        const cur = countdownRemainingRef.current[activeTimer.id];
        if (cur <= 0) {
          clearInterval(interval);
          setIsRunning(false);
          setIsFlashing(true);
          triggerExpirationNotification(activeTimer);
          return;
        }

        const nextVal = cur - 1;
        countdownRemainingRef.current[activeTimer.id] = nextVal;
        setRemainingSeconds(nextVal);

        if (nextVal <= 0) {
          clearInterval(interval);
          setIsRunning(false);
          setIsFlashing(true);
          triggerExpirationNotification(activeTimer);
        }
      }, 1000);

      return () => clearInterval(interval);
    } else {
      // Deadline Mode (always compute dynamic difference from system time)
      const updateDeadline = () => {
        const now = Date.now();
        const diffMs = activeTimer.deadline_timestamp - now;
        const remSecs = Math.ceil(diffMs / 1000);
        setRemainingSeconds(remSecs);

        if (diffMs <= 0) {
          if (expiredTimersRef.current[activeTimer.id] !== true) {
            expiredTimersRef.current[activeTimer.id] = true;
            triggerExpirationNotification(activeTimer);
          }
        }
      };

      updateDeadline();
      const interval = setInterval(updateDeadline, 200);
      return () => clearInterval(interval);
    }
  }, [settings.active_timer_id, isRunning, settings.timers]);

  // Flash logic for finished countdowns
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

  // Play / Pause toggler (countdown only)
  const toggleTimer = () => {
    if (activeTimer.type === 'deadline') return;
    setIsRunning(!isRunning);
  };

  // Reset timer
  const resetTimer = () => {
    setIsFlashing(false);
    setFlashVisible(true);
    if (activeTimer.type === 'countdown') {
      setIsRunning(false);
      countdownRemainingRef.current[activeTimer.id] = activeTimer.duration_secs;
      setRemainingSeconds(activeTimer.duration_secs);
    } else {
      expiredTimersRef.current[activeTimer.id] = false;
    }
  };

  // Hide window command
  const handleHide = async () => {
    await invoke('hide_window');
  };

  // Reset window size command
  const handleResetSize = async () => {
    if (currentPanel === 'timer' && isCustomizeMode) {
      await invoke('reset_window_size');
    }
  };

  // Window drag handlers (Customize Mode only)
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (!isCustomizeMode) return; 

    const target = e.target as HTMLElement;
    if (
      target.closest('button') ||
      target.closest('input') ||
      target.closest('select') ||
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

      if (dx < 3 && dy < 3 && isCustomizeMode) {
        const target = e.target as HTMLElement;
        if (target.closest('.clock-display')) {
          handleOpenEditPanel();
        }
      }
    }
  };

  // Global window key listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (currentPanel !== 'timer') return;

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
  }, [currentPanel, isRunning, settings.active_timer_id]);

  // Open Edit panel for the active timer
  const handleOpenEditPanel = async (id?: string) => {
    if (!isCustomizeMode) return; 

    const targetId = id || activeTimer.id;
    const targetTimer = settings.timers.find(t => t.id === targetId);
    if (!targetTimer) return;

    setEditingTimerId(targetTimer.id);
    setFormType(targetTimer.type);
    setFormLabel(targetTimer.label);

    if (targetTimer.type === 'countdown') {
      const hrs = Math.floor(targetTimer.duration_secs / 3600);
      const mins = Math.floor((targetTimer.duration_secs % 3600) / 60);
      const secs = targetTimer.duration_secs % 60;
      setFormHours(hrs);
      setFormMinutes(mins);
      setFormSeconds(secs);
    } else {
      const d = new Date(targetTimer.deadline_timestamp);
      setSelectedDate(d);
      setCurrentMonth(d.getMonth());
      setCurrentYear(d.getFullYear());
      
      let hr = d.getHours();
      const ampm = hr >= 12 ? 'PM' : 'AM';
      hr = hr % 12;
      if (hr === 0) hr = 12;
      setSelectedHour(String(hr).padStart(2, '0'));
      setSelectedMinute(String(d.getMinutes()).padStart(2, '0'));
      setSelectedAmPm(ampm);
    }
    await changePanel('edit');
  };

  // Open Add panel
  const handleOpenAddPanel = async () => {
    if (!isCustomizeMode) return;

    setEditingTimerId(null);
    setFormType('countdown');
    setFormLabel('');
    setFormHours(0);
    setFormMinutes(5);
    setFormSeconds(0);

    const d = new Date();
    setSelectedDate(d);
    setCurrentMonth(d.getMonth());
    setCurrentYear(d.getFullYear());
    setSelectedHour('12');
    setSelectedMinute('00');
    setSelectedAmPm('PM');
    
    await changePanel('add');
  };

  // Save Add/Edit form
  const handleSaveForm = async () => {
    const id = editingTimerId || Math.random().toString(36).substring(2, 9);
    let newTimer: TimerModel;

    if (formType === 'countdown') {
      const total = formHours * 3600 + formMinutes * 60 + formSeconds;
      if (total <= 0) return;
      newTimer = {
        id,
        label: formLabel.trim() || 'Countdown',
        type: 'countdown',
        duration_secs: total,
        deadline_timestamp: 0,
      };
      countdownRemainingRef.current[id] = total;
    } else {
      let hr = parseInt(selectedHour, 10);
      if (selectedAmPm === 'PM' && hr < 12) hr += 12;
      if (selectedAmPm === 'AM' && hr === 12) hr = 0;

      const dateTarget = new Date(selectedDate);
      dateTarget.setHours(hr);
      dateTarget.setMinutes(parseInt(selectedMinute, 10));
      dateTarget.setSeconds(0);
      dateTarget.setMilliseconds(0);

      newTimer = {
        id,
        label: formLabel.trim() || 'Deadline',
        type: 'deadline',
        duration_secs: 0,
        deadline_timestamp: dateTarget.getTime(),
      };
      expiredTimersRef.current[id] = false;
    }

    setSettings(prev => {
      let updatedTimers = [...prev.timers];
      if (editingTimerId) {
        updatedTimers = updatedTimers.map(t => t.id === editingTimerId ? newTimer : t);
      } else {
        updatedTimers.push(newTimer);
      }

      const activeId = editingTimerId === prev.active_timer_id || updatedTimers.length === 1 ? id : prev.active_timer_id;

      const newSettings = {
        ...prev,
        active_timer_id: activeId,
        timers: updatedTimers,
      };
      
      invoke('save_settings_data', { settings: newSettings }).catch(console.error);
      return newSettings;
    });

    await changePanel('timer');
    setEditingTimerId(null);
  };

  // Presets trigger
  const applyPreset = (preset: '30m' | '1h' | '2h' | 'tonight' | 'tomorrow' | 'next-monday') => {
    const now = new Date();
    let target = new Date();

    if (preset === '30m') {
      target = new Date(now.getTime() + 30 * 60 * 1000);
    } else if (preset === '1h') {
      target = new Date(now.getTime() + 60 * 60 * 1000);
    } else if (preset === '2h') {
      target = new Date(now.getTime() + 120 * 60 * 1000);
    } else if (preset === 'tonight') {
      target.setHours(23, 59, 0, 0);
    } else if (preset === 'tomorrow') {
      target.setDate(now.getDate() + 1);
      target.setHours(9, 0, 0, 0);
    } else if (preset === 'next-monday') {
      const day = now.getDay();
      const diff = day === 0 ? 1 : 8 - day;
      target.setDate(now.getDate() + diff);
      target.setHours(9, 0, 0, 0);
    }

    setSelectedDate(target);
    setCurrentMonth(target.getMonth());
    setCurrentYear(target.getFullYear());

    let hr = target.getHours();
    const ampm = hr >= 12 ? 'PM' : 'AM';
    hr = hr % 12;
    if (hr === 0) hr = 12;

    setSelectedHour(String(hr).padStart(2, '0'));
    setSelectedMinute(String(target.getMinutes()).padStart(2, '0'));
    setSelectedAmPm(ampm);
  };

  // Delete a timer
  const handleDeleteTimer = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSettings(prev => {
      if (prev.timers.length <= 1) return prev;
      const updated = prev.timers.filter(t => t.id !== id);
      let activeId = prev.active_timer_id;
      if (prev.active_timer_id === id) {
        activeId = updated[0].id;
      }

      const newSettings = {
        ...prev,
        active_timer_id: activeId,
        timers: updated,
      };

      invoke('save_settings_data', { settings: newSettings }).catch(console.error);
      return newSettings;
    });
  };

  // Calendar dates helpers
  const getDaysInMonth = (y: number, m: number) => {
    const d = new Date(y, m, 1);
    const result = [];
    const firstIndex = d.getDay();
    for (let i = 0; i < firstIndex; i++) {
      result.push(null);
    }
    while (d.getMonth() === m) {
      result.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    return result;
  };

  const calendarDays = getDaysInMonth(currentYear, currentMonth);

  // Settings modification handlers
  const handleToggleStartup = () => {
    setSettings(prev => {
      const updated = { ...prev, launch_at_startup: !prev.launch_at_startup };
      invoke('save_settings_data', { settings: updated }).catch(console.error);
      return updated;
    });
  };

  const handleToggleSound = () => {
    setSettings(prev => {
      const updated = { ...prev, notification_sound: !prev.notification_sound };
      invoke('save_settings_data', { settings: updated }).catch(console.error);
      return updated;
    });
  };

  const handleToggleAutoSwitch = () => {
    setSettings(prev => {
      const updated = { ...prev, notification_auto_switch: !prev.notification_auto_switch };
      invoke('save_settings_data', { settings: updated }).catch(console.error);
      return updated;
    });
  };

  const handleToggleAutoDock = () => {
    setSettings(prev => {
      const updated = { ...prev, auto_dock: !prev.auto_dock };
      invoke('save_settings_data', { settings: updated }).catch(console.error);
      return updated;
    });
  };

  const handleOpacityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const opacity = parseFloat(e.target.value);
    setSettings(prev => {
      const updated = { ...prev, opacity };
      invoke('set_opacity', { opacity });
      return updated;
    });
  };

  const handleToggleSeconds = () => {
    setSettings(prev => {
      const updated = { ...prev, show_seconds: !prev.show_seconds };
      invoke('set_show_seconds', { showSeconds: updated.show_seconds });
      return updated;
    });
  };

  const handleToggleAlwaysOnTop = () => {
    setSettings(prev => {
      const updated = { ...prev, always_on_top: !prev.always_on_top };
      invoke('set_always_on_top', { alwaysOnTop: updated.always_on_top });
      return updated;
    });
  };

  // Keyboard listeners for custom Hour/Minute/Second inputs
  const handleHourKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedHour(prev => {
        let val = parseInt(prev, 10) + 1;
        if (val > 12) val = 1;
        return String(val).padStart(2, '0');
      });
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedHour(prev => {
        let val = parseInt(prev, 10) - 1;
        if (val < 1) val = 12;
        return String(val).padStart(2, '0');
      });
    }
  };

  const handleMinuteKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedMinute(prev => {
        let val = parseInt(prev, 10) + 1;
        if (val > 59) val = 0;
        return String(val).padStart(2, '0');
      });
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedMinute(prev => {
        let val = parseInt(prev, 10) - 1;
        if (val < 0) val = 59;
        return String(val).padStart(2, '0');
      });
    }
  };

  const handleCountdownHoursKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFormHours(prev => Math.min(23, prev + 1));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFormHours(prev => Math.max(0, prev - 1));
    }
  };

  const handleCountdownMinutesKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFormMinutes(prev => Math.min(59, prev + 1));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFormMinutes(prev => Math.max(0, prev - 1));
    }
  };

  const handleCountdownSecondsKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFormSeconds(prev => Math.min(59, prev + 1));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFormSeconds(prev => Math.max(0, prev - 1));
    }
  };

  // Timer digits formattings
  const isOverdue = activeTimer && activeTimer.type === 'deadline' && remainingSeconds < 0;
  const displaySecs = isOverdue ? Math.abs(remainingSeconds) : Math.max(0, remainingSeconds);
  const formatted = formatTime(displaySecs, settings.show_seconds);
  const formattedText = isOverdue ? `+${formatted}` : formatted;
  const placeholderDigits = formattedText.replace(/\d/g, '8');

  // Hero Clock Sizing Logic: Scales cleanly but caps securely
  const getTimerFontSize = () => {
    const width = (dockStateRef.current === 'HOME') ? windowSize.width : (homeLogicalSizeRef.current?.width ?? windowSize.width);
    const height = (dockStateRef.current === 'HOME') ? windowSize.height : (homeLogicalSizeRef.current?.height ?? windowSize.height);

    const usableWidth = width - 32;
    const usableHeight = height - 48;
    
    const charCount = formattedText.length;
    const charWidthRatio = 0.58; 
    const estimatedWidth = charCount * charWidthRatio;
    
    const widthLimit = usableWidth / estimatedWidth;
    const heightLimit = usableHeight * 0.70; 
    
    const calculated = Math.min(widthLimit, heightLimit);
    return Math.max(20, Math.min(84, calculated));
  };

  const timerFontSize = getTimerFontSize();

  // Return the compact Tag view if docked in Focus Mode
  if (isDocked) {
    return (
      <div 
        className="w-full h-full rounded-xl bg-zinc-950/90 border border-zinc-800/80 shadow-2xl flex flex-col justify-center px-3.5 select-none backdrop-blur-md"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {activeTimer?.label && (
          <span className="text-[9px] uppercase font-bold tracking-widest text-zinc-500 truncate leading-none mb-1 pointer-events-none">
            {activeTimer.label}
          </span>
        )}
        <div 
          className={`countdown-text-element font-normal leading-none pointer-events-none ${isOverdue ? 'text-rose-500' : 'text-white'}`}
          style={{ 
            fontFamily: 'DSEG7Classic',
            fontSize: '18px' 
          }}
        >
          {formattedText}
        </div>
      </div>
    );
  }

  return (
    <div 
      className="w-full h-full rounded-2xl bg-zinc-950/85 border border-zinc-800/40 shadow-2xl relative overflow-hidden backdrop-blur-md select-none group flex flex-col"
      onDoubleClick={handleResetSize}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{ opacity: settings.opacity }}
    >
      {/* Visual Mode Badge */}
      {badgeText && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/10 border border-white/20 text-white text-[9px] font-bold tracking-widest uppercase px-3.5 py-1.5 rounded-full backdrop-blur-md transition-opacity duration-300 pointer-events-none z-50 shadow-xl">
          {badgeText}
        </div>
      )}

      {/* Header bar */}
      <div 
        className={`h-7 w-full flex items-center justify-between px-3 border-b border-zinc-800/20 bg-zinc-900/10 shrink-0 ${isCustomizeMode ? 'cursor-move' : ''}`}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
      >
        <div className="flex items-center gap-1.5 text-zinc-555 text-[10px] font-bold tracking-wider">
          <GripHorizontal className="w-3.5 h-3.5 text-zinc-655" />
          <span>CHRONO</span>
        </div>

        {/* Action controls (only visible in Customize Mode) */}
        <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
          {isCustomizeMode ? (
            currentPanel === 'timer' ? (
              <>
                <button 
                  onClick={() => changePanel('manager')} 
                  className="text-zinc-550 hover:text-white p-0.5 rounded transition-colors interactive-control"
                  title="Alarm Center (Timers)"
                >
                  <List className="w-3.5 h-3.5" />
                </button>
                <button 
                  onClick={() => changePanel('settings')} 
                  className="text-zinc-555 hover:text-white p-0.5 rounded transition-colors interactive-control"
                  title="Settings"
                >
                  <Settings className="w-3.5 h-3.5" />
                </button>
              </>
            ) : (
              <button 
                onClick={() => changePanel('timer')}
                className="text-zinc-400 hover:text-white flex items-center gap-0.5 interactive-control px-1.5 py-0.5 rounded bg-zinc-900/50 hover:bg-zinc-800/50 border border-zinc-800/60 font-semibold"
              >
                <ChevronLeft className="w-3 h-3" /> Back
              </button>
            )
          ) : null}
          <button 
            onClick={handleHide} 
            className="text-zinc-555 hover:text-rose-400 p-0.5 rounded transition-colors interactive-control"
            title="Minimize to Tray (Esc)"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div 
        className="flex-1 relative flex flex-col justify-center px-4 overflow-hidden"
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
      >
        {currentPanel === 'timer' && activeTimer && (
          <div className="w-full flex flex-col items-center justify-center">
            {/* Optional label above timer */}
            <div className="flex flex-col items-center justify-center max-w-[90%] mb-1 select-none pointer-events-none">
              {activeTimer.label && (
                <span className="uppercase font-bold tracking-widest text-zinc-500 truncate max-w-full text-center text-[9.5px]">
                  {activeTimer.label}
                </span>
              )}
              {isOverdue && (
                <span className="font-extrabold tracking-widest text-rose-555 uppercase mt-0.5 text-[8.5px]">
                  OVERDUE
                </span>
              )}
            </div>

            {/* Clock display */}
            <div 
              className={`clock-display relative select-none py-0.5 flex items-center justify-center ${isCustomizeMode ? 'cursor-pointer' : 'cursor-default'}`}
              title={isCustomizeMode ? "Click to edit/configure timer" : undefined}
              style={{ height: `${timerFontSize * 1.1}px` }}
            >
              <div 
                className="countdown-text-element text-white/5 font-normal select-none pointer-events-none"
                style={{ 
                  fontFamily: 'DSEG7Classic',
                  fontSize: `${timerFontSize}px`,
                  lineHeight: 1
                }}
              >
                {placeholderDigits}
              </div>
              
              <div 
                className={`countdown-text-element absolute top-0 left-0 w-full h-full flex items-center justify-center font-normal transition-opacity duration-150 ${isOverdue ? 'text-rose-500' : 'text-white'} ${flashVisible ? 'opacity-100' : 'opacity-0'}`}
                style={{ 
                  fontFamily: 'DSEG7Classic',
                  fontSize: `${timerFontSize}px`,
                  lineHeight: 1
                }}
              >
                {formattedText}
              </div>
            </div>

            {/* Hover Actions (Only visible in Customize Mode) */}
            {isCustomizeMode && (
              <div className="flex items-center justify-center gap-4 mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                {activeTimer.type === 'countdown' && (
                  <button
                    onClick={toggleTimer}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/50 transition-all interactive-control"
                    title={isRunning ? "Pause (Space)" : "Start (Space)"}
                  >
                    {isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>
                )}
                <button
                  onClick={resetTimer}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/50 transition-all interactive-control"
                  title="Reset (R)"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleOpenEditPanel()}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/50 transition-all interactive-control"
                  title="Edit Timer"
                >
                  <Settings className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* 1. FIXED-SIZE SETTINGS PANEL */}
        {currentPanel === 'settings' && isCustomizeMode && (
          <div className="absolute inset-0 bg-zinc-950/98 flex flex-col p-6 z-10 text-xs">
            <div className="pb-3 border-b border-zinc-800/60 mb-4">
              <span className="text-[10px] font-bold text-zinc-400 tracking-widest uppercase">SYSTEM SETTINGS</span>
            </div>

            <div className="grid grid-cols-2 gap-x-8 gap-y-4 flex-1">
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-zinc-200 font-semibold">Show Seconds</span>
                    <span className="text-[10px] text-zinc-500">Render second digits in overlay</span>
                  </div>
                  <button
                    onClick={handleToggleSeconds}
                    className={`w-9 h-5 rounded-full p-0.5 transition-colors focus:outline-none interactive-control ${settings.show_seconds ? 'bg-zinc-200' : 'bg-zinc-800'}`}
                  >
                    <div className={`w-4 h-4 rounded-full transition-transform ${settings.show_seconds ? 'translate-x-4 bg-zinc-950' : 'translate-x-0 bg-white'}`} />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-zinc-200 font-semibold">Always On Top</span>
                    <span className="text-[10px] text-zinc-500">Float window above other apps</span>
                  </div>
                  <button
                    onClick={handleToggleAlwaysOnTop}
                    className={`w-9 h-5 rounded-full p-0.5 transition-colors focus:outline-none interactive-control ${settings.always_on_top ? 'bg-zinc-200' : 'bg-zinc-800'}`}
                  >
                    <div className={`w-4 h-4 rounded-full transition-transform ${settings.always_on_top ? 'translate-x-4 bg-zinc-950' : 'translate-x-0 bg-white'}`} />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-zinc-200 font-semibold">Launch with Windows</span>
                    <span className="text-[10px] text-zinc-500">Auto-start Chrono on boot</span>
                  </div>
                  <button
                    onClick={handleToggleStartup}
                    className={`w-9 h-5 rounded-full p-0.5 transition-colors focus:outline-none interactive-control ${settings.launch_at_startup ? 'bg-zinc-200' : 'bg-zinc-800'}`}
                  >
                    <div className={`w-4 h-4 rounded-full transition-transform ${settings.launch_at_startup ? 'translate-x-4 bg-zinc-950' : 'translate-x-0 bg-white'}`} />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-zinc-200 font-semibold">Auto Dock</span>
                    <span className="text-[10px] text-zinc-500">Dock to screen corner on hover</span>
                  </div>
                  <button
                    onClick={handleToggleAutoDock}
                    className={`w-9 h-5 rounded-full p-0.5 transition-colors focus:outline-none interactive-control ${settings.auto_dock ? 'bg-zinc-200' : 'bg-zinc-800'}`}
                  >
                    <div className={`w-4 h-4 rounded-full transition-transform ${settings.auto_dock ? 'translate-x-4 bg-zinc-950' : 'translate-x-0 bg-white'}`} />
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-zinc-200 font-semibold">Notification Sound</span>
                    <span className="text-[10px] text-zinc-550">Play local dual-tone synth audio</span>
                  </div>
                  <button
                    onClick={handleToggleSound}
                    className={`w-9 h-5 rounded-full p-0.5 transition-colors focus:outline-none interactive-control ${settings.notification_sound ? 'bg-zinc-200' : 'bg-zinc-800'}`}
                  >
                    <div className={`w-4 h-4 rounded-full transition-transform ${settings.notification_sound ? 'translate-x-4 bg-zinc-950' : 'translate-x-0 bg-white'}`} />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-zinc-200 font-semibold">Auto-Switch Next</span>
                    <span className="text-[10px] text-zinc-550">Switch to next upcoming timer</span>
                  </div>
                  <button
                    onClick={handleToggleAutoSwitch}
                    className={`w-9 h-5 rounded-full p-0.5 transition-colors focus:outline-none interactive-control ${settings.notification_auto_switch ? 'bg-zinc-200' : 'bg-zinc-800'}`}
                  >
                    <div className={`w-4 h-4 rounded-full transition-transform ${settings.notification_auto_switch ? 'translate-x-4 bg-zinc-950' : 'translate-x-0 bg-white'}`} />
                  </button>
                </div>

                <div className="flex flex-col justify-center">
                  <span className="text-zinc-200 font-semibold">Opacity</span>
                  <div className="flex items-center gap-3 mt-1.5">
                    <input
                      type="range"
                      min="0.2"
                      max="1.0"
                      step="0.05"
                      value={settings.opacity}
                      onChange={handleOpacityChange}
                      className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-white interactive-control"
                    />
                    <span className="text-zinc-300 font-mono text-[10px] font-bold min-w-[28px] text-right">{Math.round(settings.opacity * 100)}%</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-center mt-6 pt-3 border-t border-zinc-905">
              <button 
                onClick={() => changePanel('timer')}
                className="px-8 py-2 bg-white text-zinc-950 hover:bg-zinc-200 transition-colors font-bold text-xs rounded shadow uppercase tracking-wider interactive-control"
              >
                Done
              </button>
            </div>
          </div>
        )}

        {/* 2. FIXED-SIZE ALARM CENTER / TIMER MANAGER */}
        {currentPanel === 'manager' && isCustomizeMode && (
          <div className="absolute inset-0 bg-zinc-950/98 flex flex-col p-6 z-10 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800/60 mb-4">
              <span className="text-[10px] font-bold text-zinc-400 tracking-widest uppercase">ALARM CENTER</span>
              <button 
                onClick={handleOpenAddPanel}
                className="text-zinc-400 hover:text-white flex items-center gap-1 text-[10px] font-bold px-3 py-1 rounded border border-zinc-850 bg-zinc-900/50 hover:border-zinc-650 transition-colors interactive-control"
              >
                <Plus className="w-3.5 h-3.5" /> ADD NEW
              </button>
            </div>

            <div className="grid grid-cols-[1.3fr_1fr] gap-6 flex-1 min-h-0">
              <div className="overflow-y-auto flex flex-col gap-2 pr-1 scrollbar-thin">
                {settings.timers.map(t => {
                  const isActive = t.id === settings.active_timer_id;
                  let display = '';
                  let isOverdueTimer = false;
                  
                  if (t.type === 'countdown') {
                    const rem = countdownRemainingRef.current[t.id] ?? t.duration_secs;
                    display = formatTime(rem, settings.show_seconds);
                  } else {
                    const diff = t.deadline_timestamp - Date.now();
                    isOverdueTimer = diff < 0;
                    display = (isOverdueTimer ? '+' : '') + formatTime(Math.floor(Math.abs(diff) / 1000), settings.show_seconds);
                  }

                  return (
                    <div
                      key={t.id}
                      onClick={() => {
                        setSettings(prev => {
                          const updated = { ...prev, active_timer_id: t.id };
                          invoke('save_settings_data', { settings: updated }).catch(console.error);
                          return updated;
                        });
                      }}
                      className={`flex items-center justify-between p-3 rounded-lg border transition-colors cursor-pointer interactive-control ${isActive ? 'bg-white/5 border-zinc-550' : 'bg-zinc-900/20 border-zinc-900 hover:bg-zinc-900/50 hover:border-zinc-800'}`}
                    >
                      <div className="flex flex-col min-w-0 flex-1 pr-2">
                        <span className="font-semibold text-zinc-200 truncate leading-tight text-xs">{t.label}</span>
                        <span className="text-[9px] text-zinc-500 mt-1 uppercase tracking-wider font-semibold">{t.type}</span>
                      </div>
                      
                      <div className="flex items-center gap-3 shrink-0">
                        <span className={`font-mono text-xs font-semibold ${isOverdueTimer ? 'text-rose-400' : 'text-zinc-350'}`}>
                          {display}
                        </span>
                        
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleOpenEditPanel(t.id); }}
                            className="text-zinc-500 hover:text-white p-1 rounded hover:bg-zinc-800 transition-all interactive-control"
                            title="Edit"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          {settings.timers.length > 1 && (
                            <button
                              onClick={(e) => handleDeleteTimer(t.id, e)}
                              className="text-zinc-500 hover:text-rose-455 p-1 rounded hover:bg-zinc-800 transition-all interactive-control"
                              title="Delete"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-col justify-between border-l border-zinc-900 pl-6 text-zinc-400">
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-bold text-zinc-550 tracking-wider uppercase">Active Timer</span>
                  {activeTimer ? (
                    <div className="bg-zinc-900/40 border border-zinc-900 p-4 rounded-lg flex flex-col gap-1.5 mt-1">
                      <span className="text-white font-bold truncate text-sm">{activeTimer.label}</span>
                      <span className="text-[9px] uppercase font-semibold text-zinc-550 tracking-wider">{activeTimer.type}</span>
                      <span className="text-[10px] text-zinc-400 mt-2 block">
                        This is the active overlay timer. Click any timer in the list to select it as the hero overlay.
                      </span>
                    </div>
                  ) : (
                    <span className="text-[10px] text-zinc-500 mt-1">No timer selected.</span>
                  )}
                </div>

                <button
                  onClick={() => changePanel('timer')}
                  className="w-full border border-zinc-800 hover:border-zinc-650 hover:text-white rounded py-2 font-bold text-xs uppercase tracking-wider transition-colors interactive-control"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 3. FIXED-SIZE ADD / EDIT TIMERS (DEADLINE EDITOR) */}
        {(currentPanel === 'add' || currentPanel === 'edit') && isCustomizeMode && (
          <div className="absolute inset-0 bg-zinc-950/99 flex flex-col p-6 z-10 text-xs">
            <div className="pb-2.5 border-b border-zinc-800/60 mb-4 shrink-0">
              <span className="text-[10px] font-bold text-zinc-400 tracking-widest uppercase">
                {currentPanel === 'add' ? 'ADD NEW TIMER' : 'EDIT TIMER'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-8 flex-1 min-h-0 items-start">
              <div className="flex flex-col h-full border-r border-zinc-900 pr-6 justify-center">
                <div className="flex border border-zinc-850 rounded-lg p-0.5 bg-zinc-900/30 mb-3 shrink-0">
                  <button
                    onClick={() => setFormType('countdown')}
                    className={`flex-1 text-[9px] font-bold py-1.5 rounded transition-colors interactive-control ${formType === 'countdown' ? 'bg-white text-zinc-950' : 'text-zinc-500 hover:text-zinc-350'}`}
                  >
                    COUNTDOWN
                  </button>
                  <button
                    onClick={() => setFormType('deadline')}
                    className={`flex-1 text-[9px] font-bold py-1.5 rounded transition-colors interactive-control ${formType === 'deadline' ? 'bg-white text-zinc-950' : 'text-zinc-500 hover:text-zinc-350'}`}
                  >
                    DEADLINE
                  </button>
                </div>

                {formType === 'deadline' ? (
                  <div className="flex flex-col flex-1 justify-center min-h-0">
                    <div className="flex justify-between items-center text-[10px] font-bold mb-2">
                      <button 
                        onClick={() => {
                          setCurrentMonth(prev => {
                            if (prev === 0) { setCurrentYear(y => y - 1); return 11; }
                            return prev - 1;
                          });
                        }}
                        className="px-2 py-0.5 bg-zinc-900 border border-zinc-800 rounded-md interactive-control text-zinc-400 hover:text-white"
                      >
                        &lt;
                      </button>
                      <span className="uppercase text-zinc-350 font-bold tracking-wider">
                        {new Date(currentYear, currentMonth).toLocaleString('default', { month: 'short' })} {currentYear}
                      </span>
                      <button 
                        onClick={() => {
                          setCurrentMonth(prev => {
                            if (prev === 11) { setCurrentYear(y => y + 1); return 0; }
                            return prev + 1;
                          });
                        }}
                        className="px-2 py-0.5 bg-zinc-900 border border-zinc-800 rounded-md interactive-control text-zinc-400 hover:text-white"
                      >
                        &gt;
                      </button>
                    </div>

                    <div className="grid grid-cols-7 text-center text-[8px] text-zinc-550 font-bold mb-1">
                      <span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>
                    </div>

                    <div className="grid grid-cols-7 gap-1">
                      {calendarDays.map((day, idx) => {
                        if (!day) return <div key={idx} className="h-6 w-6" />;
                        
                        const isSel = selectedDate && 
                          selectedDate.getDate() === day.getDate() && 
                          selectedDate.getMonth() === day.getMonth() && 
                          selectedDate.getFullYear() === day.getFullYear();

                        const isTdy = new Date().getDate() === day.getDate() && 
                          new Date().getMonth() === day.getMonth() && 
                          new Date().getFullYear() === day.getFullYear();

                        return (
                          <button
                            key={idx}
                            onClick={() => setSelectedDate(day)}
                            className={`h-6 w-full rounded flex items-center justify-center text-[10px] font-bold interactive-control transition-colors ${
                              isSel 
                                ? 'bg-white text-zinc-950 shadow' 
                                : isTdy 
                                  ? 'border border-zinc-650 text-white' 
                                  : 'text-zinc-400 hover:bg-zinc-855 hover:text-white'
                            }`}
                          >
                            {day.getDate()}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 justify-center flex-1">
                    <span className="text-zinc-550 font-bold text-[9px] uppercase tracking-wider block">Duration Limits</span>
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col items-center">
                        <input
                          type="number"
                          min="0"
                          max="23"
                          value={formHours}
                          onKeyDown={handleCountdownHoursKeyDown}
                          onChange={(e) => setFormHours(Math.max(0, Math.min(23, parseInt(e.target.value, 10) || 0)))}
                          className="w-12 h-9 text-center bg-zinc-900 border border-zinc-800 focus:border-zinc-550 text-white rounded-lg p-1 outline-none font-mono text-sm font-bold selection:bg-white/20 interactive-control"
                        />
                        <span className="text-[8px] text-zinc-500 font-bold mt-1 tracking-wider uppercase">HRS</span>
                      </div>
                      <span className="text-zinc-500 font-bold text-lg mb-4">:</span>
                      <div className="flex flex-col items-center">
                        <input
                          type="number"
                          min="0"
                          max="59"
                          value={formMinutes}
                          onKeyDown={handleCountdownMinutesKeyDown}
                          onChange={(e) => setFormMinutes(Math.max(0, Math.min(59, parseInt(e.target.value, 10) || 0)))}
                          className="w-12 h-9 text-center bg-zinc-900 border border-zinc-800 focus:border-zinc-555 text-white rounded-lg p-1 outline-none font-mono text-sm font-bold selection:bg-white/20 interactive-control"
                        />
                        <span className="text-[8px] text-zinc-500 font-bold mt-1 tracking-wider uppercase">MIN</span>
                      </div>
                      <span className="text-zinc-500 font-bold text-lg mb-4">:</span>
                      <div className="flex flex-col items-center">
                        <input
                          type="number"
                          min="0"
                          max="59"
                          value={formSeconds}
                          onKeyDown={handleCountdownSecondsKeyDown}
                          onChange={(e) => setFormSeconds(Math.max(0, Math.min(59, parseInt(e.target.value, 10) || 0)))}
                          className="w-12 h-9 text-center bg-zinc-900 border border-zinc-800 focus:border-zinc-550 text-white rounded-lg p-1 outline-none font-mono text-sm font-bold selection:bg-white/20 interactive-control"
                        />
                        <span className="text-[8px] text-zinc-500 font-bold mt-1 tracking-wider uppercase">SEC</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col justify-between h-full min-h-0">
                <div className="flex flex-col gap-3">
                  <div>
                    <span className="text-zinc-555 font-bold text-[8.5px] uppercase tracking-wider block mb-1">Label</span>
                    <input
                      type="text"
                      placeholder="e.g. Placement OA"
                      value={formLabel}
                      onChange={(e) => setFormLabel(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 text-white rounded-lg px-2.5 py-1.5 outline-none text-xs placeholder-zinc-700 font-medium focus:border-zinc-650 transition-colors interactive-control"
                    />
                  </div>

                  {formType === 'deadline' && (
                    <div className="flex flex-col gap-3">
                      <div>
                        <span className="text-zinc-555 font-bold text-[8.5px] uppercase tracking-wider block mb-1">Presets</span>
                        <div className="grid grid-cols-3 gap-1">
                          <button onClick={() => applyPreset('30m')} className="py-1 bg-zinc-900 border border-zinc-850 hover:bg-zinc-800 hover:text-white rounded-md text-[9px] font-semibold transition-colors interactive-control">+30m</button>
                          <button onClick={() => applyPreset('1h')} className="py-1 bg-zinc-900 border border-zinc-855 hover:bg-zinc-800 hover:text-white rounded-md text-[9px] font-semibold transition-colors interactive-control">+1h</button>
                          <button onClick={() => applyPreset('2h')} className="py-1 bg-zinc-900 border border-zinc-850 hover:bg-zinc-800 hover:text-white rounded-md text-[9px] font-semibold transition-colors interactive-control">+2h</button>
                          <button onClick={() => applyPreset('tonight')} className="py-1 bg-zinc-900 border border-zinc-850 hover:bg-zinc-800 hover:text-white rounded-md text-[9px] font-semibold transition-colors interactive-control">Tonight</button>
                          <button onClick={() => applyPreset('tomorrow')} className="py-1 bg-zinc-900 border border-zinc-850 hover:bg-zinc-800 hover:text-white rounded-md text-[9px] font-semibold transition-colors interactive-control">Tmrw</button>
                          <button onClick={() => applyPreset('next-monday')} className="py-1 bg-zinc-900 border border-zinc-850 hover:bg-zinc-800 hover:text-white rounded-md text-[9px] font-semibold transition-colors interactive-control">Next Mon</button>
                        </div>
                      </div>

                      <div>
                        <span className="text-zinc-555 font-bold text-[8.5px] uppercase tracking-wider block mb-1">Time</span>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min="1"
                            max="12"
                            value={selectedHour}
                            onKeyDown={handleHourKeyDown}
                            onChange={(e) => setSelectedHour(String(Math.max(1, Math.min(12, parseInt(e.target.value, 10) || 12))).padStart(2, '0'))}
                            className="w-11 h-8 text-center bg-zinc-900 border border-zinc-800 focus:border-zinc-550 text-white rounded-lg p-1 outline-none font-mono text-xs font-semibold interactive-control"
                          />
                          <span className="text-zinc-555 font-bold text-xs">:</span>
                          <input
                            type="number"
                            min="0"
                            max="59"
                            value={selectedMinute}
                            onKeyDown={handleMinuteKeyDown}
                            onChange={(e) => setSelectedMinute(String(Math.max(0, Math.min(59, parseInt(e.target.value, 10) || 0))).padStart(2, '0'))}
                            className="w-11 h-8 text-center bg-zinc-900 border border-zinc-800 focus:border-zinc-550 text-white rounded-lg p-1 outline-none font-mono text-xs font-semibold interactive-control"
                          />
                          <button
                            onClick={() => setSelectedAmPm(prev => prev === 'AM' ? 'PM' : 'AM')}
                            className="h-8 px-2.5 bg-zinc-900 border border-zinc-800 hover:border-zinc-550 text-zinc-350 rounded-lg text-[9px] font-bold transition-colors shrink-0 interactive-control"
                          >
                            {selectedAmPm}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3 mt-4 shrink-0">
                  <button
                    onClick={() => {
                      changePanel(editingTimerId ? 'timer' : 'manager');
                      setEditingTimerId(null);
                    }}
                    className="flex-1 border border-zinc-800 hover:border-zinc-700 hover:text-white text-zinc-400 rounded-lg py-2 font-bold text-[9px] uppercase tracking-widest transition-colors interactive-control"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveForm}
                    className="flex-1 bg-white hover:bg-zinc-200 text-zinc-950 rounded-lg py-2 font-bold text-[9px] uppercase tracking-widest transition-colors interactive-control"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
