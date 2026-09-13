import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const root = new URL('../', import.meta.url);
const channelsKt = await fs.readFile(new URL('.upstream-cache/wiospor-public/WioChannels.kt', root), 'utf8');
let specsKt = '';
let sportsProviderKt = '';
try { specsKt = await fs.readFile(new URL('.upstream-cache/turkspor-source/SourceSpec.kt', root), 'utf8'); } catch {}
try { sportsProviderKt = await fs.readFile(new URL('.upstream-cache/turkspor-source/SportsProvider.kt', root), 'utf8'); } catch {}

function sha256(text) { return crypto.createHash('sha256').update(text).digest('hex'); }
function unquoteList(text) { return [...text.matchAll(/"((?:\\.|[^"])*)"/g)].map(m => m[1].replace(/\\"/g, '"')); }

const baseLogo = channelsKt.match(/BASE_LOGO\s*=\s*"([^"]+)"/)?.[1] || 'https://raw.githubusercontent.com/Wiojelt/WioSpor/main/assets/banners/';
const channelRe = /WioChannel\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*([A-Z0-9_]+)\s*,\s*"([^"]+)"\s*,\s*listOf\((.*?)\)\s*,\s*"\$\{BASE_LOGO\}([^"]+)"\s*\)/gs;
const channels = [];
for (const m of channelsKt.matchAll(channelRe)) {
  channels.push({ id: m[1], name: m[2], groupKey: m[3], standardTitle: m[4], aliases: unquoteList(m[5]), logo: baseLogo + m[6] });
}
if (channels.length < 20) throw new Error(`Only ${channels.length} WioSpor channels parsed; upstream WioChannel format may have changed.`);

const groupDefs = {};
for (const m of channelsKt.matchAll(/const val (GROUP_[A-Z0-9_]+)\s*=\s*"([^"]+)"/g)) groupDefs[m[1]] = m[2];
for (const channel of channels) channel.group = groupDefs[channel.groupKey] || channel.groupKey;

const specRe = /SourceSpec\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*listOf\((.*?)\)\s*,\s*Regex\("([^"]*)"\)\s*,\s*listOf\((.*?)\)\s*,\s*SourceMode\.([A-Z]+)(?:\s*,\s*"([^"]*)")?\s*\)/gs;
const sourceSpecs = [];
for (const m of specsKt.matchAll(specRe)) sourceSpecs.push({ key: m[1], name: m[2], roots: unquoteList(m[3]), hostRegex: m[4], markers: unquoteList(m[5]), mode: m[6], catalogPath: m[7] || '' });

if (sportsProviderKt) {
  for (const marker of ['SourceMode.WORDPRESS', 'SourceMode.ROYAL', 'SourceMode.BEYAZ', 'SourceMode.INTER', 'loadLinks']) {
    if (!sportsProviderKt.includes(marker)) throw new Error(`SportsProvider contract changed (missing ${marker}); resolver port requires review.`);
  }
}

await fs.mkdir(new URL('generated/wiospor', root), { recursive: true });
await fs.writeFile(new URL('generated/wiospor/channels.json', root), JSON.stringify(channels, null, 2) + '\n');
await fs.writeFile(new URL('generated/wiospor/source-specs.json', root), JSON.stringify(sourceSpecs, null, 2) + '\n');
await fs.writeFile(new URL('generated/wiospor/source-state.json', root), JSON.stringify({
  generatedAt: new Date().toISOString(),
  sourceSha256: { channels: sha256(channelsKt), sourceSpecs: specsKt ? sha256(specsKt) : null, sportsProvider: sportsProviderKt ? sha256(sportsProviderKt) : null },
  channelCount: channels.length,
  sharedSourceCount: sourceSpecs.length,
  streamResolverStatus: sportsProviderKt ? 'player-parser-ported_domain-resolver-pending' : 'catalog-ready_private-resolver-source-not-synced'
}, null, 2) + '\n');
console.log(`Generated ${channels.length} WioSpor channels and ${sourceSpecs.length} shared source specs.`);
