import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

async function loadProvider(relativePath, fetchImpl) {
  const code = await fs.readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
  const module = { exports: {} };
  const context = vm.createContext({
    module,
    exports: module.exports,
    fetch: fetchImpl,
    require,
    console,
    Promise,
    String,
    Number,
    Array,
    Object,
    RegExp,
    Math,
    JSON,
    encodeURIComponent,
    decodeURIComponent,
    setTimeout,
    clearTimeout
  });
  new vm.Script(code, { filename: relativePath }).runInContext(context);
  return module.exports;
}

function response({ json, text = '', ok = true }) {
  return {
    ok,
    json: async () => json,
    text: async () => text
  };
}

test('WioCinema uses the Nuvio scraper repository manifest schema with 9 native providers', async () => {
  const manifest = JSON.parse(await fs.readFile(new URL('../wiocinema/manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.name, 'WioCinema');
  assert.ok(Array.isArray(manifest.scrapers));
  assert.equal(manifest.scrapers.length, 9);

  const expectedProviders = [
    'wiocinema-clipbox',
    'wiocinema-cinestream',
    'wiocinema-mapple',
    'wiocinema-bingebang',
    'wiocinema-cinecat',
    'wiocinema-flixnetwork',
    'wiocinema-watch2movies',
    'wiocinema-7reels',
    'wiocinema-velarium'
  ];

  const actualIds = manifest.scrapers.map(s => s.id);
  assert.deepEqual(actualIds, expectedProviders);

  for (const scraper of manifest.scrapers) {
    assert.ok(scraper.name.startsWith('WioCinema •'));
    assert.ok(scraper.filename);
    assert.equal(typeof scraper.enabled, 'boolean');
    assert.deepEqual(scraper.contentLanguage, ['en']);
    await fs.access(new URL(`../wiocinema/${scraper.filename}`, import.meta.url));
    await fs.access(new URL(`../${scraper.filename}`, import.meta.url));
  }
});

test('WioCinema ClipBox provider extracts stream with WioCinema branding', async () => {
  const calls = [];
  const provider = await loadProvider('wiocinema/providers/wiocinema-clipbox.js', async (url) => {
    calls.push(String(url));
    if (String(url).includes('/api/movie/550')) return response({ json: { src: '/embed/xyz' } });
    if (String(url).endsWith('/embed/xyz')) return response({ text: `player({file:'https://cdn.example/wiocinema.m3u8',token:'tok123',expires:'456'})` });
    return response({ ok: false });
  });
  const streams = await provider.getStreams('550', 'movie', null, null);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].name, 'WioCinema • ClipBox');
  assert.equal(streams[0].provider, 'wiocinema-clipbox');
  assert.equal(streams[0].quality, 1080);
  assert.equal(streams[0].format, 'm3u8');
  assert.equal(streams[0].url, 'https://cdn.example/wiocinema.m3u8?token=tok123&expires=456&h=1');
});

test('WioCinema CineStream provider consolidates Vidup and Hexa streams', async () => {
  const provider = await loadProvider('wiocinema/providers/wiocinema-cinestream.js', async (url, options = {}) => {
    const u = String(url);
    if (u === 'https://vidup.to/movie/603') return response({ text: '{"token":"ENC_TOK"}' });
    if (u.startsWith('https://enc-dec.app/api/enc-vidup?text=')) return response({ text: JSON.stringify({ status: 200, result: { servers: 'https://vidup.to/api/servers', stream: 'https://vidup.to/api/stream', token: 'csrf-1' } }) });
    if (u === 'https://vidup.to/api/servers') return response({ text: 'SERVERS_RAW' });
    if (u === 'https://vidup.to/api/stream/srv1') return response({ text: 'STREAM_RAW' });
    if (u === 'https://enc-dec.app/api/dec-vidup') {
      const payload = JSON.parse(options.body || '{}');
      if (payload.text === 'SERVERS_RAW') return response({ text: JSON.stringify({ status: 200, result: [{ name: 'Server1', data: 'srv1' }] }) });
      if (payload.text === 'STREAM_RAW') return response({ text: JSON.stringify({ status: 200, result: { url: 'https://cdn.example/matrix.m3u8', tracks: [] } }) });
    }
    if (u === 'https://enc-dec.app/api/enc-hexa') return response({ text: JSON.stringify({ result: { token: 'cap-tok' } }) });
    if (u === 'https://theemoviedb.hexa.su/api/tmdb/movie/603/images') return response({ text: 'HEXA_RAW' });
    if (u === 'https://enc-dec.app/api/dec-hexa') return response({ text: JSON.stringify({ result: { sources: [{ server: 'Fast', url: 'https://cdn.example/hexa-stream.m3u8' }] } }) });
    return response({ ok: false });
  });
  const streams = await provider.getStreams(603, 'movie', null, null);
  assert.ok(streams.length >= 2);
  assert.ok(streams.some(s => s.name === 'WioCinema • CineStream' && s.title.includes('Vidup')));
  assert.ok(streams.some(s => s.name === 'WioCinema • CineStream' && s.title.includes('Hexa')));
  assert.equal(streams[0].provider, 'wiocinema-cinestream');
});

test('WioCinema Mapple provider extracts multi-source streams', async () => {
  const provider = await loadProvider('wiocinema/providers/wiocinema-mapple.js', async (url) => {
    const u = String(url);
    if (u.includes('/api/movie/550')) return response({ text: JSON.stringify({ src: '/embed/map' }) });
    if (u.endsWith('/embed/map')) return response({ text: `player({file:'https://cdn.example/mapple.m3u8',token:'tok',expires:'exp'})` });
    return response({ ok: false });
  });
  const streams = await provider.getStreams('550', 'movie', null, null);
  assert.equal(streams.length, 10);
  assert.ok(streams.some(s => s.name === 'WioCinema • Mapple' && s.title.includes('VixSrc')));
  assert.ok(streams.some(s => s.name === 'WioCinema • Mapple' && s.title.includes('VidSrc Me')));
  assert.ok(streams.some(s => s.name === 'WioCinema • Mapple' && s.title.includes('VidLink')));
  assert.ok(streams.some(s => s.name === 'WioCinema • Mapple' && s.title.includes('SuperEmbed')));
  assert.equal(streams[0].provider, 'wiocinema-mapple');
});

test('WioCinema BingeBang provider extracts stream', async () => {
  const provider = await loadProvider('wiocinema/providers/wiocinema-bingebang.js', async (url) => {
    return response({ text: '<html><script>var file = "https://cdn.example/binge.m3u8";</script></html>' });
  });
  const streams = await provider.getStreams('550', 'movie', null, null);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].name, 'WioCinema • BingeBang');
  assert.equal(streams[0].provider, 'wiocinema-bingebang');
  assert.equal(streams[0].url, 'https://cdn.example/binge.m3u8');
});

