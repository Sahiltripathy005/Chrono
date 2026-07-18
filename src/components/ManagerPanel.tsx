import React from 'react';
import { Plus, Trash2, Edit2, Play, Pause, Check, Pin } from 'lucide-react';
import type { TimerModel, AppSettings } from '../types';
import { invoke } from '@tauri-apps/api/core';

interface ManagerPanelProps {
  isActive: boolean;
  settings: AppSettings;
  activeTimer: TimerModel | null;
  selectedManagerTimerId: string | null;
  setSelectedManagerTimerId: (id: string | null) => void;
  selectedCompletedIds: string[];
  setSelectedCompletedIds: React.Dispatch<React.SetStateAction<string[]>>;
  getRemainingSecondsForTimer: (t: TimerModel) => number;
  formatListTime: (secs: number) => string;
  changePanel: (panel: 'timer' | 'settings' | 'manager' | 'add' | 'edit') => void;
  handleOpenAddPanel: () => void;
  handleOpenEditPanel: (id?: string) => void;
  handleSwitchWorkspace: (id: string) => void;
  handleRenameWorkspace: (id: string, name: string) => void;
  handleDeleteWorkspace: (id: string) => void;
  handleCreateWorkspace: (name: string) => void;
  handleToggleTimerInList: (id: string) => void;
  handleTogglePinTimer: (id: string, e: React.MouseEvent) => void;
  handleDeleteTimer: (id: string, e: React.MouseEvent) => void;
  handleDeleteSelectedCompleted: () => void;
  handleClearCompleted: () => void;
  setSettings: (updater: AppSettings | ((prev: AppSettings) => AppSettings)) => void;
  acknowledgeTimer: (id: string) => void;
}

