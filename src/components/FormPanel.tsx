import React from 'react';

interface FormPanelProps {
  isActive: boolean;
  currentPanel: 'add' | 'edit';
  editingTimerId: string | null;
  setEditingTimerId: (id: string | null) => void;
  formType: 'countdown' | 'deadline';
  setFormType: (type: 'countdown' | 'deadline') => void;
  formLabel: string;
  setFormLabel: (label: string) => void;
  formHours: number;
  setFormHours: React.Dispatch<React.SetStateAction<number>>;
  formMinutes: number;
  setFormMinutes: React.Dispatch<React.SetStateAction<number>>;
  formSeconds: number;
  setFormSeconds: React.Dispatch<React.SetStateAction<number>>;
  currentYear: number;
  setCurrentYear: React.Dispatch<React.SetStateAction<number>>;
  currentMonth: number;
  setCurrentMonth: React.Dispatch<React.SetStateAction<number>>;
  selectedDate: Date;
  setSelectedDate: React.Dispatch<React.SetStateAction<Date>>;
  selectedHour: string;
  setSelectedHour: React.Dispatch<React.SetStateAction<string>>;
  selectedMinute: string;
  setSelectedMinute: React.Dispatch<React.SetStateAction<string>>;
  selectedAmPm: 'AM' | 'PM';
  setSelectedAmPm: React.Dispatch<React.SetStateAction<'AM' | 'PM'>>;
  formAlarmEnabled: boolean;
  setFormAlarmEnabled: (val: boolean) => void;
  applyPreset: (preset: '30m' | '1h' | '2h' | 'tonight' | 'tomorrow' | 'next-monday') => void;
  handleSaveForm: () => void;
  changePanel: (panel: 'timer' | 'settings' | 'manager' | 'add' | 'edit') => void;
}

