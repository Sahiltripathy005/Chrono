export interface TimerModel {
  id: string;
  label: string;
  type: 'countdown' | 'deadline';
  duration_secs: number; // for countdown
  deadline_timestamp: number; // for deadline (epoch ms)
  is_completed: boolean;
  is_cancelled: boolean;
  alarm_enabled: boolean;
  is_running: boolean;
  pinned?: boolean;
  completion_timestamp?: number;
}

export interface Workspace {
  id: string;
  name: string;
  timers: TimerModel[];
  active_timer_id: string;
}

export interface AppSettings {
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
  workspaces: Workspace[];
  active_workspace_id: string;
  skip_next_startup: boolean;
}
