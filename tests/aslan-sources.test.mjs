import test from 'node:test';
import assert from 'node:assert/strict';
import { ASLAN_SOURCES, BASE_SOURCES, WIOSPOR_SOURCES, WIOSPOR_SOURCE_COUNT } from '../src/addons/wiospor/source-registry.mjs';
import { decodeAslanRegistry, matchAslanChannel, parseAslanM3u } from '../src/addons/wiospor/aslan-sources.mjs';

test('WioSpor registry covers all upstream workers', () => {
  assert.equal(BASE_SOURCES.length, 15);
  assert.equal(ASLAN_SOURCES.length, 27);
  assert.equal(WIOSPOR_SOURCE_COUNT, 42);
  assert.equal(WIOSPOR_SOURCES.length, 42);
  assert.equal(new Set(WIOSPOR_SOURCES.map(source => source.id)).size, 42);
});

test('Aslan encrypted bootstrap covers every configured Aslan source', () => {
  const decoded = decodeAslanRegistry();
  assert.equal(decoded.length, 27);
  const ids = new Set(decoded.map(item => item.id));
  for (const source of ASLAN_SOURCES) assert.ok(ids.has(source.sourceId), `missing ${source.sourceId}`);
});

test('Aslan M3U parser preserves playback headers and rejects non-live entries', () => {
  const rows = parseAslanM3u(`#EXTM3U\n#EXTINF:-1 tvg-id="bein1" group-title="Spor",beIN Sports 1 HD\n#EXTVLCOPT:http-user-agent=ExampleUA\n#EXTVLCOPT:http-referrer=https://player.example/\nhttps://cdn.example/live/one.m3u8|Origin=https%3A%2F%2Fplayer.example\n#EXTINF:3600 group-title="Spor",Recorded Match\nhttps://cdn.example/vod.m3u8\n#EXTINF:-1 group-title="Movie",Movie Channel\nhttps://cdn.example/movie.m3u8\n#EXTINF:-1 group-title="Spor",DASH Sport\nhttps://cdn.example/live/manifest.mpd\n`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, 'beIN Sports 1 HD');
  assert.equal(rows[0].players.length, 1);
  assert.equal(rows[0].players[0].headers['User-Agent'], 'ExampleUA');
  assert.equal(rows[0].players[0].headers.Referer, 'https://player.example/');
  assert.equal(rows[0].players[0].headers.Origin, 'https://player.example');
});

test('Aslan channel matcher follows Wio aliases and channel number guards', () => {
  const wio = { name: 'Mor Spor 1', standardTitle: 'beIN Sports 1', aliases: ['Bein Sports 1', 'BEIN 1'] };
  assert.equal(matchAslanChannel(wio, { title: 'BEIN SPORTS 1 HD', id: 'bein1', group: 'Spor' }), true);
  assert.equal(matchAslanChannel(wio, { title: 'BEIN SPORTS 2 HD', id: 'bein2', group: 'Spor' }), false);
});
