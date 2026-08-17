function stripExtension(name = '') {
  return String(name).replace(/\.[a-z0-9]{2,5}$/i, '');
}

function cleanToken(value = '') {
  return String(value)
    .replace(/[_\.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\d\s.\-]+/, '')
    .replace(/\s*[\(\[][^)\]]*[\)\]]\s*/g, ' ')
    .replace(/\b(official|audio|lyric|lyrics|video|hd|remastered|live)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Guess artist / title from a local audio filename before playback.
 * "Artist - Title.mp3" is the common case; otherwise the whole stem is the title.
 */
export function parseSongFilename(fileName = '') {
  const stem = stripExtension(fileName);
  const parts = stem.split(/\s+-\s+|\s+–\s+|\s+—\s+/);
  if (parts.length >= 2) {
    const artist = cleanToken(parts[0]);
    const title = cleanToken(parts.slice(1).join(' - '));
    if (artist && title) {
      return { artist, title, query: `${artist} ${title}`, source: 'filename' };
    }
  }
  const title = cleanToken(stem) || stem.trim();
  return { artist: '', title, query: title, source: 'filename' };
}
