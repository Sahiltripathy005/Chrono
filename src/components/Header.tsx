import React from 'react';
import { GripHorizontal, List, Settings, ChevronLeft, X } from 'lucide-react';

interface HeaderProps {
  isCustomizeMode: boolean;
  currentPanel: 'timer' | 'settings' | 'manager' | 'add' | 'edit';
  changePanel: (panel: 'timer' | 'settings' | 'manager' | 'add' | 'edit') => void;
  handleMouseDown: (e: React.MouseEvent) => void;
  handleMouseUp: (e: React.MouseEvent) => void;
  handleHide: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  isCustomizeMode,
  currentPanel,
  changePanel,
  handleMouseDown,
  handleMouseUp,
  handleHide,
}) => {
  return (
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
  );
};
