import React from 'react';
import { Play, Pause, RotateCcw, Settings } from 'lucide-react';
import type { TimerModel } from '../types';

interface TimerPanelProps {
  activeTimer: TimerModel | null;
  isActiveTimerExpired: boolean;
  isCustomizeMode: boolean;
  isRunning: boolean;
  timerFontSize: number;
  placeholderDigits: string;
  formattedText: string;
  acknowledgeTimer: (id: string) => void;
  snoozeTimer: (id: string, secs: number) => void;
  toggleTimer: () => void;
  resetTimer: () => void;
  handleOpenEditPanel: (id?: string) => void;
}

export const TimerPanel: React.FC<TimerPanelProps> = ({
  activeTimer,
  isActiveTimerExpired,
  isCustomizeMode,
  isRunning,
  timerFontSize,
  placeholderDigits,
  formattedText,
  acknowledgeTimer,
  snoozeTimer,
  toggleTimer,
  resetTimer,
  handleOpenEditPanel,
}) => {
  if (!activeTimer) return null;

  return (
    <div className="w-full flex flex-col items-center justify-center">
      {/* Optional label above timer */}
      <div className="flex flex-col items-center justify-center max-w-[90%] mb-0.5 select-none pointer-events-none">
        {isActiveTimerExpired ? (
          <span className="font-extrabold tracking-widest text-rose-500 uppercase text-[9.5px] animate-pulse">
            {activeTimer.type === 'deadline' ? 'OVERDUE' : 'EXPIRED'}
          </span>
        ) : activeTimer.label ? (
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
        className={`clock-display relative select-none py-0.5 grid grid-cols-1 grid-rows-1 place-items-center ${(isCustomizeMode || isActiveTimerExpired) ? 'cursor-pointer' : 'cursor-default'}`}
        title={isActiveTimerExpired ? "Click to dismiss alarm" : (isCustomizeMode ? "Click to edit/configure timer" : undefined)}
        onClick={() => {
          if (isActiveTimerExpired) {
            acknowledgeTimer(activeTimer.id);
          } else if (isCustomizeMode) {
            handleOpenEditPanel(activeTimer.id);
          }
        }}
        style={{ height: `${timerFontSize * 1.1}px` }}
      >
        <div 
          className="col-start-1 row-start-1 countdown-text-element text-white/5 font-normal select-none pointer-events-none whitespace-nowrap"
          style={{ 
            fontFamily: 'DSEG7Classic',
            fontSize: `${timerFontSize}px`,
            lineHeight: 1
          }}
        >
          {placeholderDigits}
        </div>
        
        <div 
          className={`col-start-1 row-start-1 countdown-text-element font-normal opacity-100 whitespace-nowrap ${isActiveTimerExpired ? 'text-rose-500' : 'text-white'}`}
          style={{ 
            fontFamily: 'DSEG7Classic',
            fontSize: `${timerFontSize}px`,
            lineHeight: 1
          }}
        >
          {formattedText}
        </div>
      </div>

      {/* Clear, elegant dismissal and snooze buttons when expired */}
      {isActiveTimerExpired && (
        <div className="mt-2.5 flex items-center gap-2 justify-center z-10">
          <button
            onClick={(e) => {
              e.stopPropagation();
              acknowledgeTimer(activeTimer.id);
            }}
            className="px-4 py-2 bg-rose-600/90 hover:bg-rose-500 text-white font-extrabold tracking-widest text-[10px] rounded-lg border border-rose-500/20 transition-all hover:scale-[1.02] active:scale-[0.98] interactive-control shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
          >
            DISMISS
          </button>
          <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-1">
            <span className="text-[8.5px] font-bold text-zinc-550 px-2 tracking-wider uppercase">SNOOZE:</span>
            <button
              onClick={(e) => { e.stopPropagation(); snoozeTimer(activeTimer.id, 60); }}
              className="relative px-3 py-1.5 text-zinc-300 hover:text-white text-[10px] font-bold transition-all hover:bg-zinc-850 rounded-md interactive-control focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-450"
            >
              <span className="absolute -inset-2 cursor-pointer" />
              1m
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); snoozeTimer(activeTimer.id, 300); }}
              className="relative px-3 py-1.5 text-zinc-300 hover:text-white text-[10px] font-bold transition-all hover:bg-zinc-850 rounded-md interactive-control focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-450"
            >
              <span className="absolute -inset-2 cursor-pointer" />
              5m
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); snoozeTimer(activeTimer.id, 600); }}
              className="relative px-3 py-1.5 text-zinc-300 hover:text-white text-[10px] font-bold transition-all hover:bg-zinc-850 rounded-md interactive-control focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-450"
            >
              <span className="absolute -inset-2 cursor-pointer" />
              10m
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); snoozeTimer(activeTimer.id, 1800); }}
              className="relative px-3 py-1.5 text-zinc-300 hover:text-white text-[10px] font-bold transition-all hover:bg-zinc-850 rounded-md interactive-control focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-450"
            >
              <span className="absolute -inset-2 cursor-pointer" />
              30m
            </button>
          </div>
        </div>
      )}

      {/* Hover Actions (Only visible in Customize Mode) */}
      {isCustomizeMode && (
        <div className="flex items-center justify-center gap-4 mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          {activeTimer.type === 'countdown' && (
            <button
              onClick={toggleTimer}
              className="relative w-10 h-10 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/50 transition-all interactive-control focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-450"
              title={isRunning ? "Pause (Space)" : "Start (Space)"}
            >
              <span className="absolute -inset-1 cursor-pointer" />
              {isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
          )}
          <button
            onClick={resetTimer}
            className="relative w-10 h-10 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/50 transition-all interactive-control focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-450"
            title="Reset (R)"
          >
            <span className="absolute -inset-1 cursor-pointer" />
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleOpenEditPanel()}
            className="relative w-10 h-10 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/50 transition-all interactive-control focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-450"
            title="Edit Timer"
          >
            <span className="absolute -inset-1 cursor-pointer" />
            <Settings className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