export const ManagerPanel: React.FC<ManagerPanelProps> = ({
  isActive,
  settings,
  activeTimer,
  selectedManagerTimerId,
  setSelectedManagerTimerId,
  selectedCompletedIds,
  setSelectedCompletedIds,
  getRemainingSecondsForTimer,
  formatListTime,
  changePanel,
  handleOpenAddPanel,
  handleOpenEditPanel,
  handleSwitchWorkspace,
  handleRenameWorkspace,
  handleDeleteWorkspace,
  handleCreateWorkspace,
  handleToggleTimerInList,
  handleTogglePinTimer,
  handleDeleteTimer,
  handleDeleteSelectedCompleted,
  handleClearCompleted,
  setSettings,
  acknowledgeTimer,
}) => {
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

  const renderTimerItem = (t: TimerModel) => {
    const isActive = t.id === settings.active_timer_id;
    const isSelected = settings.overlay_timer_selection === 'manual'
      ? t.id === settings.active_timer_id
      : t.id === (selectedManagerTimerId ?? settings.active_timer_id);
    let display = '';
    let isOverdueTimer = false;
    
    if (t.type === 'countdown') {
      const rem = getRemainingSecondsForTimer(t);
      display = formatListTime(rem);
      isOverdueTimer = rem <= 0 && !t.is_completed && !t.is_cancelled;
    } else {
      const diff = t.deadline_timestamp - Date.now();
      isOverdueTimer = diff < 0 && !t.is_completed && !t.is_cancelled;
      display = (diff < 0 ? '+' : '') + formatListTime(Math.floor(Math.abs(diff) / 1000));
    }

    const statusInfo = getTimerStatusText(t);

    return (
      <div
        key={t.id}
        onClick={() => {
          setSelectedManagerTimerId(t.id);
          if (settings.overlay_timer_selection === 'manual') {
            setSettings(prev => {
              const updated = { ...prev, active_timer_id: t.id };
              invoke('save_settings_data', { settings: updated }).catch(console.error);
              return updated;
            });
          }
        }}
        className={`relative flex flex-col gap-0.5 py-1.5 pl-3.5 pr-2.5 rounded-lg border transition-all focus-visible:ring-2 focus-visible:ring-zinc-450 focus:outline-none cursor-pointer ${
          isSelected 
            ? 'bg-white/10 border-zinc-400' 
            : 'bg-zinc-900/40 border-zinc-800 hover:bg-zinc-900/60 hover:border-zinc-700'
        }`}
      >
        {/* Subtle left accent strip for selected timer */}
        {isSelected && (
          <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-zinc-300 rounded-l" />
        )}

        {/* Row 1: Remaining Time on Left; Actions on Right */}
        <div className="flex items-center justify-between min-w-0">
          <span className={`font-mono text-[13px] font-bold ${isOverdueTimer ? 'text-rose-455' : (isActive ? 'text-white' : 'text-zinc-300')}`}>
            {display}
          </span>

          {/* Grouped actions, equally spaced (gap-2) and right-aligned */}
          <div className="flex items-center gap-2 shrink-0 ml-1.5">
            {t.type === 'countdown' && !t.is_completed && !t.is_cancelled && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleTimerInList(t.id);
                }}
                className="w-6 h-6 flex items-center justify-center text-zinc-400 hover:text-white rounded hover:bg-zinc-800 transition-all interactive-control focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-450 relative animate-none"
                title={t.is_running ? "Pause" : "Start"}
              >
                <span className="absolute -inset-2 cursor-pointer" />
                {t.is_running ? <Pause className="w-2.5 h-2.5" /> : <Play className="w-2.5 h-2.5" />}
              </button>
            )}
            
            {getRemainingSecondsForTimer(t) <= 0 && !t.is_completed && !t.is_cancelled && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  acknowledgeTimer(t.id);
                }}
                className="w-6 h-6 flex items-center justify-center text-rose-455 hover:text-emerald-450 rounded hover:bg-zinc-800 transition-all interactive-control focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-455 relative animate-none"
                title="Acknowledge Timer"
              >
                <span className="absolute -inset-2 cursor-pointer" />
                <Check className="w-3 h-3" />
              </button>
            )}

            {!t.is_completed && (
              <button
                onClick={(e) => handleTogglePinTimer(t.id, e)}
                className={`w-6 h-6 flex items-center justify-center rounded hover:bg-zinc-800 transition-all interactive-control focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-450 relative ${t.pinned ? 'text-amber-505' : 'text-zinc-500 hover:text-zinc-300'}`}
                title={t.pinned ? "Unpin Timer" : "Pin Timer"}
              >
                <span className="absolute -inset-2 cursor-pointer" />
                <Pin className="w-2.5 h-2.5 fill-current opacity-80" style={{ transform: t.pinned ? 'none' : 'rotate(45deg)' }} />
              </button>
            )}

            <button
              onClick={(e) => { e.stopPropagation(); handleOpenEditPanel(t.id); }}
              className="w-6 h-6 flex items-center justify-center text-zinc-450 hover:text-white rounded hover:bg-zinc-800 transition-all interactive-control focus-visible:ring-1 focus-visible:ring-zinc-455 focus:outline-none relative"
              title="Edit"
            >
              <span className="absolute -inset-2 cursor-pointer" />
              <Edit2 className="w-2.5 h-2.5" />
            </button>
            {settings.timers.length > 1 && (
              <button
                onClick={(e) => handleDeleteTimer(t.id, e)}
                className="w-6 h-6 flex items-center justify-center text-zinc-450 hover:text-rose-400 rounded hover:bg-zinc-800 transition-all interactive-control focus-visible:ring-1 focus-visible:ring-rose-500 focus:outline-none relative"
                title="Delete"
              >
                <span className="absolute -inset-2 cursor-pointer" />
                <Trash2 className="w-2.5 h-2.5" />
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Checkbox & Name */}
        <div className="flex items-center gap-1.5 min-w-0 mt-0.5">
          {t.is_completed && (
            <input
              type="checkbox"
              checked={selectedCompletedIds.includes(t.id)}
              onChange={(e) => {
                e.stopPropagation();
                setSelectedCompletedIds(prev => 
                  prev.includes(t.id) 
                    ? prev.filter(id => id !== t.id) 
                    : [...prev, t.id]
                  );
                }}
              className="relative rounded border-zinc-805 bg-zinc-950 text-zinc-450 focus:ring-0 focus:ring-offset-0 focus:outline-none interactive-control cursor-pointer w-3 h-3 after:absolute after:-inset-3.5 after:content-[''] shrink-0"
            />
          )}
          <span 
            title={t.label} 
            className={`font-semibold truncate text-[11px] ${isActive ? 'text-white' : 'text-zinc-200'}`}
          >
            {t.label}
          </span>
        </div>

        {/* Row 3: Status & Metadata */}
        <div className="flex items-center gap-1 text-[8px] font-semibold uppercase tracking-wider text-zinc-400 mt-0.5">
          <span>{t.type}</span>
          <span className="text-zinc-705">•</span>
          <span className={statusInfo.color}>{statusInfo.text}</span>
          {isActive && (
            <>
              <span className="text-zinc-705">•</span>
              <span className="text-white bg-white/10 px-1 rounded-[2px] text-[6.5px] font-black tracking-widest">ACTIVE</span>
            </>
          )}
          {t.is_completed && (
            <>
              <span className="text-zinc-705">•</span>
              <span className="text-emerald-450 bg-emerald-500/10 px-1 rounded-[2px] text-[6.5px] font-black tracking-widest">DONE</span>
            </>
          )}
        </div>
      </div>
    );
  };




  const pinnedList = settings.timers.filter(t => t.pinned && !t.is_completed);
  const upcomingList = settings.timers.filter(t => !t.pinned && !t.is_completed);
  const completedList = settings.timers.filter(t => t.is_completed);

  pinnedList.sort((a, b) => getRemainingSecondsForTimer(a) - getRemainingSecondsForTimer(b));
  upcomingList.sort((a, b) => getRemainingSecondsForTimer(a) - getRemainingSecondsForTimer(b));
  completedList.sort((a, b) => (b.completion_timestamp || 0) - (a.completion_timestamp || 0));

  return (
    <div className={`panel-transition absolute inset-0 bg-zinc-950/90 backdrop-blur-md flex flex-col pt-2.5 pb-3 px-3 z-10 text-xs ${
      isActive ? 'panel-visible' : 'panel-hidden'
    }`}>
      <div className="flex items-center justify-between pb-1 border-b border-zinc-800/80 mb-1.5">
        <span className="text-[10px] font-bold text-zinc-300 tracking-widest uppercase">ALARM CENTER</span>
        <button 
          onClick={handleOpenAddPanel}
          className="h-8 text-zinc-200 hover:text-white flex items-center gap-1.5 text-[9.5px] font-extrabold px-3.5 rounded-lg border border-zinc-700 bg-zinc-900/60 hover:bg-zinc-800 hover:border-zinc-550 transition-colors interactive-control focus-visible:ring-2 focus-visible:ring-zinc-450 focus:outline-none"
        >
          <Plus className="w-3 h-3" /> ADD NEW
        </button>
      </div>

      {/* Workspace Selector & Management Bar */}
      <div className="flex items-center gap-2 bg-zinc-900/40 border border-zinc-800/85 rounded-lg p-1 mb-2 justify-between">
        <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden shrink-0">
          <span className="text-[9px] font-black text-zinc-400 tracking-wider uppercase whitespace-nowrap pl-2.5 pr-1">Profile:</span>
          <select
            value={settings.active_workspace_id}
            onChange={(e) => handleSwitchWorkspace(e.target.value)}
            className="h-7 w-[125px] bg-transparent text-zinc-200 text-xs font-bold px-1.5 focus:outline-none cursor-pointer hover:bg-zinc-900 border-none truncate"
          >
            {settings.workspaces?.map(w => (
              <option key={w.id} value={w.id} className="bg-zinc-950">
                {w.name}
              </option>
            ))}
          </select>
          <div className="w-[1px] h-3.5 bg-zinc-800 shrink-0" />
          <button
            onClick={() => {
              const currentWs = settings.workspaces.find(w => w.id === settings.active_workspace_id);
              if (!currentWs) return;
              const newName = prompt("Rename workspace:", currentWs.name);
              if (newName !== null && newName.trim()) {
                handleRenameWorkspace(currentWs.id, newName);
              }
            }}
            className="w-7 h-7 flex items-center justify-center text-zinc-455 hover:text-white hover:bg-zinc-900 transition-all focus:outline-none relative"
            title="Rename workspace"
          >
            <span className="absolute -inset-1 cursor-pointer" />
            <Edit2 className="w-3 h-3" />
          </button>
          {settings.workspaces?.length > 1 && (
            <>
              <div className="w-[1px] h-3.5 bg-zinc-800 shrink-0" />
              <button
                onClick={() => {
                  const currentWs = settings.workspaces.find(w => w.id === settings.active_workspace_id);
                  if (!currentWs) return;
                  if (confirm(`Are you sure you want to delete workspace "${currentWs.name}"?`)) {
                    handleDeleteWorkspace(currentWs.id);
                  }
                }}
                className="w-7 h-7 flex items-center justify-center text-zinc-455 hover:text-rose-455 hover:bg-zinc-900 transition-all focus:outline-none relative"
                title="Delete workspace"
              >
                <span className="absolute -inset-1 cursor-pointer" />
                <Trash2 className="w-3 h-3" />
              </button>
            </>
          )}
        </div>

        {/* Create new workspace button */}
        <button
          onClick={() => {
            const name = prompt("Enter name for new workspace:");
            if (name !== null && name.trim()) {
              handleCreateWorkspace(name);
            }
          }}
          className="h-7 text-zinc-200 hover:text-white flex items-center gap-1 text-[9px] font-extrabold tracking-wider uppercase px-2.5 rounded-lg border border-zinc-805 bg-zinc-950 hover:bg-zinc-900 hover:border-zinc-700 transition-all interactive-control focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-450"
        >
          <Plus className="w-2 h-2" /> NEW PROFILE
        </button>
      </div>

      <div className="grid grid-cols-[2.2fr_1fr] gap-4 flex-1 min-h-0">
        <div className="relative flex flex-col min-h-0 pr-2">
          <div className="overflow-y-auto flex flex-col gap-2 pr-2.5 scrollbar-thin relative flex-1">
          {settings.timers.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 border border-dashed border-zinc-800 rounded-lg my-2">
              <span className="text-[10px] font-black text-zinc-500 tracking-widest uppercase">No Timers Configured</span>
              <span className="text-[9px] text-zinc-600 mt-1 max-w-[180px]">Create your first countdown or deadline timer to get started.</span>
            </div>
          ) : (
            <>
              {/* Pinned Section */}
              {pinnedList.length > 0 && (
                <div className="flex flex-col gap-1">
                  <div className="sticky top-0 bg-zinc-950/95 backdrop-blur-sm z-10 py-1 flex items-center gap-1.5 text-[8.5px] font-black text-zinc-350 tracking-widest uppercase border-b border-zinc-900/60 mb-1 select-none">
                    <Pin className="w-2.5 h-2.5 fill-current text-amber-500/85" />
                    <span>Pinned</span>
                  </div>
                  {pinnedList.map(t => renderTimerItem(t))}
                </div>
              )}

              {/* Upcoming Section */}
              {upcomingList.length > 0 && (
                <div className="flex flex-col gap-1">
                  <div className="sticky top-0 bg-zinc-950/95 backdrop-blur-sm z-10 py-1 flex items-center gap-1.5 text-[8.5px] font-black text-zinc-355 tracking-widest uppercase border-b border-zinc-900/60 mb-1 select-none">
                    <span>Upcoming</span>
                  </div>
                  {upcomingList.map(t => renderTimerItem(t))}
                </div>
              )}

              {/* Completed Section */}
              {completedList.length > 0 && (
                <div className="flex flex-col gap-1">
                  <div className="sticky top-0 bg-zinc-950/95 backdrop-blur-sm z-10 py-1 flex items-center justify-between border-b border-zinc-900/60 mb-1 select-none">
                    <div className="flex items-center gap-1.5 text-[8.5px] font-black text-zinc-300 tracking-widest uppercase">
                      <span>Completed</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {selectedCompletedIds.length > 0 && (
                        <button
                          onClick={handleDeleteSelectedCompleted}
                          className="text-rose-455 hover:text-rose-350 font-extrabold text-[8px] uppercase tracking-wider transition-colors interactive-control"
                        >
                          Delete Selected ({selectedCompletedIds.length})
                        </button>
                      )}
                      <button
                        onClick={handleClearCompleted}
                        className="text-zinc-400 hover:text-zinc-200 font-bold text-[8.5px] uppercase tracking-wider transition-colors interactive-control hover:underline underline-offset-2"
                      >
                        Clear Completed
                      </button>
                    </div>
                  </div>
                  {completedList.map(t => renderTimerItem(t))}
                </div>
              )}
            </>
          )}
          </div>
        </div>

        <div className="flex flex-col justify-between border-l border-zinc-800/30 pl-4 text-zinc-300">
          <div className="flex flex-col">
            <span className="text-[10px] font-black text-zinc-355 tracking-widest uppercase mb-2">ACTIVE TIMER</span>
            
            {activeTimer ? (
              <div className="flex flex-col gap-2 mt-1">
                {/* 1. Large Countdown Immediately Below Title */}
                <div className="flex flex-col">
                  <span className={`font-mono text-[34px] font-black tracking-tight leading-none ${getRemainingSecondsForTimer(activeTimer) <= 0 ? 'text-rose-500' : 'text-emerald-400'}`}>
                    {activeTimer.type === 'countdown' 
                      ? formatListTime(getRemainingSecondsForTimer(activeTimer)) 
                      : (activeTimer.deadline_timestamp - Date.now() < 0 ? '+' : '') + formatListTime(Math.floor(Math.abs(activeTimer.deadline_timestamp - Date.now()) / 1000))}
                  </span>
                  <span className="text-[8px] font-bold text-zinc-500 uppercase tracking-wider mt-1 block">Remaining Time</span>
                </div>

                <div className="border-b border-zinc-800/50 my-1" />

                {/* 2. Timer Name & Status */}
                <div className="flex flex-col gap-0.5">
                  <span className="text-[8px] font-bold text-zinc-550 uppercase tracking-wider block">Timer Name</span>
                  <span className="text-white text-xs font-extrabold block truncate" title={activeTimer.label}>
                    {activeTimer.label || "Untitled Timer"}
                  </span>
                  <span className={`font-bold uppercase text-[9px] mt-0.5 ${getTimerStatusText(activeTimer).color.replace('font-bold', '')}`}>
                    {getTimerStatusText(activeTimer).text}
                  </span>
                </div>

                <div className="border-b border-zinc-800/50 my-1" />

                {/* 3. Scheduled Target (if deadline) */}
                {activeTimer.type === 'deadline' && (
                  <div className="flex flex-col gap-0.5 mb-1.5">
                    <span className="text-[8px] font-bold text-zinc-550 uppercase tracking-wider block">Scheduled Target</span>
                    <span className="text-zinc-300 font-semibold text-[9.5px]">
                      {new Date(activeTimer.deadline_timestamp).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                    </span>
                  </div>
                )}

                {/* 4. Metadata Stack (Profile & Priority & Type) */}
                <div className="grid grid-cols-2 gap-y-2 gap-x-3 text-[9px] font-semibold text-zinc-300">
                  <div>
                    <span className="text-[8px] font-bold text-zinc-500 uppercase tracking-wider block mb-0.5">Profile</span>
                    <span className="text-zinc-200 font-bold truncate block" title={settings.workspaces.find(w => w.id === settings.active_workspace_id)?.name}>
                      {settings.workspaces.find(w => w.id === settings.active_workspace_id)?.name || 'Default'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[8px] font-bold text-zinc-500 uppercase tracking-wider block mb-0.5">Priority</span>
                    <span className="text-zinc-200 font-bold">
                      {activeTimer.pinned ? "High Priority" : "Standard"}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-[8px] font-bold text-zinc-500 uppercase tracking-wider block mb-0.5">Timer Type</span>
                    <span className="text-zinc-200 font-bold capitalize">{activeTimer.type}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="border border-dashed border-zinc-800 rounded-lg p-6 flex flex-col items-center justify-center text-center text-zinc-500 my-2">
                <span className="text-[10px] font-bold uppercase tracking-wider">No Active Timer</span>
                <span className="text-[9px] mt-1 text-zinc-600">Select or create a timer to view details.</span>
              </div>
            )}
          </div>

          <button
            onClick={() => changePanel('timer')}
            className="w-full h-9 border border-zinc-700 hover:border-zinc-550 text-zinc-200 hover:text-white rounded-lg py-2.5 font-bold text-[9.5px] uppercase tracking-widest transition-colors interactive-control focus-visible:ring-2 focus-visible:ring-zinc-440 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 focus:outline-none"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

