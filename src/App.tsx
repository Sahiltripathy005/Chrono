import { useTimerApp } from './hooks/useTimerApp';
import { formatListTime } from './utils';

import { Header } from './components/Header';
import { TimerPanel } from './components/TimerPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { ManagerPanel } from './components/ManagerPanel';
import { FormPanel } from './components/FormPanel';

export default function App() {
  const {
    settings,
    setSettings,
    isCustomizeMode,
    badgeText,
    currentPanel,
    editingTimerId,
    setEditingTimerId,
    selectedCompletedIds,
    setSelectedCompletedIds,
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
    handleSwitchWorkspace,
    handleCreateWorkspace,
    handleRenameWorkspace,
    handleDeleteWorkspace,
    handleMouseEnter,
    handleMouseLeave,
    getRemainingSecondsForTimer,
    activeTimer,
    isRunning,
    flashOverlayOpacity,
    acknowledgeTimer,
    snoozeTimer,
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
    isActiveTimerExpired,
    formattedText,
    placeholderDigits,
    renderedOpacity,
    timerFontSize,
  } = useTimerApp();

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
      style={{ opacity: renderedOpacity }}
    >
      {/* Expiration visual flash overlay */}
      <div 
        className="absolute inset-0 bg-white pointer-events-none transition-opacity duration-200 z-50"
        style={{ opacity: flashOverlayOpacity }}
      />
      {/* Hidden element to satisfy compiler and force tick updates */}
      <div style={{ display: 'none' }}>{tickTime}</div>
      {/* Visual Mode Badge */}
      {badgeText && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/10 border border-white/20 text-white text-[9px] font-bold tracking-widest uppercase px-3.5 py-1.5 rounded-full backdrop-blur-md transition-opacity duration-300 pointer-events-none z-50 shadow-xl">
          {badgeText}
        </div>
      )}

      {/* Header bar */}
      <Header
        isCustomizeMode={isCustomizeMode}
        currentPanel={currentPanel}
        changePanel={changePanel}
        handleMouseDown={handleMouseDown}
        handleMouseUp={handleMouseUp}
        handleHide={handleHide}
      />

      {/* Main Content Area */}
      <div 
        className="flex-1 relative flex flex-col justify-center px-4 overflow-hidden"
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
      >
        {currentPanel === 'timer' && activeTimer && (
          <TimerPanel
            activeTimer={activeTimer}
            isActiveTimerExpired={isActiveTimerExpired}
            isCustomizeMode={isCustomizeMode}
            isRunning={isRunning}
            timerFontSize={timerFontSize}
            placeholderDigits={placeholderDigits}
            formattedText={formattedText}
            acknowledgeTimer={acknowledgeTimer}
            snoozeTimer={snoozeTimer}
            toggleTimer={toggleTimer}
            resetTimer={resetTimer}
            handleOpenEditPanel={handleOpenEditPanel}
          />
        )}

        {/* 1. FIXED-SIZE SETTINGS PANEL */}
        {isCustomizeMode && (
          <SettingsPanel
            isActive={currentPanel === 'settings'}
            settings={settings}
            handleToggleSeconds={handleToggleSeconds}
            handleToggleAlwaysOnTop={handleToggleAlwaysOnTop}
            handleToggleStartup={handleToggleStartup}
            handleDisableStartupNextBoot={handleDisableStartupNextBoot}
            handleToggleSound={handleToggleSound}
            handleSetSelectionMode={handleSetSelectionMode}
            handleOpacityChange={handleOpacityChange}
            changePanel={changePanel}
          />
        )}

        {/* 2. FIXED-SIZE ALARM CENTER / TIMER MANAGER */}
        {isCustomizeMode && (
          <ManagerPanel
            isActive={currentPanel === 'manager'}
            settings={settings}
            activeTimer={activeTimer}
            selectedManagerTimerId={selectedManagerTimerId}
            setSelectedManagerTimerId={setSelectedManagerTimerId}
            selectedCompletedIds={selectedCompletedIds}
            setSelectedCompletedIds={setSelectedCompletedIds}
            getRemainingSecondsForTimer={getRemainingSecondsForTimer}
            formatListTime={formatListTime}
            changePanel={changePanel}
            handleOpenAddPanel={handleOpenAddPanel}
            handleOpenEditPanel={handleOpenEditPanel}
            handleSwitchWorkspace={handleSwitchWorkspace}
            handleRenameWorkspace={handleRenameWorkspace}
            handleDeleteWorkspace={handleDeleteWorkspace}
            handleCreateWorkspace={handleCreateWorkspace}
            handleToggleTimerInList={handleToggleTimerInList}
            handleTogglePinTimer={handleTogglePinTimer}
            handleDeleteTimer={handleDeleteTimer}
            handleDeleteSelectedCompleted={handleDeleteSelectedCompleted}
            handleClearCompleted={handleClearCompleted}
            setSettings={setSettings}
            acknowledgeTimer={acknowledgeTimer}
          />
        )}

        {/* 3. FIXED-SIZE ADD / EDIT TIMERS (DEADLINE EDITOR) */}
        {isCustomizeMode && (
          <FormPanel
            isActive={currentPanel === 'add' || currentPanel === 'edit'}
            currentPanel={currentPanel === 'add' ? 'add' : 'edit'}
            editingTimerId={editingTimerId}
            setEditingTimerId={setEditingTimerId}
            formType={formType}
            setFormType={setFormType}
            formLabel={formLabel}
            setFormLabel={setFormLabel}
            formHours={formHours}
            setFormHours={setFormHours}
            formMinutes={formMinutes}
            setFormMinutes={setFormMinutes}
            formSeconds={formSeconds}
            setFormSeconds={setFormSeconds}
            currentYear={currentYear}
            setCurrentYear={setCurrentYear}
            currentMonth={currentMonth}
            setCurrentMonth={setCurrentMonth}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            selectedHour={selectedHour}
            setSelectedHour={setSelectedHour}
            selectedMinute={selectedMinute}
            setSelectedMinute={setSelectedMinute}
            selectedAmPm={selectedAmPm}
            setSelectedAmPm={setSelectedAmPm}
            formAlarmEnabled={formAlarmEnabled}
            setFormAlarmEnabled={setFormAlarmEnabled}
            applyPreset={applyPreset}
            handleSaveForm={handleSaveForm}
            changePanel={changePanel}
          />
        )}
      </div>
    </div>
  );
}
