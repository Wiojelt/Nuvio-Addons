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

test('WioCinema uses the Nuvio scraper repository manifest schema', async () => {
  const manifest = JSON.parse(await fs.readFile(new URL('../wiocinema/manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.name, 'WioCinema');
  assert.ok(Array.isArray(manifest.scrapers));
  assert.equal(manifest.scrapers.length, 6);
  for (const scraper of manifest.scrapers) {
    assert.ok(scraper.id.startsWith('wiocinema-'));
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

test('WioCinema Vidup provider extracts streams with WioCinema branding', async () => {
  const provider = await loadProvider('wiocinema/providers/wiocinema-vidup.js', async (url, options = {}) => {
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
    return response({ ok: false });
  });
  const streams = await provider.getStreams(603, 'movie', null, null);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].name, 'WioCinema • Vidup');
  assert.equal(streams[0].provider, 'wiocinema-vidup');
  assert.equal(streams[0].url, 'https://cdn.example/matrix.m3u8');
});

test('WioCinema Hexa provider extracts streams with WioCinema branding', async () => {
  const provider = await loadProvider('wiocinema/providers/wiocinema-hexa.js', async (url, options = {}) => {
    const u = String(url);
    if (u === 'https://enc-dec.app/api/enc-hexa') return response({ text: JSON.stringify({ result: { token: 'cap-tok' } }) });
    if (u === 'https://theemoviedb.hexa.su/api/tmdb/movie/603/images') return response({ text: 'HEXA_RAW' });
    if (u === 'https://enc-dec.app/api/dec-hexa') return response({ text: JSON.stringify({ result: { sources: [{ server: 'Fast', url: 'https://cdn.example/hexa-stream.m3u8' }] } }) });
    return response({ ok: false });
  });
  const streams = await provider.getStreams(603, 'movie', null, null);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].name, 'WioCinema • Hexa');
  assert.equal(streams[0].provider, 'wiocinema-hexa');
  assert.equal(streams[0].url, 'https://cdn.example/hexa-stream.m3u8');
});

test('WioCinema VidFastPro provider extracts streams with WioCinema branding', async () => {
  const provider = await loadProvider('wiocinema/providers/wiocinema-vidfastpro.js', async (url, options = {}) => {
    const u = String(url);
    if (u === 'https://vidfast.vc/movie/603/') return response({ text: '{"token":"PAGE"}' });
    if (u.startsWith('https://enc-dec.app/api/enc-vidfast?text=')) return response({ text: JSON.stringify({ result: { servers: 'https://vidfast.vc/api/servers', stream: 'https://vidfast.vc/api/stream', token: 'csrf' } }) });
    if (u === 'https://vidfast.vc/api/servers') return response({ text: 'SERVERS' });
    if (u === 'https://vidfast.vc/api/stream/a') return response({ text: 'STREAM' });
    if (u === 'https://enc-dec.app/api/dec-vidfast') {
      const payload = JSON.parse(options.body || '{}');
      if (payload.text === 'SERVERS') return response({ text: JSON.stringify({ result: [{ name: 'A', description: '4K', data: 'a' }] }) });
      if (payload.text === 'STREAM') return response({ text: JSON.stringify({ result: { url: 'https://cdn.example/vidfast.m3u8', is4kAvailable: true } }) });
    }
    return response({ ok: false });
  });
  const streams = await provider.getStreams(603, 'movie', null, null);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].name, 'WioCinema • VidFastPro');
  assert.equal(streams[0].provider, 'wiocinema-vidfastpro');
  assert.equal(streams[0].quality, 2160);
});

test('WioCinema Xpass provider parses backup sources', async () => {
  const provider = await loadProvider('wiocinema/providers/wiocinema-xpass.js', async (url) => {
    const u = String(url);
    if (u === 'https://play.xpass.top/e/movie/603') return response({ text: '<html>var backups = [{"name":"Server1","url":"/api/source1"}];</html>' });
    if (u === 'https://play.xpass.top/api/source1') return response({ text: JSON.stringify({ playlist: [{ sources: [{ file: 'https://cdn.example/xpass.mp4', type: 'mp4' }] }] }) });
    return response({ ok: false });
  });
  const streams = await provider.getStreams(603, 'movie', null, null);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].name, 'WioCinema • Xpass');
  assert.equal(streams[0].provider, 'wiocinema-xpass');
  assert.equal(streams[0].url, 'https://cdn.example/xpass.mp4');
  assert.equal(streams[0].format, 'video');
});