test('WioCinema CineCat provider extracts stream', async () => {
  const provider = await loadProvider('wiocinema/providers/wiocinema-cinecat.js', async (url) => {
    return response({ text: '<html><script>var file = "https://cdn.example/cinecat.m3u8";</script></html>' });
  });
  const streams = await provider.getStreams('550', 'movie', null, null);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].name, 'WioCinema • CineCat');
  assert.equal(streams[0].provider, 'wiocinema-cinecat');
  assert.equal(streams[0].url, 'https://cdn.example/cinecat.m3u8');
});

test('WioCinema FlixNetwork provider extracts stream', async () => {
  const provider = await loadProvider('wiocinema/providers/wiocinema-flixnetwork.js', async (url) => {
    return response({ text: '<html><script>var file = "https://cdn.example/flix.m3u8";</script></html>' });
  });
  const streams = await provider.getStreams('550', 'movie', null, null);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].name, 'WioCinema • FlixNetwork');
  assert.equal(streams[0].provider, 'wiocinema-flixnetwork');
  assert.equal(streams[0].url, 'https://cdn.example/flix.m3u8');
});

test('WioCinema Watch2Movies provider extracts stream', async () => {
  const provider = await loadProvider('wiocinema/providers/wiocinema-watch2movies.js', async (url) => {
    return response({ text: '<html><script>var file = "https://cdn.example/watch2.m3u8";</script></html>' });
  });
  const streams = await provider.getStreams('550', 'movie', null, null);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].name, 'WioCinema • Watch2Movies');
  assert.equal(streams[0].provider, 'wiocinema-watch2movies');
  assert.equal(streams[0].url, 'https://cdn.example/watch2.m3u8');
});

