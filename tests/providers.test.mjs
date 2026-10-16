import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import crypto from 'node:crypto';

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
    clearTimeout,
    Buffer,
    atob: (s) => Buffer.from(s, 'base64').toString('utf8'),
    btoa: (s) => Buffer.from(s, 'utf8').toString('base64'),
    require: (name) => {
      if (name === 'crypto') return crypto;
      throw new Error(`Cannot require ${name}`);
    }
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

test('WioSinema uses the current Nuvio scraper repository manifest schema', async () => {
  const manifest = JSON.parse(await fs.readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.name, 'WioSinema');
  assert.ok(Array.isArray(manifest.scrapers));
  assert.ok(manifest.scrapers.length >= 5);
  for (const scraper of manifest.scrapers) {
    assert.ok(scraper.id);
    assert.ok(scraper.filename);
    assert.equal(typeof scraper.enabled, 'boolean');
    await fs.access(new URL(`../${scraper.filename}`, import.meta.url));
  }
});

test('ClipBox provider converts TMDB movie response into playable stream', async () => {
  const calls = [];
  const provider = await loadProvider('providers/wiosinema-clipbox.js', async (url) => {
    calls.push(String(url));
    if (String(url).includes('/api/movie/550')) return response({ json: { src: '/embed/abc' } });
    if (String(url).endsWith('/embed/abc')) return response({ text: `player({file:'https://cdn.example/video.m3u8',token:'tok',expires:'123'})` });
    return response({ ok: false });
  });
  const streams = await provider.getStreams('550', 'movie', null, null);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].quality, 1080);
  assert.equal(streams[0].format, 'm3u8');
  assert.equal(streams[0].url, 'https://cdn.example/video.m3u8?token=tok&expires=123&h=1');
  assert.ok(calls[0].includes('/api/movie/550'));
});

test('ClipBox provider uses TV season/episode route', async () => {
  let firstUrl = '';
  const provider = await loadProvider('providers/wiosinema-clipbox.js', async (url) => {
    if (!firstUrl) firstUrl = String(url);
    return response({ ok: false });
  });
  const streams = await provider.getStreams('1399', 'tv', 2, 3);
  assert.deepEqual(Array.from(streams), []);
  assert.ok(firstUrl.includes('/api/tv/1399/2/3'));
});

test('Vidup provider follows upstream decrypt flow and emits unique streams', async () => {
  const calls = [];
  const provider = await loadProvider('providers/wiosinema-vidup.js', async (url, options = {}) => {
    const u = String(url); calls.push({ url: u, method: options.method || 'GET', body: options.body || '' });
    if (u === 'https://vidup.to/movie/550') return response({ text: '{"token":"PAGE_ENC"}' });
    if (u.startsWith('https://enc-dec.app/api/enc-vidup?text=')) return response({ text: JSON.stringify({ status: 200, result: { servers: 'https://vidup.to/api/servers', stream: 'https://vidup.to/api/stream', token: 'csrf-token' } }) });
    if (u === 'https://vidup.to/api/servers') return response({ text: 'SERVERS_ENCRYPTED' });
    if (u === 'https://vidup.to/api/stream/a') return response({ text: 'STREAM_A_ENCRYPTED' });
    if (u === 'https://vidup.to/api/stream/b') return response({ text: 'STREAM_B_ENCRYPTED' });
    if (u === 'https://enc-dec.app/api/dec-vidup') {
      const payload = JSON.parse(options.body || '{}');
      if (payload.text === 'SERVERS_ENCRYPTED') return response({ text: JSON.stringify({ status: 200, result: [{ name: 'A', data: 'a' }, { name: 'B', data: 'b' }] }) });
      if (payload.text === 'STREAM_A_ENCRYPTED') return response({ text: JSON.stringify({ status: 200, result: { url: 'https://cdn.example/a.m3u8', tracks: [] } }) });
      if (payload.text === 'STREAM_B_ENCRYPTED') return response({ text: JSON.stringify({ status: 200, result: { url: 'https://cdn.example/b.mp4', tracks: [] } }) });
    }
    return response({ ok: false });
  });
  const streams = await provider.getStreams(550, 'movie', null, null);
  assert.equal(streams.length, 2);
  assert.deepEqual(Array.from(streams, x => x.url).sort(), ['https://cdn.example/a.m3u8', 'https://cdn.example/b.mp4']);
  assert.equal(streams.find(x => x.url.endsWith('.m3u8')).format, 'm3u8');
  assert.equal(streams.find(x => x.url.endsWith('.mp4')).format, 'video');
  assert.ok(calls.some(c => c.url === 'https://vidup.to/api/servers' && c.method === 'POST'));
});

