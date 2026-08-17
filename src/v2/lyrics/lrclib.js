import { parseSongFilename } from './parseFilename.js';

const SEARCH = 'https://lrclib.net/api/search';
const GET = 'https://lrclib.net/api/get';

async function getJson(url) {
  const response = await fetch(url, {
    headers: { 'Lrclib-Client': 'ResonantMirror/2.0' },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`lyrics lookup failed (${response.status})`);
  return response.json();
}

function pickRecord(records, durationSecs) {
  if (!Array.isArray(records) || !records.length) return null;
  const withWords = records.filter((row) => row.syncedLyrics || row.plainLyrics);
  const pool = withWords.length ? withWords : records;
  if (!(durationSecs > 0)) return pool[0];
  return pool.reduce((best, row) => {
    const dBest = Math.abs((best.duration || 0) - durationSecs);
    const dRow = Math.abs((row.duration || 0) - durationSecs);
    return dRow < dBest ? row : best;
  }, pool[0]);
}

export async function fetchLyricsForSong({ artist = '', title = '', query = '', durationSecs = 0 } = {}) {
  const q = query || [artist, title].filter(Boolean).join(' ');
  if (!q) return { ok: false, reason: 'no title to look up' };

  if (artist && title) {
    const params = new URLSearchParams({
      track_name: title,
      artist_name: artist,
    });
    if (durationSecs > 1) params.set('duration', String(Math.round(durationSecs)));
    try {
      const exact = await getJson(`${GET}?${params}`);
      if (exact?.syncedLyrics || exact?.plainLyrics) {
        return { ok: true, record: exact, source: 'lrclib' };
      }
    } catch {
      // Fall through to search.
    }
  }

  const searchParams = new URLSearchParams({ q });
  const results = await getJson(`${SEARCH}?${searchParams}`);
  const record = pickRecord(results, durationSecs);
  if (!record) return { ok: false, reason: 'no lyrics match' };
  return { ok: true, record, source: 'lrclib' };
}

export async function lookupLyricsFromFilename(fileName, durationSecs = 0) {
  const parsed = parseSongFilename(fileName);
  const result = await fetchLyricsForSong({ ...parsed, durationSecs });
  return { ...parsed, ...result };
}
