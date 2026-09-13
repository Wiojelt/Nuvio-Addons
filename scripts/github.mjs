import fs from 'node:fs/promises';
import path from 'node:path';

const API = 'https://api.github.com';

export async function githubJson(urlPath, token) {
  const response = await fetch(`${API}${urlPath}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
  if (!response.ok) throw new Error(`GitHub ${response.status} ${response.statusText}: ${urlPath}`);
  return response.json();
}

export async function getRefSha(repo, ref, token) {
  const data = await githubJson(`/repos/${repo}/commits/${encodeURIComponent(ref)}`, token);
  return data.sha;
}

export async function getTextFile(repo, filePath, ref, token) {
  const data = await githubJson(`/repos/${repo}/contents/${filePath.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`, token);
  if (!data.content || data.encoding !== 'base64') throw new Error(`Unsupported GitHub contents response for ${repo}:${filePath}`);
  return Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf8');
}

export async function writeText(target, content) {
  const directory = target instanceof URL ? new URL('.', target) : path.dirname(target);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}