test('WioCinema 7Reels provider extracts direct 4K master m3u8 streams with subtitles', async () => {
  const provider = await loadProvider('wiocinema/providers/wiocinema-7reels.js', async (url, options = {}) => {
    const u = String(url);
    if (u === 'https://vidfast.vc/movie/157336/') return response({ text: '{"token":"TOK_VF"}' });
    if (u.startsWith('https://enc-dec.app/api/enc-vidfast?text=')) {
      return response({ text: JSON.stringify({ status: 200, result: { servers: 'https://vidfast.vc/api/servers', stream: 'https://vidfast.vc/api/stream', token: 'csrf-vf' } }) });
    }
    if (u === 'https://vidfast.vc/api/servers') return response({ text: 'RAW_SERVERS' });
    if (u === 'https://vidfast.vc/api/stream/srv1') return response({ text: 'RAW_STREAM' });
    if (u === 'https://enc-dec.app/api/dec-vidfast') {
      const payload = JSON.parse(options.body || '{}');
      if (payload.text === 'RAW_SERVERS') return response({ text: JSON.stringify({ status: 200, result: [{ name: 'vRapid', data: 'srv1' }] }) });
      if (payload.text === 'RAW_STREAM') return response({ text: JSON.stringify({ status: 200, result: { url: 'https://cdn.example/7reels-4k.m3u8', is4kAvailable: true, tracks: [{ file: 'https://cdn.example/sub.vtt', label: 'English' }] } }) });
    }
    if (u.includes('/api/movie/157336')) return response({ text: JSON.stringify({ src: '/embed/vix123' }) });
    if (u.endsWith('/embed/vix123')) return response({ text: `player({file:'https://cdn.example/vix.m3u8',token:'tok',expires:'exp'})` });
    return response({ ok: false });
  });

  const streams = await provider.getStreams('157336', 'movie', null, null);
  assert.ok(streams.length >= 2);
  assert.ok(streams.some(s => s.name === 'WioCinema • 7Reels' && s.title.includes('vRapid') && s.quality === 2160));
  assert.ok(streams.every(s => s.format === 'm3u8'));
  assert.equal(streams[0].provider, 'wiocinema-7reels');
  assert.ok(Array.isArray(streams[0].subtitles) && streams[0].subtitles.length > 0);
  assert.ok(streams[0].subtitles.some(sub => sub.language === 'tr'));
  assert.ok(streams[0].subtitles.some(sub => sub.language === 'en'));

  // Fallback check
  const fallbackProvider = await loadProvider('wiocinema/providers/wiocinema-7reels.js', async () => response({ ok: false }));
  const fallbackStreams = await fallbackProvider.getStreams('1399', 'tv', 1, 1);
  assert.ok(fallbackStreams.length >= 2);
  assert.equal(fallbackStreams[0].format, 'm3u8');
  assert.ok(fallbackStreams[0].url.includes('/tv/1399/1/1'));
});

test('WioCinema Velarium provider extracts direct 4K master m3u8 streams with subtitles and fallback', async () => {
  const provider = await loadProvider('wiocinema/providers/wiocinema-velarium.js', async (url, options = {}) => {
    const u = String(url);
    if (u === 'https://velarium.cc/en/watch/movie/550') {
      return response({ text: '<script>window.__REQUEST_TOKEN__ = "TEST_REQ_TOKEN";</script>' });
    }
    if (u === 'https://velarium.cc/api/playback-init') {
      const payload = JSON.parse(options.body || '{}');
      if (payload.pow) {
        return response({ text: JSON.stringify({ success: true, token: 'STREAM_TOKEN_123' }) });
      }
      return response({
        text: JSON.stringify({
          success: true,
          requiresPow: true,
          pow: {
            challengeId: 'pow-test-id',
            challenge: 'test-challenge',
            difficulty: 4
          }
        })
      });
    }
    if (u === 'https://velarium.cc/api/encrypt') {
      const payload = JSON.parse(options.body || '{}');
      const src = payload.data && payload.data.source;
      return response({ text: JSON.stringify({ url: `/api/stream-encrypted?src=${src}` }) });
    }
    if (u.includes('/api/stream-encrypted?src=')) {
      const match = /src=([^&]+)/.exec(u);
      const src = match ? match[1] : 's0';
      return response({
        text: JSON.stringify({
          success: true,
          data: {
            stream_url: `https://source.example.com/playlist/${src}.m3u8`,
            source: src
          }
        })
      });
    }
    return response({ ok: false });
  });

  const streams = await provider.getStreams('550', 'movie', null, null);
  assert.ok(streams.length >= 2);
  assert.ok(streams.every(s => s.name === 'WioCinema • Velarium'));
  assert.ok(streams.every(s => s.provider === 'wiocinema-velarium'));
  assert.ok(streams.every(s => s.format === 'm3u8'));
  assert.ok(streams.some(s => s.quality === 2160));
  assert.ok(streams.some(s => s.title.includes('Lux (4K)')));
  assert.ok(streams.some(s => s.title.includes('Prism (4K)')));
  assert.ok(streams[0].subtitles.some(sub => sub.language === 'tr'));
  assert.ok(streams[0].subtitles.some(sub => sub.language === 'en'));

  // Test TV fallback
  const fallbackProvider = await loadProvider('wiocinema/providers/wiocinema-velarium.js', async () => response({ ok: false }));
  const fallbackStreams = await fallbackProvider.getStreams('1399', 'tv', 1, 1);
  assert.equal(fallbackStreams.length, 2);
  assert.equal(fallbackStreams[0].format, 'm3u8');
  assert.ok(fallbackStreams[0].url.includes('/tv/1399-1-1'));
  assert.equal(fallbackStreams[1].name, 'WioCinema • Lightflix');
  assert.ok(fallbackStreams[1].url.includes('/tv/1399-1-1'));
});



