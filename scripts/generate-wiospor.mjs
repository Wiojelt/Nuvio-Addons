import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { ASLAN_SOURCES, BASE_SOURCES, WIOSPOR_SOURCE_COUNT } from '../src/addons/wiospor/source-registry.mjs';

const root = new URL('../', import.meta.url);
const channelsKt = await fs.readFile(new URL('.upstream-cache/wiospor-public/WioChannels.kt', root), 'utf8');
const bootstrapSpecs = JSON.parse(await fs.readFile(new URL('config/wiospor-source-specs.bootstrap.json', root), 'utf8'));
let specsKt = '';
let sportsProviderKt = '';
let wioAggregatorKt = '';
let publicAggregatorKt = '';
let aslanSourcesKt = '';
let aslanBootstrapKt = '';
let aslanDataKt = '';
try { specsKt = await fs.readFile(new URL('.upstream-cache/turkspor-source/SourceSpec.kt', root), 'utf8'); } catch {}
try { sportsProviderKt = await fs.readFile(new URL('.upstream-cache/turkspor-source/SportsProvider.kt', root), 'utf8'); } catch {}
try { wioAggregatorKt = await fs.readFile(new URL('.upstream-cache/turkspor-source/WioSourceAggregator.kt', root), 'utf8'); } catch {}
try { publicAggregatorKt = await fs.readFile(new URL('.upstream-cache/wiospor-public/SourceAggregator.kt', root), 'utf8'); } catch {}
try { aslanSourcesKt = await fs.readFile(new URL('.upstream-cache/turkspor-source/AslanSources.kt', root), 'utf8'); } catch {}
try { aslanBootstrapKt = await fs.readFile(new URL('.upstream-cache/turkspor-source/AslanBootstrap.kt', root), 'utf8'); } catch {}
try { aslanDataKt = await fs.readFile(new URL('.upstream-cache/turkspor-source/AslanData.kt', root), 'utf8'); } catch {}

function sha256(text) { return crypto.createHash('sha256').update(text).digest('hex'); }
function unquoteList(text) { return [...text.matchAll(/"((?:\\.|[^"])*)"/g)].map(m => m[1].replace(/\\"/g, '"')); }
function requireMarkers(label, text, markers) {
  for (const marker of markers) if (!text.includes(marker)) throw new Error(`${label} contract changed (missing ${marker}); resolver port requires review.`);
}

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
const effectiveSpecs = sourceSpecs.length ? sourceSpecs : bootstrapSpecs;

if (sportsProviderKt) requireMarkers('SportsProvider', sportsProviderKt, ['SourceMode.WORDPRESS', 'SourceMode.ROYAL', 'SourceMode.BEYAZ', 'SourceMode.INTER', 'loadLinks']);

let baseCoverageVerified = false;
let aslanCoverageVerified = false;
const aggregatorForCoverage = publicAggregatorKt || wioAggregatorKt;

if (aggregatorForCoverage) {
  requireMarkers('WioSpor SourceAggregator', aggregatorForCoverage, [
    'AslanSources.items',
    'aslan_$sourceId',
    'createSharedWorker("beyazelma"',
    'createSharedWorker("betmatiktv"',
    'override val id: String = "patron"',
    'override val id: String = "viontv"',
    'override val id: String = "papazsports"',
    'override val id: String = "jestyayin"'
  ]);
  const rows = [];
  for (const match of aggregatorForCoverage.matchAll(/override val id:\s*String\s*=\s*"([^"]+)"/g)) {
    if (!match[1].includes('$')) rows.push(match[1]);
  }
  for (const match of aggregatorForCoverage.matchAll(/createSharedWorker\("([^"]+)",\s*"([^"]+)"\)/g)) rows.push(match[1]);
  const upstreamIds = new Set(rows);
  const portIds = new Set(BASE_SOURCES.map(source => source.id));
  if (upstreamIds.size !== portIds.size) {
    throw new Error(`WioSpor base source count changed: upstream=${upstreamIds.size}, port=${portIds.size}`);
  }
  for (const id of portIds) if (!upstreamIds.has(id)) throw new Error(`WioSpor base source missing from upstream: ${id}`);
  baseCoverageVerified = true;
}