export const FormPanel: React.FC<FormPanelProps> = ({
  isActive,
  currentPanel,
  editingTimerId,
  setEditingTimerId,
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
  applyPreset,
  handleSaveForm,
  changePanel,
}) => {
  const getDaysInMonth = (y: number, m: number) => {
    const firstDay = new Date(y, m, 1);
    const startDayOfWeek = firstDay.getDay(); // 0 is Sunday, 6 is Saturday
    const result = [];

    // 1. Previous month padding days
    const prevMonthLastDate = new Date(y, m, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      result.push({
        date: new Date(y, m - 1, prevMonthLastDate - i),
        isCurrentMonth: false
      });
    }

    // 2. Current month days
    const currentMonthDaysCount = new Date(y, m + 1, 0).getDate();
    for (let i = 1; i <= currentMonthDaysCount; i++) {
      result.push({
        date: new Date(y, m, i),
        isCurrentMonth: true
      });
    }

    // 3. Next month padding days to complete a 6-row grid (42 days)
    const remainingDays = 42 - result.length;
    for (let i = 1; i <= remainingDays; i++) {
      result.push({
        date: new Date(y, m + 1, i),
        isCurrentMonth: false
      });
    }

    return result;
  };

  const calendarDays = getDaysInMonth(currentYear, currentMonth);

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

  return (
    <div className={`panel-transition absolute inset-0 bg-zinc-950/90 backdrop-blur-md flex flex-col p-6 z-10 text-xs ${
      isActive ? 'panel-visible' : 'panel-hidden'
    }`}>
      <div className="pb-2.5 border-b border-zinc-800/80 mb-4 shrink-0">
        <span className="text-[10px] font-bold text-zinc-300 tracking-widest uppercase">
          {currentPanel === 'add' ? 'ADD NEW TIMER' : 'EDIT TIMER'}
        </span>
      </div>

      <div className="grid grid-cols-[1fr_1.3fr] gap-6 flex-1 min-h-0 items-start">
        <div className="flex flex-col h-full border-r border-zinc-800 pr-6 justify-center">
          <div className="flex border border-zinc-700 rounded-lg p-0.5 bg-zinc-900/50 mb-3 shrink-0">
            <button
              onClick={() => setFormType('countdown')}
              className={`relative flex-1 text-[9px] font-extrabold py-2 rounded-md transition-all interactive-control focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-450 ${formType === 'countdown' ? 'bg-white text-zinc-950 shadow' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              <span className="absolute -inset-1.5 cursor-pointer" />
              COUNTDOWN
            </button>
            <button
              onClick={() => setFormType('deadline')}
              className={`relative flex-1 text-[9px] font-extrabold py-2 rounded-md transition-all interactive-control focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-450 ${formType === 'deadline' ? 'bg-white text-zinc-950 shadow' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              <span className="absolute -inset-1.5 cursor-pointer" />
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
                  className="relative px-3 py-1.5 bg-zinc-900 border border-zinc-750 hover:border-zinc-550 rounded-lg interactive-control text-zinc-200 hover:text-white transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-450"
                >
                  <span className="absolute -inset-2 cursor-pointer" />
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
                  className="relative px-3 py-1.5 bg-zinc-900 border border-zinc-750 hover:border-zinc-550 rounded-lg interactive-control text-zinc-200 hover:text-white transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-450"
                >
                  <span className="absolute -inset-2 cursor-pointer" />
                  &gt;
                </button>
              </div>

              <div className="grid grid-cols-7 text-center text-[8px] text-zinc-400 font-extrabold mb-1 uppercase tracking-wider">
                <span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>
              </div>

              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((day, idx) => {
                  const isSel = selectedDate && 
                    selectedDate.getDate() === day.date.getDate() && 
                    selectedDate.getMonth() === day.date.getMonth() && 
                    selectedDate.getFullYear() === day.date.getFullYear();

                  const isTdy = new Date().getDate() === day.date.getDate() && 
                    new Date().getMonth() === day.date.getMonth() && 
                    new Date().getFullYear() === day.date.getFullYear();

                  const todayMidnight = new Date();
                  todayMidnight.setHours(0, 0, 0, 0);
                  const isPast = day.date < todayMidnight;

                  return (
                    <button
                      key={idx}
                      disabled={isPast}
                      onClick={() => setSelectedDate(day.date)}
                      className={`relative h-7 w-full rounded-md flex items-center justify-center text-[10px] font-bold interactive-control transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-455 ${
                        isPast 
                          ? 'text-zinc-700 opacity-25 cursor-not-allowed pointer-events-none'
                          : isSel 
                            ? 'bg-white text-zinc-950 shadow border border-transparent' 
                            : isTdy 
                              ? 'border border-zinc-400 text-zinc-50 font-extrabold bg-zinc-900/50' 
                              : day.isCurrentMonth
                                ? 'text-zinc-300 hover:bg-zinc-800 hover:text-white border border-transparent'
                                : 'text-zinc-650 hover:bg-zinc-850 hover:text-zinc-350 border border-transparent'
                      }`}
                    >
                      <span className="absolute -inset-1.5 cursor-pointer" />
                      {day.date.getDate()}
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
                    className="w-12 h-9 text-center bg-zinc-900 border border-zinc-750 focus:border-zinc-450 focus:bg-zinc-850 hover:border-zinc-600 text-white rounded-lg p-1 outline-none font-mono text-sm font-bold selection:bg-white/20 interactive-control transition-all focus-visible:ring-2 focus-visible:ring-white"
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
                    className="w-12 h-9 text-center bg-zinc-900 border border-zinc-755 focus:border-zinc-455 focus:bg-zinc-850 hover:border-zinc-600 text-white rounded-lg p-1 outline-none font-mono text-sm font-bold selection:bg-white/20 interactive-control transition-all focus-visible:ring-2 focus-visible:ring-white"
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
                    className="w-12 h-9 text-center bg-zinc-900 border border-zinc-750 focus:border-zinc-450 focus:bg-zinc-850 hover:border-zinc-600 text-white rounded-lg p-1 outline-none font-mono text-sm font-bold selection:bg-white/20 interactive-control transition-all focus-visible:ring-2 focus-visible:ring-white"
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
                className="w-full bg-zinc-900 border border-zinc-750 text-white rounded-lg px-2.5 py-1.5 outline-none text-xs placeholder-zinc-550 font-bold focus:border-zinc-450 focus:bg-zinc-850 transition-all interactive-control focus-visible:ring-2 focus-visible:ring-white"
              />
            </div>

            <div className="flex items-center justify-between border-t border-b border-zinc-850/60 py-2 mt-0.5 shrink-0">
              <div className="flex flex-col">
                <span className="text-zinc-300 font-bold text-[8.5px] uppercase tracking-wider block">Alarm Sound</span>
                <span className="text-[8px] text-zinc-500 font-semibold uppercase tracking-wider">Play tone when expired</span>
              </div>
              <button
                onClick={() => setFormAlarmEnabled(!formAlarmEnabled)}
                className={`relative w-9 h-5 rounded-full p-0.5 transition-all focus-visible:ring-2 focus-visible:ring-zinc-450 focus:outline-none interactive-control ${formAlarmEnabled ? 'bg-white' : 'bg-zinc-800 hover:bg-zinc-700 border border-zinc-700'}`}
              >
                <span className="absolute -inset-3 cursor-pointer" />
                <div className={`w-4 h-4 rounded-full transition-transform ${formAlarmEnabled ? 'translate-x-4 bg-zinc-950' : 'translate-x-0 bg-zinc-200'}`} />
              </button>
            </div>

            {formType === 'deadline' && (
              <div className="flex flex-col gap-3">
                <div>
                  <span className="text-zinc-300 font-bold text-[8.5px] uppercase tracking-wider block mb-1">Presets</span>
                  <div className="grid grid-cols-3 gap-1">
                    <button onClick={() => applyPreset('30m')} className="relative py-2 bg-zinc-900/60 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:border-zinc-650 hover:text-white active:bg-white active:text-zinc-950 rounded-md text-[9px] font-extrabold tracking-wider transition-all interactive-control focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-450"><span className="absolute -inset-1 cursor-pointer" />+30m</button>
                    <button onClick={() => applyPreset('1h')} className="relative py-2 bg-zinc-900/60 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:border-zinc-650 hover:text-white active:bg-white active:text-zinc-950 rounded-md text-[9px] font-extrabold tracking-wider transition-all interactive-control focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-450"><span className="absolute -inset-1 cursor-pointer" />+1h</button>
                    <button onClick={() => applyPreset('2h')} className="relative py-2 bg-zinc-900/60 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:border-zinc-650 hover:text-white active:bg-white active:text-zinc-950 rounded-md text-[9px] font-extrabold tracking-wider transition-all interactive-control focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-450"><span className="absolute -inset-1 cursor-pointer" />+2h</button>
                    <button onClick={() => applyPreset('tonight')} className="relative py-2 bg-zinc-900/60 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:border-zinc-650 hover:text-white active:bg-white active:text-zinc-950 rounded-md text-[9px] font-extrabold tracking-wider transition-all interactive-control focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-450"><span className="absolute -inset-1 cursor-pointer" />Tonight</button>
                    <button onClick={() => applyPreset('tomorrow')} className="relative py-2 bg-zinc-900/60 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:border-zinc-650 hover:text-white active:bg-white active:text-zinc-950 rounded-md text-[9px] font-extrabold tracking-wider transition-all interactive-control focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-450"><span className="absolute -inset-1 cursor-pointer" />Tmrw</button>
                    <button onClick={() => applyPreset('next-monday')} className="relative py-2 bg-zinc-900/60 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:border-zinc-650 hover:text-white active:bg-white active:text-zinc-950 rounded-md text-[9px] font-extrabold tracking-wider transition-all interactive-control focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-450"><span className="absolute -inset-1 cursor-pointer" />Next Mon</button>
                  </div>
                </div>

                <div>
                  <span className="text-zinc-300 font-bold text-[8.5px] uppercase tracking-wider block mb-1">Time</span>
                  <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 max-w-fit gap-1 mt-1">
                    <input
                      type="number"
                      min="1"
                      max="12"
                      value={selectedHour}
                      onKeyDown={handleHourKeyDown}
                      onChange={(e) => setSelectedHour(String(Math.max(1, Math.min(12, parseInt(e.target.value, 10) || 12))).padStart(2, '0'))}
                      className="w-9 h-7 text-center bg-transparent border-0 text-white outline-none font-mono text-xs font-bold selection:bg-white/20"
                    />
                    <span className="text-zinc-500 font-bold text-xs select-none">:</span>
                    <input
                      type="number"
                      min="0"
                      max="59"
                      value={selectedMinute}
                      onKeyDown={handleMinuteKeyDown}
                      onChange={(e) => setSelectedMinute(String(Math.max(0, Math.min(59, parseInt(e.target.value, 10) || 0))).padStart(2, '0'))}
                      className="w-9 h-7 text-center bg-transparent border-0 text-white outline-none font-mono text-xs font-bold selection:bg-white/20"
                    />
                    <button
                      onClick={() => setSelectedAmPm(prev => prev === 'AM' ? 'PM' : 'AM')}
                      className="relative h-7 px-2.5 bg-zinc-800 hover:bg-zinc-755 text-zinc-200 hover:text-white rounded-md text-[9px] font-extrabold tracking-wider transition-all focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-450 shrink-0"
                    >
                      <span className="absolute -inset-1 cursor-pointer" />
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
              className="flex-1 border border-zinc-700 hover:border-zinc-550 hover:text-white text-zinc-300 rounded-lg py-2.5 font-bold text-[9px] uppercase tracking-widest transition-colors interactive-control focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 focus:outline-none"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveForm}
              className="flex-1 bg-white hover:bg-zinc-100 active:scale-[0.98] text-zinc-950 rounded-lg py-2.5 font-bold text-[9px] uppercase tracking-widest transition-all interactive-control focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 focus:outline-none"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
