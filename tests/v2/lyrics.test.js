import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseSongFilename } from '../../src/v2/lyrics/parseFilename.js';
import { currentLyricIndex, lineEndTime, parseLyrics } from '../../src/v2/lyrics/parseLyrics.js';
import { heardLetterCount, letterCountForLine, timedLetterCount } from '../../src/v2/lyrics/letterProgress.js';

describe('lyrics lookup and letter lighting', () => {
  it('parses artist and title from a local filename before playback', () => {
    const named = parseSongFilename('Fleetwood Mac - The Chain.mp3');
    assert.equal(named.artist, 'Fleetwood Mac');
    assert.equal(named.title, 'The Chain');
    const plain = parseSongFilename('04 hello_world (official audio).flac');
    assert.match(plain.title, /hello world/i);
  });

  it('parses timestamped LRC and lights letters left to right over the line', () => {
    const lines = parseLyrics('[00:01.00]hello world\n[00:03.00]next line');
    assert.equal(lines[0].time, 1);
    assert.equal(currentLyricIndex(lines, 1.2), 0);
    assert.equal(currentLyricIndex(lines, 3.1), 1);
    assert.equal(lineEndTime(lines, 0), 3);
    const mid = timedLetterCount('hello', 1, 3, 2);
    assert.ok(mid > 0 && mid < 5);
    assert.equal(timedLetterCount('hello', 1, 3, 3), 5);
  });

  it('lets live microphone text pull the letter highlight forward', () => {
    const heard = heardLetterCount('Hello world', 'she said hello wo');
    assert.ok(heard >= 8);
    const mixed = letterCountForLine({
      text: 'Hello world',
      start: 0,
      end: 4,
      time: 0.2,
      heardText: 'hello world',
    });
    assert.equal(mixed, 'Hello world'.length);
  });
});
