import React from 'react';
import { Plus, Trash2, Edit2, Play, Pause, Check, Pin } from 'lucide-react';
import type { TimerModel, AppSettings } from '../types';
import { invoke } from '@tauri-apps/api/core';

interface ManagerPanelProps {
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
        className={`flex items-center justify-between p-2.5 rounded-lg border transition-all focus-visible:ring-2 focus-visible:ring-zinc-450 focus:outline-none cursor-pointer ${isSelected ? 'bg-white/10 border-zinc-300' : 'bg-zinc-900/40 border-zinc-800 hover:bg-zinc-900/60 hover:border-zinc-700'}`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1 pr-2">
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
              className="rounded border-zinc-800 bg-zinc-950 text-zinc-450 focus:ring-0 focus:ring-offset-0 focus:outline-none interactive-control cursor-pointer w-3.5 h-3.5"
            />
          )}
          <div className="flex flex-col min-w-0 flex-1">
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
        </div>
        
        <div className="flex items-center gap-2.5 shrink-0">
          <span className={`font-mono text-xs font-bold ${isOverdueTimer ? 'text-rose-450' : (isActive ? 'text-white' : 'text-zinc-300')}`}>
            {display}
          </span>
          
          <div className="flex items-center gap-1">
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
                className="text-rose-450 hover:text-emerald-450 p-1 rounded hover:bg-zinc-800 transition-all interactive-control focus:outline-none"
                title="Acknowledge Timer"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
            )}

            {!t.is_completed && (
              <button
                onClick={(e) => handleTogglePinTimer(t.id, e)}
                className={`p-1 rounded hover:bg-zinc-800 transition-all interactive-control focus:outline-none ${t.pinned ? 'text-amber-500' : 'text-zinc-500 hover:text-zinc-300'}`}
                title={t.pinned ? "Unpin Timer" : "Pin Timer"}
              >
                <Pin className="w-3 h-3 fill-current opacity-80" style={{ transform: t.pinned ? 'none' : 'rotate(45deg)' }} />
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
  };

  const pinnedList = settings.timers.filter(t => t.pinned && !t.is_completed);
  const upcomingList = settings.timers.filter(t => !t.pinned && !t.is_completed);
  const completedList = settings.timers.filter(t => t.is_completed);

  pinnedList.sort((a, b) => getRemainingSecondsForTimer(a) - getRemainingSecondsForTimer(b));
  upcomingList.sort((a, b) => getRemainingSecondsForTimer(a) - getRemainingSecondsForTimer(b));
  completedList.sort((a, b) => (b.completion_timestamp || 0) - (a.completion_timestamp || 0));

  return (
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

      {/* Workspace Selector & Management Bar */}
      <div className="flex items-center gap-2 bg-zinc-900/40 border border-zinc-800/85 rounded-lg p-2.5 mb-4 justify-between">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <span className="text-[9px] font-black text-zinc-500 tracking-wider uppercase whitespace-nowrap">Profile:</span>
          <select
            value={settings.active_workspace_id}
            onChange={(e) => handleSwitchWorkspace(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs font-bold rounded px-2.5 py-1 focus:outline-none cursor-pointer hover:border-zinc-700 max-w-[150px] truncate"
          >
            {settings.workspaces?.map(w => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>

          {/* Rename current workspace */}
          <button
            onClick={() => {
              const currentWs = settings.workspaces.find(w => w.id === settings.active_workspace_id);
              if (!currentWs) return;
              const newName = prompt("Rename workspace:", currentWs.name);
              if (newName !== null && newName.trim()) {
                handleRenameWorkspace(currentWs.id, newName);
              }
            }}
            className="p-1 text-zinc-450 hover:text-white rounded hover:bg-zinc-800/80 transition-all interactive-control focus:outline-none"
            title="Rename workspace"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>

          {/* Delete current workspace */}
          {settings.workspaces?.length > 1 && (
            <button
              onClick={() => {
                const currentWs = settings.workspaces.find(w => w.id === settings.active_workspace_id);
                if (!currentWs) return;
                if (confirm(`Are you sure you want to delete workspace "${currentWs.name}"?`)) {
                  handleDeleteWorkspace(currentWs.id);
                }
              }}
              className="p-1 text-zinc-450 hover:text-rose-450 rounded hover:bg-zinc-800/80 transition-all interactive-control focus:outline-none"
              title="Delete workspace"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
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
          className="text-zinc-300 hover:text-white flex items-center gap-1 text-[9px] font-extrabold tracking-wider uppercase px-2.5 py-1 rounded border border-zinc-800 bg-zinc-950 hover:bg-zinc-900 hover:border-zinc-700 transition-all interactive-control focus:outline-none"
        >
          <Plus className="w-2.5 h-2.5" /> NEW PROFILE
        </button>
      </div>

      <div className="grid grid-cols-[1.3fr_1fr] gap-6 flex-1 min-h-0">
        <div className="overflow-y-auto flex flex-col gap-4 pr-1 scrollbar-thin">
          {/* Pinned Section */}
          {pinnedList.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-1.5 text-[8.5px] font-black text-zinc-500 tracking-widest uppercase pb-1 border-b border-zinc-900/60">
                <Pin className="w-2.5 h-2.5 fill-current text-amber-500/85" />
                <span>Pinned</span>
              </div>
              {pinnedList.map(t => renderTimerItem(t))}
            </div>
          )}

          {/* Upcoming Section */}
          {upcomingList.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-1.5 text-[8.5px] font-black text-zinc-500 tracking-widest uppercase pb-1 border-b border-zinc-900/60">
                <span>Upcoming</span>
              </div>
              {upcomingList.map(t => renderTimerItem(t))}
            </div>
          )}

          {/* Completed Section */}
          {completedList.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between pb-1 border-b border-zinc-900/60">
                <div className="flex items-center gap-1.5 text-[8.5px] font-black text-zinc-500 tracking-widest uppercase">
                  <span>Completed</span>
                </div>
                <div className="flex items-center gap-2">
                  {selectedCompletedIds.length > 0 && (
                    <button
                      onClick={handleDeleteSelectedCompleted}
                      className="text-rose-450 hover:text-rose-300 font-extrabold text-[8px] uppercase tracking-wider transition-colors interactive-control"
                    >
                      Delete Selected ({selectedCompletedIds.length})
                    </button>
                  )}
                  <button
                    onClick={handleClearCompleted}
                    className="text-zinc-500 hover:text-zinc-300 font-extrabold text-[8px] uppercase tracking-wider transition-colors interactive-control"
                  >
                    Clear Completed
                  </button>
                </div>
              </div>
              {completedList.map(t => renderTimerItem(t))}
            </div>
          )}
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
            className="w-full border border-zinc-700 hover:border-zinc-500 text-zinc-200 hover:text-white rounded py-2 font-bold text-xs uppercase tracking-wider transition-colors interactive-control focus-visible:ring-2 focus-visible:ring-zinc-440 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 focus:outline-none"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
