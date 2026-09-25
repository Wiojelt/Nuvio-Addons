import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { matchBirdirbirChannel, toBirdirbirStreams } from '../src/addons/wiospor/birdirbir.mjs';

const channels = JSON.parse(fs.readFileSync(new URL('../generated/birdirbir/channels.json', import.meta.url), 'utf8'));

test('Birdirbir database keeps every panel and a large channel/stream catalogue', () => {
  assert.ok(channels.length >= 50);
  const panels = new Set();
  let streams = 0;
  for (const channel of channels) for (const source of channel.streams || []) {
    streams += 1;
    panels.add(source.panel);
  }
  assert.ok(streams >= 100);
  for (const panel of ['Eagle', '8kGold', 'Spor20x', 'WorldSport']) {
    assert.ok(panels.has(panel), `missing ${panel}`);
  }
});

test('Birdirbir Wio matcher keeps channel number guards', () => {
  const wio = { name: 'Mor Spor 1', standardTitle: 'beIN Sports 1', aliases: ['Bein Sports 1', 'BEIN 1'] };
  assert.equal(matchBirdirbirChannel(wio, { id: 'x', name: 'BEIN SPORTS 1 HD' }), true);
  assert.equal(matchBirdirbirChannel(wio, { id: 'x', name: 'BEIN SPORTS 2 HD' }), false);
});

test('Birdirbir stream adapter preserves every distinct panel source', () => {
  const sample = {
    name: 'Test',
    streams: [
      { panel: 'Eagle', label: 'A', quality: 'FHD', url: 'https://one.example/live.m3u8' },
      { panel: '8kGold', label: 'B', quality: 'HD', url: 'https://two.example/live.m3u8' }
    ]
  };
  const out = toBirdirbirStreams(sample);
  assert.equal(out.length, 2);
  assert.equal(out[0].name, 'Birdirbir • Eagle');
  assert.match(out[0].title, /1080p/);
});
