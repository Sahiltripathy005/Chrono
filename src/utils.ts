// Format total seconds into a digital clock string
export const formatTime = (totalSeconds: number, showSeconds: boolean): string => {
  const days = Math.floor(totalSeconds / 86400);
  const remainingSecs = totalSeconds % 86400;
  
  const hrs = Math.floor(remainingSecs / 3600);
  const mins = Math.floor((remainingSecs % 3600) / 60);
  const secs = remainingSecs % 60;

  const pad = (num: number) => String(num).padStart(2, '0');

  if (days > 0) {
    if (showSeconds) {
      return `${days}d ${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
    } else {
      return `${days}d ${pad(hrs)}:${pad(mins)}`;
    }
  }

  if (hrs > 0) {
    if (showSeconds) {
      return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
    } else {
      return `${pad(hrs)}:${pad(mins)}`;
    }
  } else {
    if (showSeconds) {
      return `${pad(mins)}:${pad(secs)}`;
    } else {
      return `${pad(mins)}`;
    }
  }
};

export const formatListTime = (totalSeconds: number): string => {
  const days = Math.floor(totalSeconds / 86400);
  const remainingSecs = totalSeconds % 86400;
  
  const hrs = Math.floor(remainingSecs / 3600);
  const mins = Math.floor((remainingSecs % 3600) / 60);
  const secs = remainingSecs % 60;

  const pad = (num: number) => String(num).padStart(2, '0');

  if (days > 0) {
    return `${days}d ${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  } else {
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  }
};
