/* SPDX-License-Identifier: GPL-3.0-only */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const channelsPath = path.join(repoRoot, 'generated/wiospor/channels.json');

let channelCache = null;
function channels() {
  if (channelCache) return channelCache;
  try { channelCache = JSON.parse(fs.readFileSync(channelsPath, 'utf8')); }
  catch { channelCache = []; }
  return channelCache;
}

const manifest = {
  id: 'community.wiojelt.wiospor',
  version: '0.1.0',
  name: 'WioSpor',
  description: 'WioSpor canlı kanal kataloğunun Nuvio/Stremio addon uyarlaması.',
  resources: ['catalog', 'meta', 'stream'],
  types: ['tv'],
  catalogs: [{ type: 'tv', id: 'wiospor-live', name: 'WioSpor Canlı' }],
  idPrefixes: ['wiospor:']
};

function json(body, status = 200) {
  return { status, headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' }, body: JSON.stringify(body) };
}

function findChannel(id) {
  const raw = id.startsWith('wiospor:') ? id.slice('wiospor:'.length) : id;
  return channels().find(c => c.id === raw) || null;
}

function metaFor(c) {
  return { id: `wiospor:${c.id}`, type: 'tv', name: c.name, poster: c.logo, posterShape: 'landscape', description: c.standardTitle || c.group };
}

export async function handleRequest(urlString) {
  const url = new URL(urlString, 'https://local.invalid');
  const p = url.pathname.replace(/\/+$/, '');

  if (p === '' || p === '/manifest.json') return json(manifest);
  if (p === '/health.json') return json({ ok: true, channelCount: channels().length, resolver: 'player-parser-ported_domain-resolver-pending' });
  if (p === '/catalog/tv/wiospor-live.json') return json({ metas: channels().map(metaFor) });

  const metaMatch = p.match(/^\/meta\/tv\/(wiospor:[^/]+)\.json$/);
  if (metaMatch) {
    const c = findChannel(decodeURIComponent(metaMatch[1]));
    return c ? json({ meta: metaFor(c) }) : json({ meta: null }, 404);
  }

  const streamMatch = p.match(/^\/stream\/tv\/(wiospor:[^/]+)\.json$/);
  if (streamMatch) {
    const c = findChannel(decodeURIComponent(streamMatch[1]));
    if (!c) return json({ streams: [] }, 404);
    return json({ streams: [] });
  }

  return json({ error: 'not_found' }, 404);
}