test('Vidup provider uses TV TMDB route', async () => {
  let firstUrl = '';
  const provider = await loadProvider('providers/wiosinema-vidup.js', async (url) => {
    if (!firstUrl) firstUrl = String(url);
    return response({ ok: false });
  });
  const streams = await provider.getStreams('1399', 'tv', 4, 8);
  assert.deepEqual(Array.from(streams), []);
  assert.equal(firstUrl, 'https://vidup.to/tv/1399/4/8');
});

test('Hexa provider follows cap-token decrypt flow', async () => {
  const calls = [];
  const provider = await loadProvider('providers/wiosinema-hexa.js', async (url, options = {}) => {
    const u = String(url); calls.push({ url: u, options });
    if (u === 'https://enc-dec.app/api/enc-hexa') return response({ text: JSON.stringify({ result: { token: 'cap-token' } }) });
    if (u === 'https://theemoviedb.hexa.su/api/tmdb/movie/550/images') return response({ text: 'HEXA_ENCRYPTED' });
    if (u === 'https://enc-dec.app/api/dec-hexa') return response({ text: JSON.stringify({ result: { sources: [{ server: 'One', url: 'https://cdn.example/hexa.m3u8' }] } }) });
    return response({ ok: false });
  });
  const streams = await provider.getStreams(550, 'movie', null, null);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, 'https://cdn.example/hexa.m3u8');
  const hexa = calls.find(c => c.url.includes('/api/tmdb/movie/550/images'));
  assert.equal(hexa.options.headers['X-Cap-Token'], 'cap-token');
  assert.ok(hexa.options.headers['X-Api-Key']);
});

test('VidFastPro provider follows upstream HTTP decrypt flow', async () => {
  const provider = await loadProvider('providers/wiosinema-vidfastpro.js', async (url, options = {}) => {
    const u = String(url);
    if (u === 'https://vidfast.vc/movie/550/') return response({ text: '{"token":"PAGE"}' });
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
  const streams = await provider.getStreams(550, 'movie', null, null);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].quality, 2160);
  assert.equal(streams[0].url, 'https://cdn.example/vidfast.m3u8');
});

test('Vidcore provider follows upstream HTTP decrypt flow', async () => {
  const provider = await loadProvider('providers/wiosinema-vidcore.js', async (url, options = {}) => {
    const u = String(url);
    if (u === 'https://vidcore.io/tv/1399/2/3') return response({ text: '{"token":"PAGE"}' });
    if (u.startsWith('https://enc-dec.app/api/enc-vidcore?text=')) return response({ text: JSON.stringify({ result: { servers: 'https://vidcore.io/api/servers', stream: 'https://vidcore.io/api/stream', token: 'csrf' } }) });
    if (u === 'https://vidcore.io/api/servers') return response({ text: 'SERVERS' });
    if (u === 'https://vidcore.io/api/stream/a') return response({ text: 'STREAM' });
    if (u === 'https://enc-dec.app/api/dec-vidcore') {
      const payload = JSON.parse(options.body || '{}');
      if (payload.text === 'SERVERS') return response({ text: JSON.stringify({ result: [{ name: 'A', data: 'a' }] }) });
      if (payload.text === 'STREAM') return response({ text: JSON.stringify({ result: { url: 'https://cdn.example/vidcore.m3u8', tracks: [] } }) });
    }
    return response({ ok: false });
  });
  const streams = await provider.getStreams(1399, 'tv', 2, 3);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, 'https://cdn.example/vidcore.m3u8');
});

test('FilmModu provider searches and decrypts Vidmixi player to extract HLS stream', async () => {
  // Helper to make AES OpenSSL encrypted JSON payload
  function makeVidmixiPayload(videoLocation, title, password) {
    const salt = crypto.randomBytes(8);
    const pass = Buffer.from(password, 'utf8');
    let d = Buffer.alloc(0);
    let dI = Buffer.alloc(0);
    while (d.length < 48) {
      const h = crypto.createHash('md5');
      h.update(dI);
      h.update(pass);
      h.update(salt);
      dI = h.digest();
      d = Buffer.concat([d, dI]);
    }
    const key = d.subarray(0, 32);
    const iv = d.subarray(32, 48);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    const ct = Buffer.concat([cipher.update(JSON.stringify({ video_location: videoLocation, title })), cipher.final()]);
    return JSON.stringify({ ct: ct.toString('base64'), s: salt.toString('hex') });
  }

  const pass = 'mock-password-123';
  const vidmixiJson = makeVidmixiPayload('https://cdn.example/filmmodu.m3u8', 'Fight Club', pass);
  const ilkpartIframe = `<iframe src="https://vidmixi.com/embed/mock-vidmixi"></iframe>`;
  const ilkpartBase64 = Buffer.from(ilkpartIframe).toString('base64');

  const provider = await loadProvider('providers/wiosinema-filmmodu.js', async (url, options = {}) => {
    const u = String(url);
    if (u.includes('/movie/550')) {
      return response({ json: { imdb_id: 'tt0137523', title: 'Fight Club' } });
    }
    if (u === 'https://filmmodu.cc/arama/') {
      return response({ text: '<a class="search_s" href="https://filmmodu.cc/film/fight-club-izle/">Fight Club</a>' });
    }
    if (u === 'https://filmmodu.cc/film/fight-club-izle/') {
      return response({ text: `var ilkpartkod = '${ilkpartBase64}';` });
    }
    if (u === 'https://vidmixi.com/embed/mock-vidmixi') {
      return response({ text: `bePlayer('${pass}', '${vidmixiJson}')` });
    }
    return response({ ok: false });
  });

  const streams = await provider.getStreams(550, 'movie', null, null);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].provider, 'wiosinema-filmmodu');
  assert.equal(streams[0].format, 'm3u8');
  assert.equal(streams[0].url, 'https://cdn.example/filmmodu.m3u8');
  assert.equal(streams[0].quality, 1080);
});

