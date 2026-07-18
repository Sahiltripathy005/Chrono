import React from 'react';
import type { AppSettings } from '../types';

interface SettingsPanelProps {
  isActive: boolean;
  settings: AppSettings;
  handleToggleSeconds: () => void;
  handleToggleAlwaysOnTop: () => void;
  handleToggleStartup: () => void;
  handleDisableStartupNextBoot: () => void;
  handleToggleSound: () => void;
  handleSetSelectionMode: (mode: 'automatic' | 'manual') => void;
  handleOpacityChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  changePanel: (panel: 'timer' | 'settings' | 'manager' | 'add' | 'edit') => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  isActive,
  settings,
  handleToggleSeconds,
  handleToggleAlwaysOnTop,
  handleToggleStartup,
  handleDisableStartupNextBoot,
  handleToggleSound,
  handleSetSelectionMode,
  handleOpacityChange,
  changePanel,
}) => {
  return (
    <div className={`panel-transition absolute inset-0 bg-zinc-950/90 backdrop-blur-md flex flex-col p-6 z-10 text-xs ${
      isActive ? 'panel-visible' : 'panel-hidden'
    }`}>
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
              className={`relative w-9 h-5 rounded-full p-0.5 transition-all focus-visible:ring-2 focus-visible:ring-zinc-450 focus:outline-none interactive-control ${settings.show_seconds ? 'bg-white' : 'bg-zinc-800 hover:bg-zinc-700 border border-zinc-700'}`}
            >
              <span className="absolute -inset-3 cursor-pointer" />
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
              className={`relative w-9 h-5 rounded-full p-0.5 transition-all focus-visible:ring-2 focus-visible:ring-zinc-450 focus:outline-none interactive-control ${settings.always_on_top ? 'bg-white' : 'bg-zinc-800 hover:bg-zinc-700 border border-zinc-700'}`}
            >
              <span className="absolute -inset-3 cursor-pointer" />
              <div className={`w-4 h-4 rounded-full transition-transform ${settings.always_on_top ? 'translate-x-4 bg-zinc-950' : 'translate-x-0 bg-zinc-200'}`} />
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-zinc-100 font-bold">Launch with Windows</span>
                <span className="text-[10px] text-zinc-400 font-medium">Auto-start Chrono on boot</span>
              </div>
              <button
                onClick={handleToggleStartup}
                className={`relative w-9 h-5 rounded-full p-0.5 transition-all focus-visible:ring-2 focus-visible:ring-zinc-450 focus:outline-none interactive-control ${settings.launch_at_startup ? 'bg-white' : 'bg-zinc-800 hover:bg-zinc-700 border border-zinc-700'}`}
              >
                <span className="absolute -inset-3 cursor-pointer" />
                <div className={`w-4 h-4 rounded-full transition-transform ${settings.launch_at_startup ? 'translate-x-4 bg-zinc-950' : 'translate-x-0 bg-zinc-200'}`} />
              </button>
            </div>
            {settings.launch_at_startup && (
              <button
                onClick={handleDisableStartupNextBoot}
                disabled={settings.skip_next_startup}
                className={`w-full py-2 rounded-lg border transition-all duration-200 text-[9.5px] font-extrabold tracking-wider uppercase interactive-control focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-450 ${
                  settings.skip_next_startup
                    ? 'bg-emerald-950/20 text-emerald-400/80 border-emerald-900/40 cursor-default'
                    : 'bg-zinc-900/50 text-zinc-300 hover:text-white border-zinc-800/80 hover:bg-zinc-900 active:scale-[0.98]'
                }`}
              >
                {settings.skip_next_startup ? 'Auto Start Skipped for Next Boot' : 'Disable Auto Start for Next Boot'}
              </button>
            )}
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
              className={`relative w-9 h-5 rounded-full p-0.5 transition-all focus-visible:ring-2 focus-visible:ring-zinc-450 focus:outline-none interactive-control ${settings.notification_sound ? 'bg-white' : 'bg-zinc-800 hover:bg-zinc-700 border border-zinc-700'}`}
            >
              <span className="absolute -inset-3 cursor-pointer" />
              <div className={`w-4 h-4 rounded-full transition-transform ${settings.notification_sound ? 'translate-x-4 bg-zinc-950' : 'translate-x-0 bg-zinc-200'}`} />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-zinc-100 font-bold">Timer Selection</span>
              <span className="text-[10px] text-zinc-400 font-medium">Automatic next due vs Manual selection</span>
            </div>
            <div className="flex bg-zinc-900 border border-zinc-850 rounded-lg p-0.5 shrink-0">
              <button
                onClick={() => handleSetSelectionMode('automatic')}
                className={`relative px-3 py-1.5 rounded-md text-[8.5px] font-extrabold tracking-wider transition-all interactive-control focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-450 ${settings.overlay_timer_selection === 'automatic' ? 'bg-white text-zinc-950 shadow' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                <span className="absolute -inset-1 cursor-pointer" />
                AUTO
              </button>
              <button
                onClick={() => handleSetSelectionMode('manual')}
                className={`relative px-3 py-1.5 rounded-md text-[8.5px] font-extrabold tracking-wider transition-all interactive-control focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-450 ${settings.overlay_timer_selection === 'manual' ? 'bg-white text-zinc-950 shadow' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                <span className="absolute -inset-1 cursor-pointer" />
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
                className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-white interactive-control focus-visible:ring-2 focus-visible:ring-white"
              />
              <span className="text-zinc-100 font-mono text-[10px] font-bold min-w-[28px] text-right">{Math.round(settings.opacity * 100)}%</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-center mt-6 pt-3 border-t border-zinc-800/80">
        <button 
          onClick={() => changePanel('timer')}
          className="px-8 py-2.5 bg-white text-zinc-950 hover:bg-zinc-100 active:scale-[0.98] transition-all font-bold text-xs rounded-lg shadow uppercase tracking-wider interactive-control focus-visible:ring-2 focus-visible:ring-white focus:outline-none"
        >
          Done
        </button>
      </div>
    </div>
  );
};
