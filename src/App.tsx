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
  Edit2,
  Check
} from 'lucide-react';
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

interface TimerModel {
  id: string;
  label: string;
  type: 'countdown' | 'deadline';
  duration_secs: number; // for countdown
  deadline_timestamp: number; // for deadline (epoch ms)
  is_completed: boolean;
  is_cancelled: boolean;
  alarm_enabled: boolean;
  is_running: boolean;
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
  overlay_timer_selection: 'automatic' | 'manual';
}

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
        is_completed: false,
        is_cancelled: false,
        alarm_enabled: true,
        is_running: false,
      }
    ],
    notification_sound: true,
    notification_auto_switch: false,
    auto_dock: true,
    overlay_timer_selection: 'automatic',
  });

  // Mode States (Focus Mode is default)
  const [isCustomizeMode, setIsCustomizeModeState] = useState(false);
  const [badgeText, setBadgeText] = useState<string | null>(null);

  // Auto Dock removed placeholders
  const isDocked = false;

  // Sync refs to avoid stale closures in event listeners
  const isCustomizeModeRef = useRef(false);
  const currentPanelRef = useRef<'timer' | 'settings' | 'manager' | 'add' | 'edit'>('timer');

  const setIsCustomizeMode = (val: boolean | ((prev: boolean) => boolean)) => {
    setIsCustomizeModeState(prev => {
      const next = typeof val === 'function' ? val(prev) : val;
      isCustomizeModeRef.current = next;
      return next;
    });
  };

  const badgeTimeoutRef = useRef<number | null>(null);

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
  const [remainingSeconds, setRemainingSeconds] = useState(300);

  // Refs for state caching and timing
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
  const [formAlarmEnabled, setFormAlarmEnabled] = useState(true);

  // Show badge for 2 seconds
  const triggerBadge = (text: string) => {
    if (badgeTimeoutRef.current) clearTimeout(badgeTimeoutRef.current);
    setBadgeText(text);
    badgeTimeoutRef.current = window.setTimeout(() => {
      setBadgeText(null);
    }, 2000);
  };



  // Hover docking triggers (Auto Dock disabled)
  const handleMouseEnter = () => {};
  const handleMouseLeave = () => {};

  // Listen to Global Shortcut Mode Toggle
  useEffect(() => {
    const unlisten = listen('toggle-mode', async () => {
      setIsCustomizeMode(prev => {
        const nextMode = !prev;
        triggerBadge(nextMode ? 'Customize Mode' : 'Focus Mode');
        return nextMode;
      });
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, []);

  // Update window resizability and always-on-top modes dynamically
  useEffect(() => {
    const applyModeFlags = async () => {
      // Only modify flags if not in editing/config panel
      if (currentPanel === 'timer') {
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
  }, [isCustomizeMode, currentPanel, settings.always_on_top]);

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

  const getRemainingSecondsForTimer = (t: TimerModel) => {
    if (t.type === 'countdown') {
      return countdownRemainingRef.current[t.id] !== undefined 
        ? countdownRemainingRef.current[t.id] 
        : t.duration_secs;
    } else {
      const diffMs = t.deadline_timestamp - Date.now();
      return Math.ceil(diffMs / 1000);
    }
  };

  const determineAutomaticActiveId = (timers: TimerModel[], currentActiveId: string) => {
    const currentActive = timers.find(t => t.id === currentActiveId);
    if (currentActive && !currentActive.is_completed && !currentActive.is_cancelled) {
      const rem = getRemainingSecondsForTimer(currentActive);
      if (rem <= 0) {
        return currentActiveId;
      }
    }

    const pending = timers.filter(t => !t.is_completed && !t.is_cancelled);
    if (pending.length === 0) {
      return '';
    }

    const sorted = [...pending].sort((a, b) => {
      return getRemainingSecondsForTimer(a) - getRemainingSecondsForTimer(b);
    });

    return sorted[0].id;
  };

  const activeTimer = settings.overlay_timer_selection === 'manual'
    ? (settings.timers.find(t => t.id === settings.active_timer_id) || settings.timers[0])
    : (settings.timers.find(t => t.id === settings.active_timer_id) || settings.timers.find(t => !t.is_completed && !t.is_cancelled) || settings.timers[0]);

  const isRunning = !!activeTimer?.is_running;

  const [flashOverlayOpacity, setFlashOverlayOpacity] = useState(0);

  const triggerFlashAnimation = () => {
    setFlashOverlayOpacity(0.9);
    setTimeout(() => {
      setFlashOverlayOpacity(0);
    }, 20);
  };

  const acknowledgeTimer = (id: string) => {
    expiredTimersRef.current[id] = false;
    setSettings(prev => {
      const updated = prev.timers.map(t => {
        if (t.id === id) {
          return { ...t, is_completed: true, is_running: false };
        }
        return t;
      });
      
      let nextActiveId = prev.active_timer_id;
      if (prev.overlay_timer_selection === 'automatic') {
        nextActiveId = determineAutomaticActiveId(updated, id);
      }
      
      const newSettings = {
        ...prev,
        timers: updated,
        active_timer_id: nextActiveId
      };
      invoke('save_settings_data', { settings: newSettings }).catch(console.error);
      return newSettings;
    });
  };

  // Helper: trigger notification sound + alert
  const triggerExpirationNotification = (timer: TimerModel) => {
    if (Notification.permission === 'granted') {
      const notif = new Notification(`Chrono - Timer Finished`, {
        body: `"${timer.label || 'Timer'}" has completed!`,
      });
      notif.onclick = () => {
        acknowledgeTimer(timer.id);
      };
    }

    if (settings.notification_sound && timer.alarm_enabled !== false) {
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

  // unified ticking loop for all countdowns and deadline timers
  useEffect(() => {
    const interval = setInterval(() => {
      let settingsChanged = false;
      let nextTimers = settings.timers.map(t => {
        // Sync ref value for countdown timer if not initialized yet
        if (t.type === 'countdown' && countdownRemainingRef.current[t.id] === undefined) {
          countdownRemainingRef.current[t.id] = t.duration_secs;
        }
        return t;
      });

      // 1. Tick down all running countdown timers
      nextTimers = nextTimers.map(t => {
        if (t.type === 'countdown' && t.is_running && !t.is_completed && !t.is_cancelled) {
          const cur = countdownRemainingRef.current[t.id];
          if (cur <= 0) {
            triggerExpirationNotification(t);
            if (t.id === settings.active_timer_id) {
              triggerFlashAnimation();
            }
            settingsChanged = true;
            return { ...t, is_running: false };
          } else {
            const nextVal = cur - 1;
            countdownRemainingRef.current[t.id] = nextVal;
            if (nextVal <= 0) {
              triggerExpirationNotification(t);
              if (t.id === settings.active_timer_id) {
                triggerFlashAnimation();
              }
              settingsChanged = true;
              return { ...t, is_running: false };
            }
          }
        }
        return t;
      });

      // 2. Check all deadline timers for expiration
      const now = Date.now();
      nextTimers = nextTimers.map(t => {
        if (t.type === 'deadline' && !t.is_completed && !t.is_cancelled) {
          const diffMs = t.deadline_timestamp - now;
          if (diffMs <= 0) {
            if (expiredTimersRef.current[t.id] !== true) {
              expiredTimersRef.current[t.id] = true;
              triggerExpirationNotification(t);
              if (t.id === settings.active_timer_id) {
                triggerFlashAnimation();
              }
            }
          }
        }
        return t;
      });

      // 3. Update remaining seconds state for the currently active timer
      if (activeTimer) {
        if (activeTimer.type === 'countdown') {
          const rem = countdownRemainingRef.current[activeTimer.id] ?? activeTimer.duration_secs;
          setRemainingSeconds(rem);
        } else {
          const diff = activeTimer.deadline_timestamp - Date.now();
          setRemainingSeconds(Math.ceil(diff / 1000));
        }
      } else {
        setRemainingSeconds(0);
      }

      // 4. In automatic selection mode, check if we need to switch active timer
      if (settings.overlay_timer_selection === 'automatic') {
        const nextActiveId = determineAutomaticActiveId(nextTimers, settings.active_timer_id);
        if (nextActiveId !== settings.active_timer_id) {
          setSettings(prev => {
            const newSettings = {
              ...prev,
              timers: nextTimers,
              active_timer_id: nextActiveId
            };
            invoke('save_settings_data', { settings: newSettings }).catch(console.error);
            return newSettings;
          });
          return;
        }
      }

      if (settingsChanged) {
        setSettings(prev => {
          const newSettings = { ...prev, timers: nextTimers };
          invoke('save_settings_data', { settings: newSettings }).catch(console.error);
          return newSettings;
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [settings.timers, settings.active_timer_id, settings.overlay_timer_selection, activeTimer]);

  // Flash logic for finished countdowns
  // Play / Pause toggler (countdown only)
  const toggleTimer = () => {
    if (!activeTimer || activeTimer.type === 'deadline') return;
    const isExpired = (countdownRemainingRef.current[activeTimer.id] ?? activeTimer.duration_secs) <= 0 && !activeTimer.is_completed && !activeTimer.is_cancelled;
    if (isExpired) {
      acknowledgeTimer(activeTimer.id);
      return;
    }
    setSettings(prev => {
      const updated = prev.timers.map(t => {
        if (t.id === activeTimer.id) {
          return { ...t, is_running: !t.is_running, is_completed: false };
        }
        return t;
      });
      const newSettings = { ...prev, timers: updated };
      invoke('save_settings_data', { settings: newSettings }).catch(console.error);
      return newSettings;
    });
  };

  // Reset timer
  const resetTimer = () => {
    if (!activeTimer) return;
    setSettings(prev => {
      const updated = prev.timers.map(t => {
        if (t.id === activeTimer.id) {
          countdownRemainingRef.current[t.id] = t.duration_secs;
          expiredTimersRef.current[t.id] = false;
          return { ...t, is_running: false, is_completed: false };
        }
        return t;
      });
      const newSettings = { ...prev, timers: updated };
      invoke('save_settings_data', { settings: newSettings }).catch(console.error);
      return newSettings;
    });

    if (activeTimer.type === 'countdown') {
      setRemainingSeconds(activeTimer.duration_secs);
    } else {
      const diff = activeTimer.deadline_timestamp - Date.now();
      setRemainingSeconds(Math.ceil(diff / 1000));
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
          if (isOverdue && activeTimer) {
            acknowledgeTimer(activeTimer.id);
          } else {
            handleOpenEditPanel();
          }
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

    const targetId = id || activeTimer?.id;
    const targetTimer = settings.timers.find(t => t.id === targetId);
    if (!targetTimer) return;

    setEditingTimerId(targetTimer.id);
    setFormType(targetTimer.type);
    setFormLabel(targetTimer.label);
    setFormAlarmEnabled(targetTimer.alarm_enabled !== false);

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
    setFormAlarmEnabled(true);

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
        is_completed: false,
        is_cancelled: false,
        alarm_enabled: formAlarmEnabled,
        is_running: false,
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
        is_completed: false,
        is_cancelled: false,
        alarm_enabled: formAlarmEnabled,
        is_running: false,
      };
      expiredTimersRef.current[id] = false;
    }

    setSettings(prev => {
      let updatedTimers = [...prev.timers];
      if (editingTimerId) {
        const existing = prev.timers.find(t => t.id === editingTimerId);
        newTimer.is_running = existing ? existing.is_running : false;
        newTimer.is_completed = existing ? existing.is_completed : false;
        newTimer.is_cancelled = existing ? existing.is_cancelled : false;
        updatedTimers = updatedTimers.map(t => t.id === editingTimerId ? newTimer : t);
      } else {
        updatedTimers.push(newTimer);
      }

      let activeId = prev.active_timer_id;
      if (prev.overlay_timer_selection === 'automatic') {
        activeId = determineAutomaticActiveId(updatedTimers, activeId);
      } else {
        activeId = editingTimerId === prev.active_timer_id || updatedTimers.length === 1 ? id : prev.active_timer_id;
      }

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
      if (prev.overlay_timer_selection === 'automatic') {
        activeId = determineAutomaticActiveId(updated, activeId);
      } else {
        if (prev.active_timer_id === id) {
          activeId = updated[0].id;
        }
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

  const handleToggleTimerInList = (id: string) => {
    setSettings(prev => {
      const updated = prev.timers.map(t => {
        if (t.id === id) {
          return { ...t, is_running: !t.is_running, is_completed: false };
        }
        return t;
      });
      const newSettings = { ...prev, timers: updated };
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

  const handleSetSelectionMode = (mode: 'automatic' | 'manual') => {
    setSettings(prev => {
      let nextActiveId = prev.active_timer_id;
      if (mode === 'automatic') {
        nextActiveId = determineAutomaticActiveId(prev.timers, prev.active_timer_id);
      }
      const updated = {
        ...prev,
        overlay_timer_selection: mode,
        active_timer_id: nextActiveId
      };
      invoke('save_settings_data', { settings: updated }).catch(console.error);
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
  const isOverdue = !!(activeTimer && activeTimer.type === 'deadline' && remainingSeconds < 0);
  const isActiveTimerExpired = !!(
    activeTimer &&
    !activeTimer.is_completed &&
    !activeTimer.is_cancelled &&
    remainingSeconds <= 0
  );
  const displaySecs = activeTimer ? (isOverdue ? Math.abs(remainingSeconds) : Math.max(0, remainingSeconds)) : 0;
  const formatted = formatTime(displaySecs, settings.show_seconds);
  const formattedText = isOverdue ? `+${formatted}` : formatted;
  const placeholderDigits = formattedText.replace(/\d/g, '8');

  // Hero Clock Sizing Logic: Scales cleanly but caps securely
  const getTimerFontSize = () => {
    const usableWidth = windowSize.width - 32;
    const usableHeight = windowSize.height - 48;
    
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
        className={`w-full h-full rounded-xl border border-zinc-800/80 shadow-2xl flex flex-col justify-center px-3.5 select-none backdrop-blur-md transition-all duration-300 ${isActiveTimerExpired ? 'alarm-active' : 'bg-zinc-950/90'}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={() => {
          if (isActiveTimerExpired && activeTimer) {
            acknowledgeTimer(activeTimer.id);
          }
        }}
        title={isActiveTimerExpired ? "Click to dismiss alarm" : undefined}
      >
        {isActiveTimerExpired ? (
          <span className="text-[9px] uppercase font-extrabold tracking-widest text-rose-450 truncate leading-none mb-1 pointer-events-none">
            EXPIRED
          </span>
        ) : (
          activeTimer?.label ? (
            <span className="text-[9px] uppercase font-bold tracking-widest text-zinc-500 truncate leading-none mb-1 pointer-events-none">
              {activeTimer.label}
            </span>
          ) : (
            <span className="text-[9px] uppercase font-bold tracking-widest text-zinc-600 truncate leading-none mb-1 pointer-events-none">
              IDLE
            </span>
          )
        )}
        <div 
          className={`countdown-text-element font-normal leading-none pointer-events-none ${isActiveTimerExpired ? 'text-rose-500' : 'text-white'}`}
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
      className={`w-full h-full rounded-2xl border border-zinc-800/40 shadow-2xl relative overflow-hidden backdrop-blur-md select-none group flex flex-col transition-all duration-300 ${isActiveTimerExpired ? 'alarm-active' : 'bg-zinc-950/85'}`}
      onDoubleClick={handleResetSize}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{ opacity: settings.opacity }}
    >
      {/* Expiration visual flash overlay */}
      <div 
        className="absolute inset-0 bg-white pointer-events-none transition-opacity duration-200 z-50"
        style={{ opacity: flashOverlayOpacity }}
      />
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
              {isActiveTimerExpired ? (
                <span className="font-extrabold tracking-widest text-rose-500 uppercase text-[9.5px] animate-pulse">
                  {activeTimer?.type === 'deadline' ? 'OVERDUE' : 'EXPIRED'}
                </span>
              ) : activeTimer?.label ? (
                <span className="uppercase font-bold tracking-widest text-zinc-500 truncate max-w-full text-center text-[9.5px]">
                  {activeTimer.label}
                </span>
              ) : (
                <span className="uppercase font-bold tracking-widest text-zinc-600 truncate max-w-full text-center text-[9.5px]">
                  IDLE
                </span>
              )}
            </div>

            {/* Clock display */}
            <div 
              className={`clock-display relative select-none py-0.5 flex items-center justify-center ${(isCustomizeMode || isActiveTimerExpired) ? 'cursor-pointer' : 'cursor-default'}`}
              title={isActiveTimerExpired ? "Click to dismiss alarm" : (isCustomizeMode ? "Click to edit/configure timer" : undefined)}
              onClick={() => {
                if (isActiveTimerExpired && activeTimer) {
                  acknowledgeTimer(activeTimer.id);
                } else if (isCustomizeMode && activeTimer) {
                  handleOpenEditPanel(activeTimer.id);
                }
              }}
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
                className={`countdown-text-element absolute top-0 left-0 w-full h-full flex items-center justify-center font-normal opacity-100 ${isActiveTimerExpired ? 'text-rose-500' : 'text-white'}`}
                style={{ 
                  fontFamily: 'DSEG7Classic',
                  fontSize: `${timerFontSize}px`,
                  lineHeight: 1
                }}
              >
                {formattedText}
              </div>
            </div>

            {/* Clear, elegant dismissal button when expired */}
            {isActiveTimerExpired && activeTimer && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  acknowledgeTimer(activeTimer.id);
                }}
                className="mt-3 px-5 py-1.5 bg-rose-600/90 hover:bg-rose-500 text-white font-extrabold tracking-widest text-[9.5px] rounded-lg border border-rose-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all interactive-control shadow-xl focus:outline-none"
              >
                DISMISS ALARM
              </button>
            )}

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
          <div className="absolute inset-0 bg-zinc-950/90 backdrop-blur-md flex flex-col p-6 z-10 text-xs">
            <div className="pb-3 border-b border-zinc-800/80 mb-4">
              <span className="text-[10px] font-bold text-zinc-300 tracking-widest uppercase">SYSTEM SETTINGS</span>
            </div>

            <div className="grid grid-cols-2 gap-x-8 gap-y-4 flex-1">
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-zinc-100 font-bold">Show Seconds</span>
                    <span className="text-[10px] text-zinc-400 font-medium">Render second digits in overlay</span>
                  </div>
                  <button
                    onClick={handleToggleSeconds}
                    className={`w-9 h-5 rounded-full p-0.5 transition-all focus-visible:ring-2 focus-visible:ring-zinc-450 focus:outline-none interactive-control ${settings.show_seconds ? 'bg-white' : 'bg-zinc-800 hover:bg-zinc-700 border border-zinc-700'}`}
                  >
                    <div className={`w-4 h-4 rounded-full transition-transform ${settings.show_seconds ? 'translate-x-4 bg-zinc-950' : 'translate-x-0 bg-zinc-200'}`} />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-zinc-100 font-bold">Always On Top</span>
                    <span className="text-[10px] text-zinc-400 font-medium">Float window above other apps</span>
                  </div>
                  <button
                    onClick={handleToggleAlwaysOnTop}
                    className={`w-9 h-5 rounded-full p-0.5 transition-all focus-visible:ring-2 focus-visible:ring-zinc-450 focus:outline-none interactive-control ${settings.always_on_top ? 'bg-white' : 'bg-zinc-800 hover:bg-zinc-700 border border-zinc-700'}`}
                  >
                    <div className={`w-4 h-4 rounded-full transition-transform ${settings.always_on_top ? 'translate-x-4 bg-zinc-950' : 'translate-x-0 bg-zinc-200'}`} />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-zinc-100 font-bold">Launch with Windows</span>
                    <span className="text-[10px] text-zinc-400 font-medium">Auto-start Chrono on boot</span>
                  </div>
                  <button
                    onClick={handleToggleStartup}
                    className={`w-9 h-5 rounded-full p-0.5 transition-all focus-visible:ring-2 focus-visible:ring-zinc-450 focus:outline-none interactive-control ${settings.launch_at_startup ? 'bg-white' : 'bg-zinc-800 hover:bg-zinc-700 border border-zinc-700'}`}
                  >
                    <div className={`w-4 h-4 rounded-full transition-transform ${settings.launch_at_startup ? 'translate-x-4 bg-zinc-950' : 'translate-x-0 bg-zinc-200'}`} />
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-zinc-100 font-bold">Notification Sound</span>
                    <span className="text-[10px] text-zinc-400 font-medium">Play local dual-tone synth audio</span>
                  </div>
                  <button
                    onClick={handleToggleSound}
                    className={`w-9 h-5 rounded-full p-0.5 transition-all focus-visible:ring-2 focus-visible:ring-zinc-450 focus:outline-none interactive-control ${settings.notification_sound ? 'bg-white' : 'bg-zinc-800 hover:bg-zinc-700 border border-zinc-700'}`}
                  >
                    <div className={`w-4 h-4 rounded-full transition-transform ${settings.notification_sound ? 'translate-x-4 bg-zinc-950' : 'translate-x-0 bg-zinc-200'}`} />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-zinc-100 font-bold">Timer Selection</span>
                    <span className="text-[10px] text-zinc-400 font-medium">Automatic next due vs Manual selection</span>
                  </div>
                  <div className="flex bg-zinc-900 border border-zinc-800 rounded p-0.5 shrink-0">
                    <button
                      onClick={() => handleSetSelectionMode('automatic')}
                      className={`px-2.5 py-1 rounded text-[8.5px] font-extrabold tracking-wider transition-all interactive-control focus:outline-none ${settings.overlay_timer_selection === 'automatic' ? 'bg-white text-zinc-950 shadow' : 'text-zinc-400 hover:text-zinc-200'}`}
                    >
                      AUTO
                    </button>
                    <button
                      onClick={() => handleSetSelectionMode('manual')}
                      className={`px-2.5 py-1 rounded text-[8.5px] font-extrabold tracking-wider transition-all interactive-control focus:outline-none ${settings.overlay_timer_selection === 'manual' ? 'bg-white text-zinc-950 shadow' : 'text-zinc-400 hover:text-zinc-200'}`}
                    >
                      MANUAL
                    </button>
                  </div>
                </div>

                <div className="flex flex-col justify-center">
                  <span className="text-zinc-100 font-bold">Opacity</span>
                  <div className="flex items-center gap-3 mt-1.5">
                    <input
                      type="range"
                      min="0.2"
                      max="1.0"
                      step="0.05"
                      value={settings.opacity}
                      onChange={handleOpacityChange}
                      className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-white interactive-control"
                    />
                    <span className="text-zinc-100 font-mono text-[10px] font-bold min-w-[28px] text-right">{Math.round(settings.opacity * 100)}%</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-center mt-6 pt-3 border-t border-zinc-800/80">
              <button 
                onClick={() => changePanel('timer')}
                className="px-8 py-2 bg-white text-zinc-950 hover:bg-zinc-100 active:scale-[0.98] transition-all font-bold text-xs rounded shadow uppercase tracking-wider interactive-control focus-visible:ring-2 focus-visible:ring-white focus:outline-none"
              >
                Done
              </button>
            </div>
          </div>
        )}

        {/* 2. FIXED-SIZE ALARM CENTER / TIMER MANAGER */}
        {currentPanel === 'manager' && isCustomizeMode && (
          <div className="absolute inset-0 bg-zinc-950/90 backdrop-blur-md flex flex-col p-6 z-10 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80 mb-4">
              <span className="text-[10px] font-bold text-zinc-300 tracking-widest uppercase">ALARM CENTER</span>
              <button 
                onClick={handleOpenAddPanel}
                className="text-zinc-200 hover:text-white flex items-center gap-1 text-[10px] font-bold px-3 py-1 rounded border border-zinc-700 bg-zinc-900/60 hover:bg-zinc-800 hover:border-zinc-500 transition-colors interactive-control focus-visible:ring-2 focus-visible:ring-zinc-450 focus:outline-none"
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
                    isOverdueTimer = rem <= 0 && !t.is_completed && !t.is_cancelled;
                  } else {
                    const diff = t.deadline_timestamp - Date.now();
                    isOverdueTimer = diff < 0 && !t.is_completed && !t.is_cancelled;
                    display = (diff < 0 ? '+' : '') + formatTime(Math.floor(Math.abs(diff) / 1000), settings.show_seconds);
                  }

                  const getTimerStatusText = (timer: TimerModel) => {
                    if (timer.is_completed) return { text: 'Completed', color: 'text-emerald-450 font-bold' };
                    if (timer.is_cancelled) return { text: 'Cancelled', color: 'text-zinc-500 font-bold' };
                    
                    const rem = getRemainingSecondsForTimer(timer);
                    if (rem <= 0) return { text: 'Expired', color: 'text-rose-450 font-bold' };
                    
                    if (timer.type === 'countdown') {
                      return timer.is_running 
                        ? { text: 'Running', color: 'text-white' } 
                        : { text: 'Paused', color: 'text-zinc-400' };
                    } else {
                      return { text: 'Pending', color: 'text-zinc-300' };
                    }
                  };

                  const statusInfo = getTimerStatusText(t);

                  return (
                    <div
                      key={t.id}
                      onClick={() => {
                        if (settings.overlay_timer_selection === 'manual') {
                          setSettings(prev => {
                            const updated = { ...prev, active_timer_id: t.id };
                            invoke('save_settings_data', { settings: updated }).catch(console.error);
                            return updated;
                          });
                        }
                      }}
                      className={`flex items-center justify-between p-3 rounded-lg border transition-all focus-visible:ring-2 focus-visible:ring-zinc-450 focus:outline-none ${settings.overlay_timer_selection === 'manual' ? 'cursor-pointer' : 'cursor-default'} ${isActive ? 'bg-white/10 border-zinc-300' : 'bg-zinc-900/40 border-zinc-800 hover:bg-zinc-900/60 hover:border-zinc-700'}`}
                    >
                      <div className="flex flex-col min-w-0 flex-1 pr-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className={`font-semibold truncate leading-tight text-xs ${isActive ? 'text-white' : 'text-zinc-200'}`}>{t.label}</span>
                          {isActive && (
                            <span className="bg-white/20 text-white border border-white/20 text-[7px] font-extrabold tracking-widest uppercase px-1 rounded shrink-0">
                              ACTIVE
                            </span>
                          )}
                          {t.is_completed && (
                            <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/35 text-[7px] font-extrabold tracking-widest uppercase px-1 rounded shrink-0">
                              DONE
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-[8.5px] font-semibold uppercase tracking-wider">
                          <span className={isActive ? 'text-zinc-300' : 'text-zinc-400'}>{t.type}</span>
                          <span className="text-zinc-700">•</span>
                          <span className={statusInfo.color}>{statusInfo.text}</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3 shrink-0">
                        <span className={`font-mono text-xs font-bold ${isOverdueTimer ? 'text-rose-450' : (isActive ? 'text-white' : 'text-zinc-300')}`}>
                          {display}
                        </span>
                        
                        <div className="flex items-center gap-1.5">
                          {t.type === 'countdown' && !t.is_completed && !t.is_cancelled && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleTimerInList(t.id);
                              }}
                              className="text-zinc-400 hover:text-white p-1 rounded hover:bg-zinc-800 transition-all interactive-control focus:outline-none"
                              title={t.is_running ? "Pause" : "Start"}
                            >
                              {t.is_running ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                            </button>
                          )}
                          
                          {getRemainingSecondsForTimer(t) <= 0 && !t.is_completed && !t.is_cancelled && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                acknowledgeTimer(t.id);
                              }}
                              className="text-rose-400 hover:text-emerald-450 p-1 rounded hover:bg-zinc-800 transition-all interactive-control focus:outline-none"
                              title="Acknowledge Timer"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <button
                            onClick={(e) => { e.stopPropagation(); handleOpenEditPanel(t.id); }}
                            className="text-zinc-400 hover:text-white p-1 rounded hover:bg-zinc-800 transition-all interactive-control focus-visible:ring-1 focus-visible:ring-zinc-450 focus:outline-none"
                            title="Edit"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          {settings.timers.length > 1 && (
                            <button
                              onClick={(e) => handleDeleteTimer(t.id, e)}
                              className="text-zinc-400 hover:text-rose-400 p-1 rounded hover:bg-zinc-800 transition-all interactive-control focus-visible:ring-1 focus-visible:ring-rose-500 focus:outline-none"
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

              <div className="flex flex-col justify-between border-l border-zinc-800 pl-6 text-zinc-300">
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-bold text-zinc-400 tracking-wider uppercase">Active Timer</span>
                  {activeTimer ? (
                    <div className="bg-zinc-900/60 border border-zinc-800 p-4 rounded-lg flex flex-col gap-1.5 mt-1">
                      <span className="text-white font-extrabold truncate text-sm">{activeTimer.label}</span>
                      <span className="text-[9px] uppercase font-semibold text-zinc-400 tracking-wider">{activeTimer.type}</span>
                      <span className="text-[10.5px] text-zinc-300 mt-2 block leading-relaxed font-medium">
                        {settings.overlay_timer_selection === 'manual' 
                          ? 'This is the active overlay timer. Click any timer in the list to select it as the active timer on the overlay.' 
                          : 'This timer is automatically selected because it is the earliest pending timer.'}
                      </span>
                    </div>
                  ) : (
                    <span className="text-[10px] text-zinc-400 mt-1">No timer selected.</span>
                  )}
                </div>

                <button
                  onClick={() => changePanel('timer')}
                  className="w-full border border-zinc-700 hover:border-zinc-500 text-zinc-200 hover:text-white rounded py-2 font-bold text-xs uppercase tracking-wider transition-colors interactive-control focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 focus:outline-none"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 3. FIXED-SIZE ADD / EDIT TIMERS (DEADLINE EDITOR) */}
        {(currentPanel === 'add' || currentPanel === 'edit') && isCustomizeMode && (
          <div className="absolute inset-0 bg-zinc-950/90 backdrop-blur-md flex flex-col p-6 z-10 text-xs">
            <div className="pb-2.5 border-b border-zinc-800/80 mb-4 shrink-0">
              <span className="text-[10px] font-bold text-zinc-300 tracking-widest uppercase">
                {currentPanel === 'add' ? 'ADD NEW TIMER' : 'EDIT TIMER'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-8 flex-1 min-h-0 items-start">
              <div className="flex flex-col h-full border-r border-zinc-800 pr-6 justify-center">
                <div className="flex border border-zinc-700 rounded-lg p-0.5 bg-zinc-900/50 mb-3 shrink-0">
                  <button
                    onClick={() => setFormType('countdown')}
                    className={`flex-1 text-[9px] font-extrabold py-1.5 rounded transition-all interactive-control focus:outline-none ${formType === 'countdown' ? 'bg-white text-zinc-950 shadow' : 'text-zinc-400 hover:text-zinc-200'}`}
                  >
                    COUNTDOWN
                  </button>
                  <button
                    onClick={() => setFormType('deadline')}
                    className={`flex-1 text-[9px] font-extrabold py-1.5 rounded transition-all interactive-control focus:outline-none ${formType === 'deadline' ? 'bg-white text-zinc-950 shadow' : 'text-zinc-400 hover:text-zinc-200'}`}
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
                        className="px-2.5 py-1 bg-zinc-900 border border-zinc-750 hover:border-zinc-550 rounded-md interactive-control text-zinc-200 hover:text-white transition-all focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-450"
                      >
                        &lt;
                      </button>
                      <span className="uppercase text-zinc-100 font-extrabold tracking-wider">
                        {new Date(currentYear, currentMonth).toLocaleString('default', { month: 'short' })} {currentYear}
                      </span>
                      <button 
                        onClick={() => {
                          setCurrentMonth(prev => {
                            if (prev === 11) { setCurrentYear(y => y + 1); return 0; }
                            return prev + 1;
                          });
                        }}
                        className="px-2.5 py-1 bg-zinc-900 border border-zinc-750 hover:border-zinc-550 rounded-md interactive-control text-zinc-200 hover:text-white transition-all focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-450"
                      >
                        &gt;
                      </button>
                    </div>

                    <div className="grid grid-cols-7 text-center text-[8px] text-zinc-400 font-extrabold mb-1 uppercase tracking-wider">
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
                            className={`h-6 w-full rounded flex items-center justify-center text-[10px] font-bold interactive-control transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-450 ${
                              isSel 
                                ? 'bg-white text-zinc-950 shadow' 
                                : isTdy 
                                  ? 'border border-zinc-400 text-zinc-50 font-extrabold bg-zinc-900/50' 
                                  : 'text-zinc-300 hover:bg-zinc-800 hover:text-white border border-transparent'
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
                    <span className="text-zinc-300 font-bold text-[9px] uppercase tracking-wider block">Duration Limits</span>
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col items-center">
                        <input
                          type="number"
                          min="0"
                          max="23"
                          value={formHours}
                          onKeyDown={handleCountdownHoursKeyDown}
                          onChange={(e) => setFormHours(Math.max(0, Math.min(23, parseInt(e.target.value, 10) || 0)))}
                          className="w-12 h-9 text-center bg-zinc-900 border border-zinc-750 focus:border-zinc-450 focus:bg-zinc-850 hover:border-zinc-600 text-white rounded-lg p-1 outline-none font-mono text-sm font-bold selection:bg-white/20 interactive-control transition-all"
                        />
                        <span className="text-[8px] text-zinc-400 font-bold mt-1 tracking-wider uppercase">HRS</span>
                      </div>
                      <span className="text-zinc-400 font-bold text-lg mb-4">:</span>
                      <div className="flex flex-col items-center">
                        <input
                          type="number"
                          min="0"
                          max="59"
                          value={formMinutes}
                          onKeyDown={handleCountdownMinutesKeyDown}
                          onChange={(e) => setFormMinutes(Math.max(0, Math.min(59, parseInt(e.target.value, 10) || 0)))}
                          className="w-12 h-9 text-center bg-zinc-900 border border-zinc-750 focus:border-zinc-455 focus:bg-zinc-850 hover:border-zinc-600 text-white rounded-lg p-1 outline-none font-mono text-sm font-bold selection:bg-white/20 interactive-control transition-all"
                        />
                        <span className="text-[8px] text-zinc-400 font-bold mt-1 tracking-wider uppercase">MIN</span>
                      </div>
                      <span className="text-zinc-400 font-bold text-lg mb-4">:</span>
                      <div className="flex flex-col items-center">
                        <input
                          type="number"
                          min="0"
                          max="59"
                          value={formSeconds}
                          onKeyDown={handleCountdownSecondsKeyDown}
                          onChange={(e) => setFormSeconds(Math.max(0, Math.min(59, parseInt(e.target.value, 10) || 0)))}
                          className="w-12 h-9 text-center bg-zinc-900 border border-zinc-750 focus:border-zinc-450 focus:bg-zinc-850 hover:border-zinc-600 text-white rounded-lg p-1 outline-none font-mono text-sm font-bold selection:bg-white/20 interactive-control transition-all"
                        />
                        <span className="text-[8px] text-zinc-400 font-bold mt-1 tracking-wider uppercase">SEC</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col justify-between h-full min-h-0">
                <div className="flex flex-col gap-3">
                  <div>
                    <span className="text-zinc-300 font-bold text-[8.5px] uppercase tracking-wider block mb-1">Label</span>
                    <input
                      type="text"
                      placeholder="e.g. Placement OA"
                      value={formLabel}
                      onChange={(e) => setFormLabel(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-750 text-white rounded-lg px-2.5 py-1.5 outline-none text-xs placeholder-zinc-550 font-bold focus:border-zinc-450 focus:bg-zinc-850 transition-all interactive-control"
                    />
                  </div>

                  <div className="flex items-center justify-between border-t border-b border-zinc-850/60 py-2 mt-0.5 shrink-0">
                    <div className="flex flex-col">
                      <span className="text-zinc-300 font-bold text-[8.5px] uppercase tracking-wider block">Alarm Sound</span>
                      <span className="text-[8px] text-zinc-500 font-semibold uppercase tracking-wider">Play tone when expired</span>
                    </div>
                    <button
                      onClick={() => setFormAlarmEnabled(!formAlarmEnabled)}
                      className={`w-8 h-4.5 rounded-full p-0.5 transition-all focus-visible:ring-1 focus-visible:ring-zinc-450 focus:outline-none interactive-control ${formAlarmEnabled ? 'bg-white' : 'bg-zinc-800 hover:bg-zinc-700 border border-zinc-700'}`}
                    >
                      <div className={`w-3.5 h-3.5 rounded-full transition-transform ${formAlarmEnabled ? 'translate-x-3.5 bg-zinc-950' : 'translate-x-0 bg-zinc-200'}`} />
                    </button>
                  </div>

                  {formType === 'deadline' && (
                    <div className="flex flex-col gap-3">
                      <div>
                        <span className="text-zinc-300 font-bold text-[8.5px] uppercase tracking-wider block mb-1">Presets</span>
                        <div className="grid grid-cols-3 gap-1">
                          <button onClick={() => applyPreset('30m')} className="py-1 bg-zinc-900 border border-zinc-750 hover:bg-zinc-800 hover:border-zinc-550 hover:text-white rounded-md text-[9px] font-bold transition-all interactive-control focus:outline-none">+30m</button>
                          <button onClick={() => applyPreset('1h')} className="py-1 bg-zinc-900 border border-zinc-755 hover:bg-zinc-800 hover:border-zinc-555 hover:text-white rounded-md text-[9px] font-bold transition-all interactive-control focus:outline-none">+1h</button>
                          <button onClick={() => applyPreset('2h')} className="py-1 bg-zinc-900 border border-zinc-750 hover:bg-zinc-800 hover:border-zinc-550 hover:text-white rounded-md text-[9px] font-bold transition-all interactive-control focus:outline-none">+2h</button>
                          <button onClick={() => applyPreset('tonight')} className="py-1 bg-zinc-900 border border-zinc-750 hover:bg-zinc-800 hover:border-zinc-550 hover:text-white rounded-md text-[9px] font-bold transition-all interactive-control focus:outline-none">Tonight</button>
                          <button onClick={() => applyPreset('tomorrow')} className="py-1 bg-zinc-900 border border-zinc-750 hover:bg-zinc-800 hover:border-zinc-550 hover:text-white rounded-md text-[9px] font-bold transition-all interactive-control focus:outline-none">Tmrw</button>
                          <button onClick={() => applyPreset('next-monday')} className="py-1 bg-zinc-900 border border-zinc-750 hover:bg-zinc-800 hover:border-zinc-550 hover:text-white rounded-md text-[9px] font-bold transition-all interactive-control focus:outline-none">Next Mon</button>
                        </div>
                      </div>

                      <div>
                        <span className="text-zinc-300 font-bold text-[8.5px] uppercase tracking-wider block mb-1">Time</span>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min="1"
                            max="12"
                            value={selectedHour}
                            onKeyDown={handleHourKeyDown}
                            onChange={(e) => setSelectedHour(String(Math.max(1, Math.min(12, parseInt(e.target.value, 10) || 12))).padStart(2, '0'))}
                            className="w-11 h-8 text-center bg-zinc-900 border border-zinc-750 focus:border-zinc-450 focus:bg-zinc-850 hover:border-zinc-600 text-white rounded-lg p-1 outline-none font-mono text-xs font-bold interactive-control transition-all"
                          />
                          <span className="text-zinc-300 font-bold text-xs">:</span>
                          <input
                            type="number"
                            min="0"
                            max="59"
                            value={selectedMinute}
                            onKeyDown={handleMinuteKeyDown}
                            onChange={(e) => setSelectedMinute(String(Math.max(0, Math.min(59, parseInt(e.target.value, 10) || 0))).padStart(2, '0'))}
                            className="w-11 h-8 text-center bg-zinc-900 border border-zinc-750 focus:border-zinc-450 focus:bg-zinc-850 hover:border-zinc-600 text-white rounded-lg p-1 outline-none font-mono text-xs font-bold interactive-control transition-all"
                          />
                          <button
                            onClick={() => setSelectedAmPm(prev => prev === 'AM' ? 'PM' : 'AM')}
                            className="h-8 px-2.5 bg-zinc-900 border border-zinc-750 hover:border-zinc-500 text-zinc-200 hover:text-white rounded-lg text-[9px] font-bold transition-all shrink-0 interactive-control focus:outline-none"
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
                    className="flex-1 border border-zinc-700 hover:border-zinc-550 hover:text-white text-zinc-300 rounded-lg py-2 font-bold text-[9px] uppercase tracking-widest transition-colors interactive-control focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 focus:outline-none"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveForm}
                    className="flex-1 bg-white hover:bg-zinc-100 active:scale-[0.98] text-zinc-950 rounded-lg py-2 font-bold text-[9px] uppercase tracking-widest transition-all interactive-control focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 focus:outline-none"
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
