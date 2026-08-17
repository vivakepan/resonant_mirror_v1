const LINE_RE = /^\[(\d+):(\d{1,2}(?:\.\d+)?)\](.*)$/;

export function parseLyrics(rawText = '') {
  const lines = String(rawText).split(/\r?\n/);
  const timed = [];
  for (const line of lines) {
    const m = LINE_RE.exec(line.trim());
    if (m) {
      const time = parseInt(m[1], 10) * 60 + parseFloat(m[2]);
      const text = m[3].replace(/<[\d.:]+>/g, '').trim();
      if (text) timed.push({ time, text });
    }
  }
  if (timed.length > 0) {
    timed.sort((a, b) => a.time - b.time);
    return timed;
  }
  return lines
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('['))
    .map((text) => ({ time: null, text }));
}

export function currentLyricIndex(lines, songTimeSecs, durationSecs = 0) {
  if (!lines.length) return 0;
  if (lines[0].time != null) {
    let idx = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].time <= songTimeSecs) idx = i;
      else break;
    }
    return idx;
  }
  if (Number.isFinite(durationSecs) && durationSecs > 0) {
    return Math.min(
      Math.floor((songTimeSecs / durationSecs) * lines.length),
      lines.length - 1,
    );
  }
  return 0;
}

export function lineEndTime(lines, index, durationSecs = 0) {
  const next = lines[index + 1];
  if (next?.time != null) return next.time;
  const cur = lines[index];
  if (cur?.time != null) {
    const guessed = cur.time + Math.max(1.8, (cur.text?.length || 8) * 0.09);
    return durationSecs > 0 ? Math.min(durationSecs, guessed) : guessed;
  }
  if (durationSecs > 0 && lines.length) {
    return ((index + 1) / lines.length) * durationSecs;
  }
  return 0;
}
