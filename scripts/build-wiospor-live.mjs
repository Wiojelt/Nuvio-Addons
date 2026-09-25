import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getStreamsForWioChannel } from '../src/addons/wiospor/resolver.mjs';
import { getLegacyStreams } from '../src/addons/wiospor/legacy-sources.mjs';
import { getAslanStreams } from '../src/addons/wiospor/aslan-sources.mjs';
import { ASLAN_SOURCES, WIOSPOR_SOURCE_COUNT } from '../src/addons/wiospor/source-registry.mjs';
import { getBirdirbirStreams, loadBirdirbirChannels, toBirdirbirStreams, birdirbirPanelStats } from '../src/addons/wiospor/birdirbir.mjs';
import { createHash } from 'node:crypto';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outRoot = path.join(root, 'dist-live', 'wiospor');
const previousRoot = process.env.LIVE_PREVIOUS_DIR
  ? path.resolve(root, process.env.LIVE_PREVIOUS_DIR, 'wiospor')
  : null;
const concurrency = Math.max(1, Math.min(8, Number(process.env.WIOSPOR_LIVE_CONCURRENCY || 4)));
const staleMaxMs = Math.max(15 * 60_000, Number(process.env.WIOSPOR_STALE_MAX_MS || 90 * 60_000));

const channels = JSON.parse(await fs.readFile(path.join(root, 'generated/wiospor/channels.json'), 'utf8'));
const birdirbirChannels = await loadBirdirbirChannels();
const birdirbirPanels = birdirbirPanelStats(birdirbirChannels);
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
function birdirbirId(c) { return `birdirbir_${createHash('sha1').update(String(c.id)).digest('hex').slice(0, 20)}`; }
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
function birdirbirMeta(c) {
  return {
    id: birdirbirId(c),
    type: 'tv',
    name: c.name,
    poster: c.logo || undefined,
    posterShape: 'landscape',
    description: c.description || c.category || 'Birdirbir IPTV'
  };
}

function looksPlayable(url) {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return false;
    const value = `${u.pathname}${u.search}`.toLowerCase();
    if (/\.(?:js|css|json|png|jpe?g|gif|svg|webp|woff2?|ttf)(?:$|[?#])/.test(value)) return false;
    return /(?:\.m3u8|\.mpd|\.mp4|\.mkv)(?:$|[?#&])/i.test(value)
      || /(?:live|stream|playlist|manifest|chunklist)\.php(?:$|[?#])/i.test(value)
      || /\/(?:hls|dash|playlist|manifest|chunklist)(?:\/|\.|$)/i.test(value)
      || /(?:^|[?&])format=[^&]*(?:m3u8|mpd)/i.test(value);
  } catch { return false; }
}
function validStreams(streams) {
  if (!Array.isArray(streams)) return [];
  const seen = new Set();
  return streams.filter(stream => {
    const url = String(stream?.url || '');
    const key = `${stream?.name || ''}\0${stream?.title || ''}\0${url}`;
    if (!looksPlayable(url) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

await fs.rm(path.join(root, 'dist-live'), { recursive: true, force: true });
await fs.mkdir(outRoot, { recursive: true });

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
  idPrefixes: ['wiospor_', 'birdirbir_']
};
await writeJson(path.join(outRoot, 'manifest.json'), manifest);
await writeJson(path.join(outRoot, 'catalog', 'tv', 'wiospor-live.json'), { metas: channels.map(metaFor) });
await writeJson(path.join(outRoot, 'catalog', 'tv', 'birdirbir-live.json'), { metas: birdirbirChannels.map(birdirbirMeta) });

for (const channel of channels) {
  await writeJson(path.join(outRoot, 'meta', 'tv', `${liveId(channel)}.json`), { meta: metaFor(channel) });
}
for (const channel of birdirbirChannels) {
  const id = birdirbirId(channel);
  await writeJson(path.join(outRoot, 'meta', 'tv', `${id}.json`), { meta: birdirbirMeta(channel) });
  await writeJson(path.join(outRoot, 'stream', 'tv', `${id}.json`), { streams: validStreams(toBirdirbirStreams(channel)) });
}

const previousState = previousRoot ? await readJson(path.join(previousRoot, 'state.json'), { channels: {} }) : { channels: {} };
const state = {
  generatedAt,
  channelCount: channels.length,
  sourceCount: WIOSPOR_SOURCE_COUNT,
  aslanSourceCount: ASLAN_SOURCES.length,
  birdirbirChannelCount: birdirbirChannels.length,
  birdirbirPanelCount: Object.keys(birdirbirPanels).length,
  birdirbirPanelCounts: birdirbirPanels,
  birdirbirStreamCount: birdirbirChannels.reduce((sum, channel) => sum + (channel.streams?.length || 0), 0),
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
      const results = await Promise.allSettled([
        getStreamsForWioChannel(channel),
        getLegacyStreams(channel),
        getAslanStreams(channel),
        getBirdirbirStreams(channel)
      ]);
      const merged = results.flatMap(result => result.status === 'fulfilled' && Array.isArray(result.value) ? result.value : []);
      streams = validStreams(merged);
      const errors = results.filter(result => result.status === 'rejected').map(result => result.reason?.message || String(result.reason));
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
  sourceCount: state.sourceCount,
  aslanSourceCount: state.aslanSourceCount,
  birdirbirChannelCount: state.birdirbirChannelCount,
  birdirbirPanelCount: state.birdirbirPanelCount,
  birdirbirPanelCounts: state.birdirbirPanelCounts,
  birdirbirStreamCount: state.birdirbirStreamCount,
  sourceCoverage: `${state.sourceCount}/${WIOSPOR_SOURCE_COUNT}`,
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

console.log(`Built GitHub live addon: ${state.channelsWithStreams}/${state.channelCount} Wio channels, ${state.streamCount} Wio streams, ${state.sourceCount}/${WIOSPOR_SOURCE_COUNT} Wio sources; Birdirbir ${state.birdirbirChannelCount} channels / ${state.birdirbirStreamCount} streams / ${state.birdirbirPanelCount} panels.`);
