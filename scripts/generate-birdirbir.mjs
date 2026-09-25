import fs from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import crypto from 'node:crypto';

const root = new URL('../', import.meta.url);
const snapshotUrl = new URL('config/birdirbir-channel-db.b64', root);
const upstreamUrl = new URL('.upstream-cache/turksinema-source/WioIPTVPanelsChannelDatabase.kt', root);

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function extractPayload(source) {
  const block = source.match(/private val CHUNKS\s*=\s*arrayOf\(([\s\S]*?)\n\s*\)\n/)?.[1];
  if (!block) return '';
  return [...block.matchAll(/"([A-Za-z0-9+/=]+)"/g)].map(match => match[1]).join('');
}
async function readOptional(url) { try { return await fs.readFile(url, 'utf8'); } catch { return ''; } }

let payload = (await readOptional(snapshotUrl)).trim();
let origin = 'committed-snapshot';
const upstream = await readOptional(upstreamUrl);
if (upstream) {
  const fresh = extractPayload(upstream);
  if (!fresh || fresh.length < 10000) throw new Error('WioIPTVPanels ChannelDatabase payload format changed');
  payload = fresh;
  origin = 'private-upstream';
  await fs.writeFile(snapshotUrl, payload + '\n', 'utf8');
}
if (!payload) throw new Error('Birdirbir/WioIPTVPanels database snapshot is missing');

let decoded;
try {
  decoded = JSON.parse(gunzipSync(Buffer.from(payload, 'base64')).toString('utf8'));
} catch (error) {
  throw new Error(`Birdirbir database decode failed: ${error.message}`);
}

const categories = Array.isArray(decoded?.categories) ? decoded.categories : [];
const channels = Array.isArray(decoded?.channels) ? decoded.channels : [];
if (categories.length < 2 || channels.length < 50) throw new Error(`Birdirbir database is unexpectedly small: ${categories.length} categories, ${channels.length} channels`);

let streamCount = 0;
const panelCounts = {};
const categoryCounts = {};
for (const channel of channels) {
  if (!channel?.id || !channel?.name || !Array.isArray(channel?.streams)) throw new Error('Birdirbir channel shape changed');
  categoryCounts[channel.category || 'unknown'] = (categoryCounts[channel.category || 'unknown'] || 0) + 1;
  for (const source of channel.streams) {
    streamCount += 1;
    const panel = String(source?.panel || 'Unknown');
    panelCounts[panel] = (panelCounts[panel] || 0) + 1;
  }
}
if (streamCount < 100) throw new Error(`Birdirbir database has too few streams: ${streamCount}`);

const out = new URL('generated/birdirbir/', root);
await fs.mkdir(out, { recursive: true });
await fs.writeFile(new URL('categories.json', out), JSON.stringify(categories, null, 2) + '\n');
await fs.writeFile(new URL('channels.json', out), JSON.stringify(channels, null, 2) + '\n');
await fs.writeFile(new URL('state.json', out), JSON.stringify({
  generatedAt: new Date().toISOString(),
  origin,
  sourceModule: 'WioIPTVPanels/ChannelDatabase.kt',
  snapshotSha256: sha256(payload),
  categoryCount: categories.length,
  channelCount: channels.length,
  streamCount,
  panelCount: Object.keys(panelCounts).length,
  panelCounts,
  categoryCounts
}, null, 2) + '\n');
console.log(`Generated Birdirbir IPTV snapshot: ${channels.length} channels, ${streamCount} streams, ${Object.keys(panelCounts).length} panels (${origin}).`);
