import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

async function loadProvider(relativePath, fetchImpl) {
  const code = await fs.readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
  const module = { exports: {} };
  const context = vm.createContext({
    module,
    exports: module.exports,
    fetch: fetchImpl,
    console,
    Promise,
    String,
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

test('WioCinema uses the Nuvio scraper repository manifest schema with 7 native providers', async () => {
  const manifest = JSON.parse(await fs.readFile(new URL('../wiocinema/manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.name, 'WioCinema');
  assert.ok(Array.isArray(manifest.scrapers));
  assert.equal(manifest.scrapers.length, 7);

  const expectedProviders = [
    'wiocinema-clipbox',
    'wiocinema-cinestream',
    'wiocinema-mapple',
    'wiocinema-bingebang',
    'wiocinema-cinecat',
    'wiocinema-flixnetwork',
    'wiocinema-watch2movies'
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
    if (u.includes('/api/movie/550')) return response({ json: { src: '/embed/map' } });
    if (u.endsWith('/embed/map')) return response({ text: `player({file:'https://cdn.example/mapple.m3u8',token:'tok',expires:'exp'})` });
    return response({ ok: false });
  });
  const streams = await provider.getStreams('550', 'movie', null, null);
  assert.ok(streams.length >= 1);
  assert.ok(streams.some(s => s.name === 'WioCinema • Mapple'));
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
