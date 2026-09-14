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

test('ClipBox provider converts TMDB movie response into playable stream', async () => {
  const calls = [];
  const provider = await loadProvider('providers/wiosinema-clipbox.js', async (url) => {
    calls.push(String(url));
    if (String(url).includes('/api/movie/550')) return response({ json: { src: '/embed/abc' } });
    if (String(url).endsWith('/embed/abc')) {
      return response({ text: `player({file:'https://cdn.example/video.m3u8',token:'tok',expires:'123'})` });
    }
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
    const u = String(url);
    calls.push({ url: u, method: options.method || 'GET', body: options.body || '' });

    if (u === 'https://vidup.to/movie/550') return response({ text: '{"token":"PAGE_ENC"}' });
    if (u.startsWith('https://enc-dec.app/api/enc-vidup?text=')) {
      return response({ text: JSON.stringify({ status: 200, result: { servers: 'https://vidup.to/api/servers', stream: 'https://vidup.to/api/stream', token: 'csrf-token' } }) });
    }
    if (u === 'https://vidup.to/api/servers') return response({ text: 'SERVERS_ENCRYPTED' });
    if (u === 'https://vidup.to/api/stream/a') return response({ text: 'STREAM_A_ENCRYPTED' });
    if (u === 'https://vidup.to/api/stream/b') return response({ text: 'STREAM_B_ENCRYPTED' });
    if (u === 'https://enc-dec.app/api/dec-vidup') {
      const payload = JSON.parse(options.body || '{}');
      if (payload.text === 'SERVERS_ENCRYPTED') {
        return response({ text: JSON.stringify({ status: 200, result: [{ name: 'A', data: 'a' }, { name: 'B', data: 'b' }] }) });
      }
      if (payload.text === 'STREAM_A_ENCRYPTED') {
        return response({ text: JSON.stringify({ status: 200, result: { url: 'https://cdn.example/a.m3u8', tracks: [] } }) });
      }
      if (payload.text === 'STREAM_B_ENCRYPTED') {
        return response({ text: JSON.stringify({ status: 200, result: { url: 'https://cdn.example/b.mp4', tracks: [] } }) });
      }
    }
    return response({ ok: false });
  });

  const streams = await provider.getStreams(550, 'movie', null, null);
  assert.equal(streams.length, 2);
  assert.deepEqual(Array.from(streams, x => x.url).sort(), ['https://cdn.example/a.m3u8', 'https://cdn.example/b.mp4']);
  assert.equal(streams.find(x => x.url.endsWith('.m3u8')).format, 'm3u8');
  assert.equal(streams.find(x => x.url.endsWith('.mp4')).format, 'video');
  assert.ok(calls.some(c => c.url === 'https://vidup.to/api/servers' && c.method === 'POST'));
  assert.ok(calls.some(c => c.url === 'https://enc-dec.app/api/dec-vidup' && c.method === 'POST'));
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
