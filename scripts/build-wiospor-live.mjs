import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getStreamsForWioChannel } from '../src/addons/wiospor/resolver.mjs';
import { getLegacyStreams } from '../src/addons/wiospor/legacy-sources.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outRoot = path.join(root, 'dist-live', 'wiospor');
const previousRoot = process.env.LIVE_PREVIOUS_DIR
  ? path.resolve(root, process.env.LIVE_PREVIOUS_DIR, 'wiospor')
  : null;
const concurrency = Math.max(1, Math.min(8, Number(process.env.WIOSPOR_LIVE_CONCURRENCY || 4)));
const staleMaxMs = Math.max(15 * 60_000, Number(process.env.WIOSPOR_STALE_MAX_MS || 90 * 60_000));

const channels = JSON.parse(await fs.readFile(path.join(root, 'generated/wiospor/channels.json'), 'utf8'));
const generatedAt = new Date().toISOString();
const now = Date.now();

async function readJson(file, fallback = null) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; }
}
async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
}
function liveId(c) { return `wiospor_${c.id}`; }
function metaFor(c) {
  return {
    id: liveId(c),
    type: 'tv',
    name: c.name,
    poster: c.logo,
    posterShape: 'landscape',
    description: c.standardTitle || c.group
  };
}
function validStreams(streams) {
  if (!Array.isArray(streams)) return [];
  const seen = new Set();
  return streams.filter(stream => {
    const url = String(stream?.url || '');
    if (!/^https?:\/\//i.test(url) || seen.has(url)) return false;
    seen.add(url);
    return true;
  });
}

await fs.rm(path.join(root, 'dist-live'), { recursive: true, force: true });
await fs.mkdir(outRoot, { recursive: true });

const manifest = {
  id: 'community.wiojelt.wiospor',
  version: '0.4.0',
  name: 'WioSpor',
  description: 'WioSpor canlı kanal kataloğu.',
  resources: ['catalog', 'meta', 'stream'],
  types: ['tv'],
  catalogs: [{ type: 'tv', id: 'wiospor-live', name: 'WioSpor Canlı' }],
  idPrefixes: ['wiospor_']
};
await writeJson(path.join(outRoot, 'manifest.json'), manifest);
await writeJson(path.join(outRoot, 'catalog', 'tv', 'wiospor-live.json'), { metas: channels.map(metaFor) });

for (const channel of channels) {
  await writeJson(path.join(outRoot, 'meta', 'tv', `${liveId(channel)}.json`), { meta: metaFor(channel) });
}

const previousState = previousRoot ? await readJson(path.join(previousRoot, 'state.json'), { channels: {} }) : { channels: {} };
const state = {
  generatedAt,
  channelCount: channels.length,
  channelsWithStreams: 0,
  freshChannels: 0,
  staleFallbackChannels: 0,
  streamCount: 0,
  channels: {}
};

let cursor = 0;
async function worker() {
  while (true) {
    const index = cursor++;
    if (index >= channels.length) return;
    const channel = channels[index];
    const fileName = `${liveId(channel)}.json`;
    const file = path.join(outRoot, 'stream', 'tv', fileName);
    let streams = [];
    let source = 'fresh';
    let lastSuccess = null;
    let error = null;

    try {
      const [shared, legacy] = await Promise.allSettled([
        getStreamsForWioChannel(channel),
        getLegacyStreams(channel)
      ]);
      const merged = [
        ...(shared.status === 'fulfilled' ? shared.value : []),
        ...(legacy.status === 'fulfilled' ? legacy.value : [])
      ];
      streams = validStreams(merged).slice(0, 48);
      const errors = [shared, legacy].filter(x => x.status === 'rejected').map(x => x.reason?.message || String(x.reason));
      if (errors.length) error = errors.join(' | ');
    } catch (err) {
      error = err?.message || String(err);
    }

    if (streams.length) {
      lastSuccess = generatedAt;
      state.freshChannels += 1;
    } else if (previousRoot) {
      const prevMeta = previousState?.channels?.[channel.id];
      const prevTime = Date.parse(prevMeta?.lastSuccess || '');
      if (Number.isFinite(prevTime) && now - prevTime <= staleMaxMs) {
        const prev = await readJson(path.join(previousRoot, 'stream', 'tv', fileName), null);
        const prevStreams = validStreams(prev?.streams);
        if (prevStreams.length) {
          streams = prevStreams;
          source = 'stale-fallback';
          lastSuccess = prevMeta.lastSuccess;
          state.staleFallbackChannels += 1;
        }
      }
    }

    if (streams.length) {
      state.channelsWithStreams += 1;
      state.streamCount += streams.length;
    }
    state.channels[channel.id] = {
      resourceId: liveId(channel),
      streamCount: streams.length,
      source,
      lastSuccess,
      error
    };
    await writeJson(file, { streams });
    process.stdout.write(`[${index + 1}/${channels.length}] ${channel.id}: ${streams.length} stream${source === 'stale-fallback' ? ' (stale fallback)' : ''}\n`);
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));
await writeJson(path.join(outRoot, 'health.json'), {
  ok: state.channelsWithStreams > 0,
  generatedAt,
  channelCount: state.channelCount,
  channelsWithStreams: state.channelsWithStreams,
  freshChannels: state.freshChannels,
  staleFallbackChannels: state.staleFallbackChannels,
  streamCount: state.streamCount,
  hosting: 'github-raw-live-branch'
});
await writeJson(path.join(outRoot, 'state.json'), state);

if (state.channelsWithStreams < Number(process.env.MIN_LIVE_STREAM_CHANNELS || 1)) {
  throw new Error(`Refusing to publish: only ${state.channelsWithStreams} WioSpor channels have streams.`);
}

console.log(`Built GitHub live addon: ${state.channelsWithStreams}/${state.channelCount} channels, ${state.streamCount} streams (${state.freshChannels} fresh, ${state.staleFallbackChannels} fallback).`);
