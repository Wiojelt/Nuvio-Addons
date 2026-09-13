import fs from 'node:fs/promises';
import { getRefSha, getTextFile, writeText } from './github.mjs';

const token = process.env.UPSTREAM_GH_TOKEN || process.env.GITHUB_TOKEN || '';
const config = JSON.parse(await fs.readFile(new URL('../config/upstreams.json', import.meta.url), 'utf8'));
const statePath = new URL('../generated/upstream-state.json', import.meta.url);

let previous = {};
try { previous = JSON.parse(await fs.readFile(statePath, 'utf8')); } catch {}

const next = { updatedAt: new Date().toISOString(), repositories: {} };
const changes = [];

for (const source of config.repositories) {
  if (source.private && !token) {
    console.warn(`Skipping private upstream ${source.repo}; UPSTREAM_GH_TOKEN is not configured.`);
    next.repositories[source.id] = { repo: source.repo, ref: source.ref, skipped: true, reason: 'missing-token', sha: previous.repositories?.[source.id]?.sha || null };
    continue;
  }

  const sha = await getRefSha(source.repo, source.ref, token);
  const oldSha = previous.repositories?.[source.id]?.sha || null;
  const changed = oldSha !== sha;
  next.repositories[source.id] = { repo: source.repo, ref: source.ref, sha };

  for (const file of source.files) {
    let needsFetch = changed;
    try { await fs.access(new URL(`../${file.target}`, import.meta.url)); } catch { needsFetch = true; }
    if (!needsFetch) continue;
    const text = await getTextFile(source.repo, file.path, source.ref, token);
    await writeText(new URL(`../${file.target}`, import.meta.url), text);
  }

  if (changed) changes.push({ id: source.id, repo: source.repo, from: oldSha, to: sha });
}

await fs.mkdir(new URL('../generated', import.meta.url), { recursive: true });
await fs.writeFile(statePath, JSON.stringify(next, null, 2) + '\n');
await fs.writeFile(new URL('../generated/upstream-changes.json', import.meta.url), JSON.stringify({ changed: changes.length > 0, changes }, null, 2) + '\n');
console.log(changes.length ? `Upstream changes: ${changes.map(x => x.id).join(', ')}` : 'No upstream SHA changes.');
