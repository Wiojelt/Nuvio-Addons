import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const manifest = JSON.parse(await fs.readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
if (!Array.isArray(manifest) || manifest.length === 0) throw new Error('manifest.json is empty');
for (const entry of manifest) {
  if (!entry.id || !entry.filename) throw new Error('Invalid manifest entry');
  const fileUrl = new URL(`../${entry.filename}`, import.meta.url);
  await fs.access(fileUrl);
  const result = spawnSync(process.execPath, ['--check', fileUrl.pathname], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || `Syntax check failed: ${entry.filename}`);
}

let channelCount = 0;
try {
  const channels = JSON.parse(await fs.readFile(new URL('../generated/wiospor/channels.json', import.meta.url), 'utf8'));
  channelCount = channels.length;
  if (channelCount < 20) throw new Error(`Expected at least 20 WioSpor channels, got ${channelCount}`);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  console.warn('WioSpor generated catalog is not present yet; run npm run sync && npm run generate.');
}

console.log(`Validated ${manifest.length} Nuvio provider(s)${channelCount ? ` and ${channelCount} WioSpor catalog entries` : ''}.`);
