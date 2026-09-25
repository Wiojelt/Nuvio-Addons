/* SPDX-License-Identifier: GPL-3.0-only */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { getStreamsForWioChannel } from './resolver.mjs';
import { getLegacyStreams } from './legacy-sources.mjs';
import { getAslanStreams } from './aslan-sources.mjs';
import { getBirdirbirStreams, toBirdirbirStreams } from './birdirbir.mjs';
import { WIOSPOR_SOURCE_COUNT } from './source-registry.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const channelsPath = path.join(repoRoot, 'generated/wiospor/channels.json');
const birdirbirPath = path.join(repoRoot, 'generated/birdirbir/channels.json');

let channelCache = null;
let birdirbirCache = null;
function channels() {
  if (channelCache) return channelCache;
  try { channelCache = JSON.parse(fs.readFileSync(channelsPath, 'utf8')); }
  catch { channelCache = []; }
  return channelCache;
}
function birdirbirChannels() {
  if (birdirbirCache) return birdirbirCache;
  try { birdirbirCache = JSON.parse(fs.readFileSync(birdirbirPath, 'utf8')); }
  catch { birdirbirCache = []; }
  return birdirbirCache;
}

const manifest = {
  id: 'community.wiojelt.wiospor',
  version: '0.6.0',
  name: 'WioSpor',
  description: 'WioSpor canlı kanal kataloğu.',
  resources: ['catalog', 'meta', 'stream'],
  types: ['tv'],
  catalogs: [
    { type: 'tv', id: 'wiospor-live', name: 'WioSpor Canlı' },
    { type: 'tv', id: 'birdirbir-live', name: 'Birdirbir IPTV' }
  ],
  idPrefixes: ['wiospor:', 'birdirbir:']
};

function json(body, status = 200) {
  return { status, headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' }, body: JSON.stringify(body) };
}

function findChannel(id) {
  const raw = id.startsWith('wiospor:') ? id.slice('wiospor:'.length) : id;
  return channels().find(c => c.id === raw) || null;
}
function birdirbirKey(c) {
  return createHash('sha1').update(String(c.id)).digest('hex').slice(0, 20);
}
function findBirdirbir(id) {
  const raw = id.startsWith('birdirbir:') ? id.slice('birdirbir:'.length) : id;
  return birdirbirChannels().find(c => birdirbirKey(c) === raw) || null;
}
function metaFor(c) {
  return { id: `wiospor:${c.id}`, type: 'tv', name: c.name, poster: c.logo, posterShape: 'landscape', description: c.standardTitle || c.group };
}
function birdirbirMeta(c) {
  return { id: `birdirbir:${birdirbirKey(c)}`, type: 'tv', name: c.name, poster: c.logo || undefined, posterShape: 'landscape', description: c.description || c.category || 'Birdirbir IPTV' };
}
function dedupe(streams) {
  const seen = new Set();
  return streams.filter(stream => {
    const key = `${stream?.name || ''}\0${stream?.title || ''}\0${stream?.url || ''}`;
    if (!stream?.url || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function handleRequest(urlString) {
  const url = new URL(urlString, 'https://local.invalid');
  let pathname = url.pathname;
  try { pathname = decodeURIComponent(pathname); } catch {}
  const p = pathname.replace(/\/+$/, '');

  if (p === '' || p === '/manifest.json') return json(manifest);
  if (p === '/health.json') return json({
    ok: true,
    channelCount: channels().length,
    birdirbirChannelCount: birdirbirChannels().length,
    sourceCount: WIOSPOR_SOURCE_COUNT,
    resolver: 'full-resolver-ready'
  });
  if (p === '/catalog/tv/wiospor-live.json') return json({ metas: channels().map(metaFor) });
  if (p === '/catalog/tv/birdirbir-live.json') return json({ metas: birdirbirChannels().map(birdirbirMeta) });

  const metaMatch = p.match(/^\/meta\/tv\/(wiospor:[^/]+)\.json$/);
  if (metaMatch) {
    const c = findChannel(metaMatch[1]);
    return c ? json({ meta: metaFor(c) }) : json({ meta: null }, 404);
  }
  const birdMetaMatch = p.match(/^\/meta\/tv\/(birdirbir:[^/]+)\.json$/);
  if (birdMetaMatch) {
    const c = findBirdirbir(birdMetaMatch[1]);
    return c ? json({ meta: birdirbirMeta(c) }) : json({ meta: null }, 404);
  }

  const streamMatch = p.match(/^\/stream\/tv\/(wiospor:[^/]+)\.json$/);
  if (streamMatch) {
    const c = findChannel(streamMatch[1]);
    if (!c) return json({ streams: [] }, 404);
    try {
      const results = await Promise.allSettled([
        getStreamsForWioChannel(c),
        getLegacyStreams(c),
        getAslanStreams(c),
        getBirdirbirStreams(c)
      ]);
      return json({ streams: dedupe(results.flatMap(result => result.status === 'fulfilled' && Array.isArray(result.value) ? result.value : [])) });
    } catch (error) {
      console.error('[WioSpor resolver]', error);
      return json({ streams: [] });
    }
  }
  const birdStreamMatch = p.match(/^\/stream\/tv\/(birdirbir:[^/]+)\.json$/);
  if (birdStreamMatch) {
    const c = findBirdirbir(birdStreamMatch[1]);
    return c ? json({ streams: toBirdirbirStreams(c) }) : json({ streams: [] }, 404);
  }

  return json({ error: 'not_found' }, 404);
}
