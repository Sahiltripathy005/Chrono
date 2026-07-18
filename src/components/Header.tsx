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
      className={`h-[30px] w-full flex items-center justify-between px-3 border-b border-zinc-800/20 bg-zinc-900/10 shrink-0 ${isCustomizeMode ? 'cursor-move' : ''}`}
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
                className="text-zinc-500 hover:text-white w-7 h-7 rounded-lg flex items-center justify-center hover:bg-zinc-800/30 transition-all interactive-control relative"
                title="Alarm Center (Timers)"
              >
                <span className="absolute -inset-1.5 cursor-pointer" />
                <List className="w-3.5 h-3.5" />
              </button>
              <button 
                onClick={() => changePanel('settings')} 
                className="text-zinc-500 hover:text-white w-7 h-7 rounded-lg flex items-center justify-center hover:bg-zinc-800/30 transition-all interactive-control relative"
                title="Settings"
              >
                <span className="absolute -inset-1.5 cursor-pointer" />
                <Settings className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <button 
              onClick={() => changePanel('timer')}
              className="text-zinc-400 hover:text-white flex items-center justify-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-900/50 hover:bg-zinc-800/50 border border-zinc-800/60 font-extrabold text-[9px] uppercase tracking-wider interactive-control relative"
            >
              <span className="absolute -inset-1.5 cursor-pointer" />
              <ChevronLeft className="w-3 h-3" /> Back
            </button>
          )
        ) : null}
        <button 
          onClick={handleHide} 
          className="text-zinc-500 hover:text-rose-400 w-7 h-7 rounded-lg flex items-center justify-center hover:bg-rose-500/10 transition-all interactive-control relative"
          title="Minimize to Tray (Esc)"
        >
          <span className="absolute -inset-1.5 cursor-pointer" />
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
