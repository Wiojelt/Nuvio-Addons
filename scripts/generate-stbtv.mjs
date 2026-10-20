import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const candidatePaths = [
  'C:/Users/root/Downloads/cloudstream-work/TurkSpor-Source/StbTV/src/main/kotlin/dev/wiojelt/stbtv/StbDatabase.kt',
  path.resolve(root, '../../../../Downloads/cloudstream-work/TurkSpor-Source/StbTV/src/main/kotlin/dev/wiojelt/stbtv/StbDatabase.kt'),
  path.resolve(root, '.upstream-cache/turkspor-source/StbDatabase.kt')
];

const fallbackJson = path.resolve(root, 'config/stbtv-channel-db.json');
const outDir = path.resolve(root, 'generated/stbtv');

async function readOptional(filePath) {
  try { return await fs.readFile(filePath, 'utf8'); } catch { return ''; }
}

let stbChannels = [];

for (const candidate of candidatePaths) {
  const ktSource = await readOptional(candidate);
  if (ktSource) {
    const pattern = /list\.add\(StbChannel\(\s*id\s*=\s*"([^"]+)",\s*name\s*=\s*"([^"]+)",\s*logo\s*=\s*"([^"]*)",\s*category\s*=\s*"([^"]*)",\s*streams\s*=\s*listOf\(([\s\S]*?)\)\s*\)\)/g;
    for (const m of ktSource.matchAll(pattern)) {
      const [, id, name, logo, category, streamsRaw] = m;
      const streams = [];
      const streamPat = /StbStream\("([^"]*)",\s*"([^"]*)",\s*"([^"]*)"\)/g;
      for (const sm of streamsRaw.matchAll(streamPat)) {
        streams.push({ panel: sm[1], title: sm[2], url: sm[3] });
      }
      stbChannels.push({ id, name, logo, category, streams });
    }
    if (stbChannels.length > 0) break;
  }
}

if (!stbChannels.length) {
  const fallbackText = await readOptional(fallbackJson);
  if (fallbackText) {
    stbChannels = JSON.parse(fallbackText);
  }
}

if (!stbChannels.length) {
  throw new Error('StbTV database source not found');
}

// Save config snapshot
await fs.mkdir(path.dirname(fallbackJson), { recursive: true });
await fs.writeFile(fallbackJson, JSON.stringify(stbChannels), 'utf8');

// Write generated files
await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(path.join(outDir, 'channels.json'), JSON.stringify(stbChannels, null, 2) + '\n', 'utf8');
await fs.writeFile(path.join(outDir, 'state.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  channelCount: stbChannels.length,
  totalStreams: stbChannels.reduce((acc, c) => acc + (c.streams?.length || 0), 0)
}, null, 2) + '\n', 'utf8');

console.log(`Generated StbTV snapshot: ${stbChannels.length} channels, ${stbChannels.reduce((acc, c) => acc + (c.streams?.length || 0), 0)} streams.`);
