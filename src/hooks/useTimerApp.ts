import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { TimerModel, Workspace, AppSettings } from '../types';
import { formatTime } from '../utils';

export function useTimerApp() {
  // Main settings state synced from Rust
  const [settings, _rawSetSettings] = useState<AppSettings>({
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
    workspaces: [
      {
        id: 'default_workspace',
        name: '🎮 Personal',
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
        active_timer_id: 'default',
      }
    ],
    active_workspace_id: 'default_workspace',
    skip_next_startup: false,
  });

  // State wrapper enforcing business rule invariants (Self-Healing)
  const setSettings = (val: AppSettings | ((prev: AppSettings) => AppSettings)) => {
    _rawSetSettings(prev => {
      const next = typeof val === 'function' ? val(prev) : val;
      const now = Date.now();

      const selfHealTimer = (t: TimerModel): TimerModel => {
        if (t.type === 'deadline' && t.is_completed && t.deadline_timestamp > now) {
          return { ...t, is_completed: false, is_running: true };
        }
        return t;
      };

      const healedTimers = (next.timers || []).map(selfHealTimer);

      let workspaces = next.workspaces || [];
      if (workspaces.length > 0) {
        workspaces = workspaces.map(w => {
          const wsTimers = w.id === next.active_workspace_id ? healedTimers : w.timers || [];
          const healedWsTimers = wsTimers.map(selfHealTimer);
          return {
            ...w,
            timers: healedWsTimers,
            active_timer_id: w.id === next.active_workspace_id ? next.active_timer_id : w.active_timer_id
          };
        });
      }

      return {
        ...next,
        timers: healedTimers,
        workspaces
      };
    });
  };

  // State variables
  const [isCustomizeMode, setIsCustomizeMode] = useState(false);
  const [badgeText, setBadgeText] = useState<string | null>(null);
  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [currentPanel, setCurrentPanel] = useState<'timer' | 'settings' | 'manager' | 'add' | 'edit'>('timer');
  const [editingTimerId, setEditingTimerId] = useState<string | null>(null);
  const [selectedCompletedIds, setSelectedCompletedIds] = useState<string[]>([]);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [tickTime, setTickTime] = useState(Date.now());
  const [isDocked, setIsDocked] = useState(false);

  // Form State
  const [formType, setFormType] = useState<'countdown' | 'deadline'>('countdown');
  const [formLabel, setFormLabel] = useState('');
  const [formHours, setFormHours] = useState(0);
  const [formMinutes, setFormMinutes] = useState(5);
  const [formSeconds, setFormSeconds] = useState(0);
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedHour, setSelectedHour] = useState('12');
  const [selectedMinute, setSelectedMinute] = useState('00');
  const [selectedAmPm, setSelectedAmPm] = useState<'AM' | 'PM'>('PM');
  const [formAlarmEnabled, setFormAlarmEnabled] = useState(true);
  const [selectedManagerTimerId, setSelectedManagerTimerId] = useState<string | null>(null);

  // Sync state size on window resize and font loaded events
  useEffect(() => {
    const handleResize = () => {
      requestAnimationFrame(() => {
        setWindowSize({ width: window.innerWidth, height: window.innerHeight });
      });
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    if (document.fonts) {
      document.fonts.ready.then(handleResize);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Refs for tracking background logic
  const countdownRemainingRef = useRef<Record<string, number>>({});
  const expiredTimersRef = useRef<Record<string, boolean>>({});
  const dragStartRef = useRef<{ x: number, y: number } | null>(null);
  const badgeTimeoutRef = useRef<number | null>(null);

  // Show badge for 2 seconds
  const triggerBadge = (text: string) => {
    if (badgeTimeoutRef.current) clearTimeout(badgeTimeoutRef.current);
    setBadgeText(text);
    badgeTimeoutRef.current = window.setTimeout(() => {
      setBadgeText(null);
    }, 2000);
  };

  const handleSwitchWorkspace = (workspaceId: string) => {
    const targetWs = settings.workspaces.find(w => w.id === workspaceId);
    if (!targetWs) return;

    // Reset countdown remaining refs for all timers in the new workspace
    targetWs.timers.forEach(t => {
      if (t.type === 'countdown') {
        countdownRemainingRef.current[t.id] = t.duration_secs;
      }
    });

    setSettings(prev => {
      const updated = {
        ...prev,
        active_workspace_id: workspaceId,
        timers: targetWs.timers,
        active_timer_id: targetWs.active_timer_id
      };
      invoke('save_settings_data', { settings: updated }).catch(console.error);
      return updated;
    });
  };

  const handleCreateWorkspace = (name: string) => {
    if (!name.trim()) return;
    const newId = 'workspace_' + Date.now();
    const defaultTimerId = 'default_' + Date.now();
    const newWs: Workspace = {
      id: newId,
      name: name.trim(),
      timers: [
        {
          id: defaultTimerId,
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
      active_timer_id: defaultTimerId,
    };

    setSettings(prev => {
      const updatedWorkspaces = [...prev.workspaces, newWs];
      const updated = {
        ...prev,
        workspaces: updatedWorkspaces,
        active_workspace_id: newId,
        timers: newWs.timers,
        active_timer_id: defaultTimerId
      };
      invoke('save_settings_data', { settings: updated }).catch(console.error);
      return updated;
    });
  };

  const handleRenameWorkspace = (workspaceId: string, name: string) => {
    if (!name.trim()) return;
    setSettings(prev => {
      const updatedWorkspaces = prev.workspaces.map(w => 
        w.id === workspaceId ? { ...w, name: name.trim() } : w
      );
      const updated = {
        ...prev,
        workspaces: updatedWorkspaces
      };
      invoke('save_settings_data', { settings: updated }).catch(console.error);
      return updated;
    });
  };

  const handleDeleteWorkspace = (workspaceId: string) => {
    if (settings.workspaces.length <= 1) return;

    setSettings(prev => {
      const updatedWorkspaces = prev.workspaces.filter(w => w.id !== workspaceId);
      
      let nextActiveId = prev.active_workspace_id;
      let nextTimers = prev.timers;
      let nextActiveTimerId = prev.active_timer_id;

      if (prev.active_workspace_id === workspaceId) {
        const fallbackWs = updatedWorkspaces[0];
        nextActiveId = fallbackWs.id;
        nextTimers = fallbackWs.timers;
        nextActiveTimerId = fallbackWs.active_timer_id;

        fallbackWs.timers.forEach(t => {
          if (t.type === 'countdown') {
            countdownRemainingRef.current[t.id] = t.duration_secs;
          }
        });
      }

      const updated = {
        ...prev,
        workspaces: updatedWorkspaces,
        active_workspace_id: nextActiveId,
        timers: nextTimers,
        active_timer_id: nextActiveTimerId
      };
      invoke('save_settings_data', { settings: updated }).catch(console.error);
      return updated;
    });
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

  // Keep selectedManagerTimerId synced with active overlay timer
  useEffect(() => {
    if (currentPanel === 'manager') {
      setSelectedManagerTimerId(settings.active_timer_id);
    }
  }, [currentPanel, settings.active_timer_id]);

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
          return { ...t, is_completed: true, is_running: false, completion_timestamp: Date.now() };
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

  const snoozeTimer = (id: string, seconds: number) => {
    expiredTimersRef.current[id] = false;
    setSettings(prev => {
      const updated = prev.timers.map(t => {
        if (t.id === id) {
          if (t.type === 'countdown') {
            countdownRemainingRef.current[id] = seconds;
            return {
              ...t,
              duration_secs: seconds,
              is_completed: false,
              is_cancelled: false,
              is_running: true,
            };
          } else {
            return {
              ...t,
              deadline_timestamp: Date.now() + seconds * 1000,
              is_completed: false,
              is_cancelled: false,
              is_running: true,
            };
          }
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
  const changePanel = (panel: 'timer' | 'settings' | 'manager' | 'add' | 'edit') => {
    setCurrentPanel(panel);
  };

  // Unified native window size manager for panel transitions
  // Ensures React finishes rendering and layout settles before the native Tauri window is updated.
  useEffect(() => {
    let active = true;

    const syncNativeWindow = async () => {
      // Defer execution using requestAnimationFrame to let layout stabilize completely
      await new Promise(resolve => requestAnimationFrame(resolve));
      if (!active) return;

      try {
        if (currentPanel === 'timer') {
          await invoke('exit_config_mode');
        } else if (currentPanel === 'add' || currentPanel === 'edit') {
          await invoke('enter_config_mode', { width: 700, height: 420 });
        } else {
          // manager or settings: increased default height by 90px (from 400px to 490px)
          await invoke('enter_config_mode', { width: 560, height: 490 });
        }
      } catch (err) {
        console.error("Native window synchronization failed:", err);
      }
    };

    syncNativeWindow();

    return () => {
      active = false;
    };
  }, [currentPanel]);

  // unified ticking loop for all countdowns and deadline timers
  useEffect(() => {
    const interval = setInterval(() => {
      setTickTime(Date.now());
      let settingsChanged = false;
      let nextTimers = settings.timers.map(t => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.timers, settings.active_timer_id, settings.overlay_timer_selection, activeTimer]);

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

  const handleHide = async () => {
    await invoke('hide_window');
  };

  const handleResetSize = async () => {
    if (currentPanel === 'timer' && isCustomizeMode) {
      await invoke('reset_window_size');
    }
  };

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

  // Keyboard shortcut listener
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPanel, isRunning, settings.active_timer_id]);

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
        is_running: true,
        pinned: false,
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
        is_running: true,
        pinned: false,
      };
      expiredTimersRef.current[id] = false;
    }

    setSettings(prev => {
      let updatedTimers = [...prev.timers];
      if (editingTimerId) {
        const existing = prev.timers.find(t => t.id === editingTimerId);
        const wasInactive = existing ? (existing.is_completed || existing.is_cancelled) : false;
        newTimer.is_running = existing ? (wasInactive ? true : existing.is_running) : true;
        newTimer.is_completed = false;
        newTimer.is_cancelled = false;
        newTimer.pinned = existing ? existing.pinned : false;
        updatedTimers = updatedTimers.map(t => t.id === editingTimerId ? newTimer : t);
      } else {
        newTimer.is_running = true;
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

  const handleTogglePinTimer = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSettings(prev => {
      const updated = prev.timers.map(t => {
        if (t.id === id) {
          return { ...t, pinned: !t.pinned };
        }
        return t;
      });
      const newSettings = { ...prev, timers: updated };
      invoke('save_settings_data', { settings: newSettings }).catch(console.error);
      return newSettings;
    });
  };

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

  const handleClearCompleted = () => {
    setSettings(prev => {
      const completed = prev.timers.filter(t => t.is_completed);
      if (completed.length === 0) return prev;
      
      let updated = prev.timers.filter(t => !t.is_completed);
      if (updated.length === 0) {
        updated = [{
          id: "default",
          label: "Countdown",
          type: "countdown",
          duration_secs: 300,
          deadline_timestamp: 0,
          is_completed: false,
          is_cancelled: false,
          alarm_enabled: true,
          is_running: false,
          pinned: false,
        }];
      }
      
      let activeId = prev.active_timer_id;
      if (!updated.some(t => t.id === activeId)) {
        if (prev.overlay_timer_selection === 'automatic') {
          activeId = determineAutomaticActiveId(updated, activeId);
        } else {
          activeId = updated[0].id;
        }
      }
      
      const newSettings = { ...prev, timers: updated, active_timer_id: activeId };
      invoke('save_settings_data', { settings: newSettings }).catch(console.error);
      return newSettings;
    });
    setSelectedCompletedIds([]);
  };

  const handleDeleteSelectedCompleted = () => {
    if (selectedCompletedIds.length === 0) return;
    setSettings(prev => {
      let updated = prev.timers.filter(t => !selectedCompletedIds.includes(t.id));
      if (updated.length === 0) {
        updated = [{
          id: "default",
          label: "Countdown",
          type: "countdown",
          duration_secs: 300,
          deadline_timestamp: 0,
          is_completed: false,
          is_cancelled: false,
          alarm_enabled: true,
          is_running: false,
          pinned: false,
        }];
      }
      
      let activeId = prev.active_timer_id;
      if (!updated.some(t => t.id === activeId)) {
        if (prev.overlay_timer_selection === 'automatic') {
          activeId = determineAutomaticActiveId(updated, activeId);
        } else {
          activeId = updated[0].id;
        }
      }
      
      const newSettings = { ...prev, timers: updated, active_timer_id: activeId };
      invoke('save_settings_data', { settings: newSettings }).catch(console.error);
      return newSettings;
    });
    setSelectedCompletedIds([]);
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

  const handleToggleStartup = () => {
    setSettings(prev => {
      const nextLaunchVal = !prev.launch_at_startup;
      const updated = { 
        ...prev, 
        launch_at_startup: nextLaunchVal,
        skip_next_startup: nextLaunchVal ? prev.skip_next_startup : false
      };
      invoke('save_settings_data', { settings: updated }).catch(console.error);
      return updated;
    });
  };

  const handleDisableStartupNextBoot = () => {
    invoke<AppSettings>('disable_startup_next_boot')
      .then(updatedSettings => {
        setSettings(updatedSettings);
      })
      .catch(console.error);
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

  // Sync Focus Mode docked states
  useEffect(() => {
    const win = getCurrentWindow();
    const checkDockState = async () => {
      const size = await win.innerSize();
      // Focus mode is characterized by height <= 58px
      setIsDocked(size.height <= 58);
    };
    checkDockState();

    const unlistenResize = win.onResized(() => {
      checkDockState();
    });

    return () => {
      unlistenResize.then(fn => fn());
    };
  }, []);

  // Sync alarm mode window dimensions
  const isOverdue = !!(activeTimer && activeTimer.type === 'deadline' && remainingSeconds < 0);
  const isActiveTimerExpired = !!(
    activeTimer &&
    !activeTimer.is_completed &&
    !activeTimer.is_cancelled &&
    remainingSeconds <= 0
  );

  useEffect(() => {
    if (isActiveTimerExpired) {
      invoke('enter_alarm_mode').catch(console.error);
    } else {
      invoke('exit_alarm_mode').catch(console.error);
    }
  }, [isActiveTimerExpired]);

  const displaySecs = activeTimer ? (isOverdue ? Math.abs(remainingSeconds) : Math.max(0, remainingSeconds)) : 0;
  const formatted = formatTime(displaySecs, settings.show_seconds);
  const formattedText = isOverdue ? `+${formatted}` : formatted;
  const placeholderDigits = formattedText.replace(/\d/g, '8');

  const isDialogOpen = currentPanel !== 'timer';
  const renderedOpacity = isDialogOpen
    ? Math.max(0.9, settings.opacity)
    : settings.opacity;

  // Hero Clock Sizing Logic
  const getTimerFontSize = () => {
    const usableWidth = windowSize.width - 32;
    const usableHeight = windowSize.height - 48;
    
    const charCount = formattedText.length;
    const charWidthRatio = 0.61; 
    const estimatedWidth = charCount * charWidthRatio;
    
    const widthLimit = usableWidth / estimatedWidth;
    const heightLimit = usableHeight * 0.70; 
    
    const calculated = Math.min(widthLimit, heightLimit);
    return Math.max(20, Math.min(84, calculated));
  };

  const timerFontSize = getTimerFontSize();

  return {
    settings,
    setSettings,
    isCustomizeMode,
    setIsCustomizeMode,
    badgeText,
    windowSize,
    currentPanel,
    setCurrentPanel,
    editingTimerId,
    setEditingTimerId,
    selectedCompletedIds,
    setSelectedCompletedIds,
    remainingSeconds,
    tickTime,
    isDocked,
    formType,
    setFormType,
    formLabel,
    setFormLabel,
    formHours,
    setFormHours,
    formMinutes,
    setFormMinutes,
    formSeconds,
    setFormSeconds,
    currentYear,
    setCurrentYear,
    currentMonth,
    setCurrentMonth,
    selectedDate,
    setSelectedDate,
    selectedHour,
    setSelectedHour,
    selectedMinute,
    setSelectedMinute,
    selectedAmPm,
    setSelectedAmPm,
    formAlarmEnabled,
    setFormAlarmEnabled,
    selectedManagerTimerId,
    setSelectedManagerTimerId,
    countdownRemainingRef,
    expiredTimersRef,
    dragStartRef,
    badgeTimeoutRef,
    triggerBadge,
    handleSwitchWorkspace,
    handleCreateWorkspace,
    handleRenameWorkspace,
    handleDeleteWorkspace,
    handleMouseEnter,
    handleMouseLeave,
    getRemainingSecondsForTimer,
    determineAutomaticActiveId,
    activeTimer,
    isRunning,
    flashOverlayOpacity,
    triggerFlashAnimation,
    acknowledgeTimer,
    snoozeTimer,
    triggerExpirationNotification,
    changePanel,
    toggleTimer,
    resetTimer,
    handleHide,
    handleResetSize,
    handleMouseDown,
    handleMouseUp,
    handleOpenEditPanel,
    handleOpenAddPanel,
    handleSaveForm,
    applyPreset,
    handleTogglePinTimer,
    handleDeleteTimer,
    handleClearCompleted,
    handleDeleteSelectedCompleted,
    handleToggleTimerInList,
    handleToggleStartup,
    handleDisableStartupNextBoot,
    handleToggleSound,
    handleOpacityChange,
    handleToggleSeconds,
    handleToggleAlwaysOnTop,
    handleSetSelectionMode,
    isOverdue,
    isActiveTimerExpired,
    displaySecs,
    formatted,
    formattedText,
    placeholderDigits,
    isDialogOpen,
    renderedOpacity,
    timerFontSize,
  };
}
