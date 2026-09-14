import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

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
    if (googleApiKey.test(text)) {
      throw new Error(`Refusing committed Google API key in ${path.relative(repoRoot, full)}`);
    }
  }
}

await assertNoCommittedGoogleKeys(repoRoot);

const manifest = JSON.parse(await fs.readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
const scrapers = Array.isArray(manifest) ? manifest : manifest?.scrapers;
if (!Array.isArray(scrapers) || scrapers.length === 0) throw new Error('manifest.json has no scrapers');

const syntaxFiles = new Set([
  'src/addons/wiospor/app.mjs',
  'src/addons/wiospor/server.mjs',
  'src/addons/wiospor/player-parser.mjs',
  'src/addons/wiospor/resolver.mjs',
  'src/addons/wiospor/legacy-sources.mjs',
  'scripts/build-wiospor-live.mjs'
]);
for (const entry of scrapers) {
  if (!entry.id || !entry.filename) throw new Error('Invalid manifest scraper entry');
  syntaxFiles.add(entry.filename);
}
for (const filename of syntaxFiles) {
  const fileUrl = new URL(`../${filename}`, import.meta.url);
  await fs.access(fileUrl);
  const result = spawnSync(process.execPath, ['--check', fileUrl.pathname], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || `Syntax check failed: ${filename}`);
}

let channelCount = 0;
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

console.log(`Validated ${scrapers.length} Nuvio scraper(s), ${syntaxFiles.size} JS entrypoints${channelCount ? ` and ${channelCount} WioSpor catalog entries` : ''}.`);
