import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { ASLAN_SOURCES, BASE_SOURCES, WIOSPOR_SOURCES, WIOSPOR_SOURCE_COUNT } from '../src/addons/wiospor/source-registry.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const googleApiKey = /AIza[0-9A-Za-z_-]{35}/;

async function assertNoCommittedGoogleKeys(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'dist-live') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await assertNoCommittedGoogleKeys(full);
      continue;
    }
    if (!entry.isFile()) continue;
    let text;
    try { text = await fs.readFile(full, 'utf8'); } catch { continue; }
    if (googleApiKey.test(text)) throw new Error(`Refusing committed Google API key in ${path.relative(repoRoot, full)}`);
  }
}

await assertNoCommittedGoogleKeys(repoRoot);

if (BASE_SOURCES.length !== 19) throw new Error(`Expected 19 base WioSpor sources, got ${BASE_SOURCES.length}`);
if (ASLAN_SOURCES.length !== 27) throw new Error(`Expected 27 Aslan WioSpor sources, got ${ASLAN_SOURCES.length}`);
if (WIOSPOR_SOURCE_COUNT !== 46 || WIOSPOR_SOURCES.length !== 46) throw new Error(`Expected 46 WioSpor sources, got ${WIOSPOR_SOURCE_COUNT}`);
if (new Set(WIOSPOR_SOURCES.map(source => source.id)).size !== WIOSPOR_SOURCE_COUNT) throw new Error('Duplicate WioSpor source id');

const manifest = JSON.parse(await fs.readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
const scrapers = Array.isArray(manifest) ? manifest : manifest?.scrapers;
if (!Array.isArray(scrapers) || scrapers.length === 0) throw new Error('manifest.json has no scrapers');

const cinemaManifest = JSON.parse(await fs.readFile(new URL('../wiocinema/manifest.json', import.meta.url), 'utf8'));
const cinemaScrapers = Array.isArray(cinemaManifest) ? cinemaManifest : cinemaManifest?.scrapers;
if (!Array.isArray(cinemaScrapers) || cinemaScrapers.length === 0) throw new Error('wiocinema/manifest.json has no scrapers');

const syntaxFiles = new Set([
  'src/addons/wiospor/app.mjs',
  'src/addons/wiospor/server.mjs',
  'src/addons/wiospor/player-parser.mjs',
  'src/addons/wiospor/resolver.mjs',
  'src/addons/wiospor/legacy-sources.mjs',
  'src/addons/wiospor/source-registry.mjs',
  'src/addons/wiospor/birdirbir.mjs',
  'src/addons/wiospor/aslan-sources.mjs',
  'scripts/build-wiospor-live.mjs',
  'scripts/generate-birdirbir.mjs',
  'scripts/generate-wiocinema.mjs'
]);
for (const entry of scrapers) {
  if (!entry.id || !entry.filename) throw new Error('Invalid manifest scraper entry');
  syntaxFiles.add(entry.filename);
}
for (const entry of cinemaScrapers) {
  if (!entry.id || !entry.filename) throw new Error('Invalid WioCinema scraper entry');
  syntaxFiles.add(`wiocinema/${entry.filename}`);
  syntaxFiles.add(entry.filename);
}
for (const filename of syntaxFiles) {
  const fileUrl = new URL(`../${filename}`, import.meta.url);
  await fs.access(fileUrl);
  const filePath = fileURLToPath(fileUrl);
  const result = spawnSync(process.execPath, ['--check', filePath], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || `Syntax check failed: ${filename}`);
}

let channelCount = 0;
let birdirbirChannelCount = 0;
let birdirbirStreamCount = 0;
try {
  const channels = JSON.parse(await fs.readFile(new URL('../generated/wiospor/channels.json', import.meta.url), 'utf8'));
  channelCount = channels.length;
  if (channelCount < 20) throw new Error(`Expected at least 20 WioSpor channels, got ${channelCount}`);
  const specs = JSON.parse(await fs.readFile(new URL('../generated/wiospor/source-specs.json', import.meta.url), 'utf8'));
  if (!Array.isArray(specs) || specs.length < 5) throw new Error(`Expected at least 5 WioSpor source contracts, got ${specs?.length || 0}`);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  console.warn('WioSpor generated catalog is not present yet; run npm run sync && npm run generate.');
}
try {
  const birdirbir = JSON.parse(await fs.readFile(new URL('../generated/birdirbir/channels.json', import.meta.url), 'utf8'));
  if (!Array.isArray(birdirbir) || birdirbir.length < 50) throw new Error(`Expected at least 50 Birdirbir channels, got ${birdirbir?.length || 0}`);
  birdirbirChannelCount = birdirbir.length;
  const panels = new Set();
  for (const channel of birdirbir) for (const source of channel?.streams || []) {
    birdirbirStreamCount += 1;
    if (source?.panel) panels.add(source.panel);
  }
  if (birdirbirStreamCount < 100) throw new Error(`Expected at least 100 Birdirbir streams, got ${birdirbirStreamCount}`);
  for (const panel of ['Eagle', '8kGold', 'Spor20x', 'WorldSport']) {
    if (!panels.has(panel)) throw new Error(`Birdirbir panel missing: ${panel}`);
  }
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  console.warn('Birdirbir generated database is not present yet; run npm run generate.');
}

console.log(`Validated ${scrapers.length} WioSinema scraper(s), ${cinemaScrapers.length} WioCinema scraper(s), ${syntaxFiles.size} JS entrypoints, ${WIOSPOR_SOURCE_COUNT}/${WIOSPOR_SOURCE_COUNT} WioSpor sources${channelCount ? ` and ${channelCount} WioSpor catalog entries` : ''}${birdirbirChannelCount ? `; Birdirbir ${birdirbirChannelCount} channels / ${birdirbirStreamCount} streams` : ''}.`);