if (aslanSourcesKt && aslanBootstrapKt && aslanDataKt) {
  requireMarkers('Aslan bootstrap', aslanBootstrapKt, ['AES/GCM/NoPadding', 'registry-v1', 'GCMParameterSpec(128']);
  requireMarkers('Aslan data', aslanDataKt, ['#EXTVLCOPT:', '#KODIPROP:', '.mpd', 'players=rows.flatMap']);
  const upstreamAslan = [...aslanSourcesKt.matchAll(/"([^"]+)"\s+to\s+"([^"]+)"/g)]
    .map(match => ({ sourceId: match[1], title: match[2] }));
  if (upstreamAslan.length !== ASLAN_SOURCES.length) {
    throw new Error(`Aslan source count changed: upstream=${upstreamAslan.length}, port=${ASLAN_SOURCES.length}`);
  }
  const upstreamIds = new Set(upstreamAslan.map(item => item.sourceId));
  for (const source of ASLAN_SOURCES) if (!upstreamIds.has(source.sourceId)) {
    throw new Error(`Aslan source missing from upstream: ${source.sourceId}`);
  }
  aslanCoverageVerified = true;
}

if (BASE_SOURCES.length !== 19 || ASLAN_SOURCES.length !== 27 || WIOSPOR_SOURCE_COUNT !== 46) {
  throw new Error('WioSpor source registry coverage is not 46/46');
}
const upstreamCoverageVerified = baseCoverageVerified && aslanCoverageVerified;

await fs.mkdir(new URL('generated/wiospor', root), { recursive: true });
await fs.writeFile(new URL('generated/wiospor/channels.json', root), JSON.stringify(channels, null, 2) + '\n');
await fs.writeFile(new URL('generated/wiospor/source-specs.json', root), JSON.stringify(effectiveSpecs, null, 2) + '\n');
await fs.writeFile(new URL('generated/wiospor/source-state.json', root), JSON.stringify({
  generatedAt: new Date().toISOString(),
  sourceSha256: {
    channels: sha256(channelsKt),
    sourceSpecs: specsKt ? sha256(specsKt) : null,
    sportsProvider: sportsProviderKt ? sha256(sportsProviderKt) : null,
    wioSourceAggregator: aggregatorForCoverage ? sha256(aggregatorForCoverage) : null,
    aslanSources: aslanSourcesKt ? sha256(aslanSourcesKt) : null,
    aslanBootstrap: aslanBootstrapKt ? sha256(aslanBootstrapKt) : null,
    aslanData: aslanDataKt ? sha256(aslanDataKt) : null
  },
  channelCount: channels.length,
  sharedSourceCount: effectiveSpecs.length,
  baseSourceCount: BASE_SOURCES.length,
  aslanSourceCount: ASLAN_SOURCES.length,
  totalSourceCount: WIOSPOR_SOURCE_COUNT,
  sourceCoverage: `${WIOSPOR_SOURCE_COUNT}/${WIOSPOR_SOURCE_COUNT}`,
  baseCoverageVerified,
  aslanCoverageVerified,
  sourceSpecOrigin: sourceSpecs.length ? 'upstream-private' : 'bootstrap-contract',
  upstreamCoverageVerified,
  streamResolverStatus: 'full-resolver-ready'
}, null, 2) + '\n');
console.log(`Generated ${channels.length} WioSpor channels; source coverage ${WIOSPOR_SOURCE_COUNT}/${WIOSPOR_SOURCE_COUNT} (${BASE_SOURCES.length} base + ${ASLAN_SOURCES.length} Aslan).`);