test('DiziMom provider searches and extracts HLS stream for TV series', async () => {
  const provider = await loadProvider('providers/wiosinema-dizimom.js', async (url, options = {}) => {
    const u = String(url);
    if (u.includes('/tv/1399')) {
      return response({ json: { name: 'Game of Thrones' } });
    }
    if (u.startsWith('https://ddizimom.net/ara?q=')) {
      return response({ text: '<a href="https://ddizimom.net/dizi/game-of-thrones">Game of Thrones</a>' });
    }
    if (u === 'https://ddizimom.net/dizi/game-of-thrones/sezon-1/bolum-1') {
      return response({ text: '<div data-pv="slug-got-s1e1"></div>' });
    }
    if (u.startsWith('https://play2.pilavyerplay.top/assets/js/s.php?s=slug-got-s1e1')) {
      return response({ text: 'window.__PLAYER__ = {"stream":"https://cdn.example/got-s1e1.m3u8"};' });
    }
    return response({ ok: false });
  });

  const streams = await provider.getStreams(1399, 'tv', 1, 1);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].provider, 'wiosinema-dizimom');
  assert.equal(streams[0].format, 'm3u8');
  assert.equal(streams[0].url, 'https://cdn.example/got-s1e1.m3u8');
});

test('SetFilmIzle provider queries admin-ajax to extract playable stream', async () => {
  const provider = await loadProvider('providers/wiosinema-setfilmizle.js', async (url, options = {}) => {
    const u = String(url);
    if (u.includes('/movie/550')) {
      return response({ json: { title: 'Fight Club' } });
    }
    if (u.startsWith('https://www.setfilmizle.ltd/?s=')) {
      return response({ text: '<a href="https://www.setfilmizle.ltd/film/fight-club/"><article class="card"></article></a>' });
    }
    if (u === 'https://www.setfilmizle.ltd/film/fight-club/') {
      return response({ text: 'nonces: { video: "video-nonce-123" }; class="post-12307"; data-player-name="SetPlay"' });
    }
    if (u === 'https://www.setfilmizle.ltd/wp-admin/admin-ajax.php') {
      return response({ text: JSON.stringify({ success: true, data: { stream: { url: 'https://setplay.shop/player/stfplay.php?v=1', provider: 'setplay' } } }) });
    }
    return response({ ok: false });
  });

  const streams = await provider.getStreams(550, 'movie', null, null);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].provider, 'wiosinema-setfilmizle');
  assert.equal(streams[0].url, 'https://setplay.shop/player/stfplay.php?v=1');
  assert.equal(streams[0].format, 'video');
});

test('FilmMakinesi provider searches and extracts iframe stream', async () => {
  const provider = await loadProvider('providers/wiosinema-filmmakinesi.js', async (url, options = {}) => {
    const u = String(url);
    if (u.includes('/movie/550')) {
      return response({ json: { title: 'Fight Club' } });
    }
    if (u.startsWith('https://filmmakinesi.co/?s=')) {
      return response({ text: '<a class="mini-poster" href="https://filmmakinesi.co/fight-club/">Fight Club</a>' });
    }
    if (u === 'https://filmmakinesi.co/fight-club/') {
      return response({ text: '<iframe src="https://oynatloload.top/embed/12345"></iframe>' });
    }
    return response({ ok: false });
  });

  const streams = await provider.getStreams(550, 'movie', null, null);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].provider, 'wiosinema-filmmakinesi');
  assert.equal(streams[0].url, 'https://oynatloload.top/embed/12345');
  assert.equal(streams[0].format, 'video');
});

