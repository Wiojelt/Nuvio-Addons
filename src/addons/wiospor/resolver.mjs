/* SPDX-License-Identifier: GPL-3.0-only
 * Server-side WioSpor resolver port. No page JavaScript is evaluated.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { wordpressEmbed, wordpressStream, domainEndpoint, royalStream, apiStream, nextStreams, embeddedHls } from './player-parser.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36';
const DOMAIN_MANIFEST = 'https://raw.githubusercontent.com/Wiojelt/TurkSpor/main/domains.json';
const cache = new Map();

function readJson(relative, fallback = []) {
  try { return JSON.parse(fs.readFileSync(path.join(repoRoot, relative), 'utf8')); } catch { return fallback; }
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function stripTags(value) { return decodeHtml(String(value || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim(); }
function attrs(raw) {
  const out = {};
  for (const m of String(raw || '').matchAll(/([:\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) out[m[1].toLowerCase()] = decodeHtml(m[2] ?? m[3] ?? m[4] ?? '');
  return out;
}
function elements(html, tag) {
  const out = [];
  const re = new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  for (const m of html.matchAll(re)) out.push({ attrs: attrs(m[1]), body: m[2], raw: m[0] });
  return out;
}
function classHas(a, value) { return String(a.class || '').split(/\s+/).includes(value); }
function innerByClass(body, names) {
  const wanted = new Set(names);
  const re = /<([a-z0-9]+)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  for (const m of body.matchAll(re)) {
    const a = attrs(m[2]);
    if (String(a.class || '').split(/\s+/).some(c => wanted.has(c))) return stripTags(m[3]);
  }
  return '';
}
function imageAttr(body, key = 'src') {
  const m = /<img\b([^>]*)>/i.exec(body); return m ? attrs(m[1])[key] || '' : '';
}
function resolveUrl(value, base) { try { return new URL(value, base).toString(); } catch { return ''; } }
function titleOf(html) { return stripTags(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || ''); }
function origin(url) { try { const u = new URL(url); return `${u.protocol}//${u.host}/`; } catch { return ''; } }
function httpsOnly(value) { try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && (!u.port || u.port === '443') ? u.toString() : null; } catch { return null; } }
function sourceHostOk(spec, host) { try { return new RegExp(`^(?:${spec.hostRegex})$`, 'i').test(host.toLowerCase()); } catch { return false; } }
function site(spec, value) { try { const u = new URL(String(value).trim()); if (!httpsOnly(u.toString()) || !sourceHostOk(spec, u.hostname)) return null; return `https://${u.hostname.toLowerCase()}/`; } catch { return null; } }
function param(url, key) { try { return new URL(url).searchParams.get(key); } catch { return null; } }
function nextDomains(spec, value) {
  const root = site(spec, value); if (!root) return [];
  const u = new URL(root); const matches = [...u.hostname.matchAll(/[0-9]+/g)]; const last = matches.at(-1); if (!last) return [];
  const n = Number(last[0]); if (!Number.isInteger(n)) return [];
  return [1,2,3].map(step => site(spec, `https://${u.hostname.slice(0,last.index)}${n+step}${u.hostname.slice(last.index+last[0].length)}/`)).filter(Boolean);
}

async function requestText(url, { referer = '', timeout = 12000, method = 'GET', json = null } = {}) {
  const headers = { 'User-Agent': UA, 'Accept': '*/*' };
  if (referer) headers.Referer = referer;
  let body;
  if (json) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
  const response = await fetch(url, { method, headers, body, redirect: 'follow', signal: AbortSignal.timeout(timeout) });
  return { code: response.status, url: response.url, text: await response.text(), headers: response.headers };
}

function safeRootLinks(spec, html, base) {
  const found = [];
  for (const a of elements(html, 'a')) { const s = site(spec, resolveUrl(a.attrs.href || '', base)); if (s) found.push(s); }
  for (const m of html.matchAll(/<link\b([^>]*)>/gi)) { const a = attrs(m[1]); if ((a.rel || '').toLowerCase() === 'canonical') { const s = site(spec, resolveUrl(a.href || '', base)); if (s) found.push(s); } }
  return [...new Set(found)];
}
function externalCatalog(html) { const m = /fetch\(['"](https:\/\/[^'"]+\/channels\.php)['"]\)/.exec(html); return m ? httpsOnly(m[1]) : null; }

function normalizeBrand(value) {
  let title = stripTags(value).replace(/\s*[·-]\s*yedek$/i, '').replace(/\s+izle$/i, '').replace(/\s+(?:full hd|fhd|uhd|4k|hd|sd)$/i, '').trim();
  const key = compact(title);
  const simple = {
    ssport1: 'S Sport', ssport: title.includes('+') ? 'S Sport Plus' : 'S Sport',
    smartspor: 'Spor Smart', smartspor1: 'Spor Smart', sporsmart1: 'Spor Smart', smartspor2: 'Spor Smart 2',
    exxenspor: 'Exxen Sports 1', exxenspor2: 'Exxen Sports 2', beinsportshaber: 'beIN Sports Haber'
  };
  return simple[key] || title;
}
function slug(value) { return normalizeText(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

function parseChannels(spec, html, base, assetBase = base) {
  const rows = [];
  if (spec.mode === 'WORDPRESS') {
    for (const a of elements(html, 'a')) {
      if (!(a.attrs.href || '').includes('/tv/')) continue;
      const url = resolveUrl(a.attrs.href, base); if (site(spec, url) !== site(spec, base)) continue;
      const id = /^\/tv\/([a-z0-9-]+)\/?$/.exec(new URL(url).pathname)?.[1]; if (!id) continue;
      const title = stripTags(a.body) || attrs(/<img\b([^>]*)>/i.exec(a.body)?.[1] || '').alt || ''; if (!title) continue;
      rows.push({ id, title: normalizeBrand(title), players: [url], logo: resolveUrl(imageAttr(a.body), base) });
    }
  } else if (spec.mode === 'ROYAL') {
    for (const a of elements(html, 'a')) {
      if (!classHas(a.attrs, 'channel-item') && !classHas(a.attrs, 'single-match')) continue;
      const status = innerByClass(a.body, ['channel-status']); if (status !== '7/24' && !(classHas(a.attrs, 'single-match') && stripTags(a.body).includes('7/24'))) continue;
      const url = resolveUrl(a.attrs.href || '', base); if (site(spec, url) !== site(spec, base)) continue;
      const id = param(url, 'id'); if (!id || !/^[a-zA-Z0-9_-]{1,80}$/.test(id)) continue;
      const title = innerByClass(a.body, ['channel-name','home']); if (!title) continue;
      rows.push({ id, title: normalizeBrand(title), players: [url], logo: resolveUrl(imageAttr(a.body), assetBase) });
    }
  } else if (spec.mode === 'INTER') {
    for (const d of elements(html, 'div')) {
      if (!classHas(d.attrs, 'single-channel') || d.attrs['data-channel'] !== 'true' || !d.attrs['data-streamx']) continue;
      const id = d.attrs['data-stream']; const url = httpsOnly(d.attrs['data-streamx']); const title = String(d.attrs['data-name'] || '').trim();
      if (!id || !/^[a-zA-Z0-9_-]{1,80}$/.test(id) || !url || !title) continue;
      rows.push({ id, title: normalizeBrand(title), players: [url], logo: resolveUrl(imageAttr(d.body), base) });
    }
  } else if (spec.mode === 'BEYAZ') {
    for (const a of elements(html, 'a')) {
      if (!classHas(a.attrs, 'channel-card') || !String(a.attrs.href || '').startsWith('/kanal/')) continue;
      const url = resolveUrl(a.attrs.href, base); if (site(spec, url) !== site(spec, base)) continue;
      const raw = /<h[2-4]\b[^>]*>([\s\S]*?)<\/h[2-4]>/i.exec(a.body)?.[1] || attrs(/<img\b([^>]*)>/i.exec(a.body)?.[1] || '').alt || stripTags(a.body);
      const title = normalizeBrand(raw); const id = slug(title); if (!id) continue;
      rows.push({ id, title, players: [url], logo: resolveUrl(imageAttr(a.body), base) });
    }
  }
  const grouped = new Map();
  for (const row of rows) { const old = grouped.get(row.id); if (!old) grouped.set(row.id, row); else old.players = [...new Set([...old.players, ...row.players])]; }
  return [...grouped.values()];
}

async function resolveSource(spec, force = false) {
  const cached = cache.get(spec.key); if (!force && cached && Date.now() - cached.checkedAt < 60_000) return cached;
  const tried = new Set();
  const candidates = [];
  try {
    const manifest = JSON.parse((await requestText(DOMAIN_MANIFEST, { timeout: 8000 })).text);
    for (const value of manifest?.schemaVersion === 1 ? (manifest.sources?.[spec.key]?.candidates || []).slice(0,5) : []) { const s = site(spec, value); if (s) candidates.push(s); }
  } catch {}
  candidates.push(...spec.roots);
  if (cached?.url) candidates.push(cached.url);

  async function verify(root) {
    if (!root || tried.has(root)) return null; tried.add(root);
    try {
      const response = await requestText(root + (spec.catalogPath || ''), { timeout: 10000 });
      const final = site(spec, response.url); if (!final || response.code !== 200) return null;
      const title = titleOf(response.text); if (!spec.markers.some(marker => title.toLowerCase().includes(marker.toLowerCase()))) return null;
      let sourceChannels = parseChannels(spec, response.text, final);
      if (spec.mode === 'ROYAL') {
        const ext = externalCatalog(response.text);
        if (ext) try { const data = await requestText(ext, { referer: final, timeout: 8000 }); if (data.code === 200) sourceChannels = [...sourceChannels, ...parseChannels(spec, data.text, final, data.url)].filter((v,i,a) => a.findIndex(x => x.id === v.id) === i); } catch {}
      }
      if (!sourceChannels.length) return null;
      const snap = { url: final, channels: sourceChannels, checkedAt: Date.now(), announced: safeRootLinks(spec, response.text, final).find(x => x !== final) || null };
      cache.set(spec.key, snap); return snap;
    } catch { return null; }
  }

  for (const candidate of [...new Set(candidates)].slice(0,8)) { const result = await verify(candidate); if (result) return result; }
  const base = cached?.url || spec.roots[0];
  for (const candidate of nextDomains(spec, base)) { const result = await verify(candidate); if (result) return result; }
  throw new Error(`${spec.name} kanal listesine ulaşılamadı`);
}

function normalizeText(raw) {
  return String(raw || '').toLowerCase().trim().replaceAll('ı','i').replaceAll('ğ','g').replaceAll('ü','u').replaceAll('ş','s').replaceAll('ö','o').replaceAll('ç','c').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function compact(raw) { return normalizeText(raw).replace(/[^a-z0-9]/g, ''); }
function cleanCandidate(raw) {
  return normalizeText(raw)
    .replace(/\[[^\]]*]|\([^)]*\)/g, ' ')
    .replace(/^(?:tr|de|en|ru|az|fr|es|it|nl|pt|gb|uk|us|vip|gold|net|atom|mahsun|inadina|pasizle|selcuk|canli|yayin|andro|deathless|soner bozkurt yerli kanallar)[:|\-\s_]*/i, ' ')
    .replace(/\b(?:7\/24|24\/7|724|247)\b/g, ' ')
    .replace(/\b(?:1080p|720p|480p|360p|fhd|uhd|hd|sd|hevc|4k|2k|50fps|60fps)\b/g, ' ')
    .replace(/\bsports\b/g, 'sport').replace(/[^a-z0-9]+/g, ' ').trim();
}
function numbers(value) { return [...String(value).matchAll(/\b([0-9]+)\b/g)].map(m => m[1]); }
function matchesText(channel, rawCandidate) {
  const normTitle = compact(rawCandidate), normStd = compact(channel.standardTitle), cleaned = cleanCandidate(rawCandidate), normCleaned = compact(cleaned);
  if (normTitle === normStd || normCleaned === normStd) return true;
  for (const alias of channel.aliases || []) { const a = compact(alias); if (normTitle === a || normCleaned === a) return true; }
  const stdLower = normalizeText(channel.standardTitle), candLower = normalizeText(rawCandidate);
  for (const [token, stdHas, candHas] of [
    ['max', stdLower.includes('max'), candLower.includes('max')], ['haber',stdLower.includes('haber'),candLower.includes('haber')],
    ['plus',stdLower.includes('plus')||stdLower.includes('+'),candLower.includes('plus')||candLower.includes('+')], ['yildiz',stdLower.includes('yildiz'),candLower.includes('yildiz')]
  ]) if (stdHas !== candHas) return false;
  const stdNum = numbers(channel.standardTitle).at(-1), candNum = numbers(cleaned).at(-1);
  if (stdNum && candNum && stdNum !== candNum) return false;
  if (!stdNum && candNum && !['1','24','7'].includes(candNum)) return false;
  const brands = [
    ['bein',['tivibu','tabii','tabi','exxen','ssport','smart','trt','aspor','htspor','euro','dazn','sky','tnt']],
    ['tabii',['tivibu','bein','exxen','ssport','smart','euro']], ['tivibu',['tabii','tabi','bein','exxen','ssport','smart','euro']],
    ['exxen',['tivibu','tabii','tabi','bein','ssport','smart','euro']], ['ssport',['tivibu','tabii','tabi','exxen','bein','smart','euro']],
    ['smart',['tivibu','tabii','tabi','exxen','bein','ssport','euro']]
  ];
  const full = `${normTitle} ${normCleaned}`;
  for (const [brand, conflicts] of brands) if (compact(channel.standardTitle).includes(brand) && conflicts.some(x => full.includes(x))) return false;
  for (const alias of channel.aliases || []) { const a = compact(alias); if (a.length >= 4 && (normTitle.includes(a) || normCleaned.includes(a))) return true; }
  return normStd.length >= 4 && (normTitle.includes(normStd) || normCleaned.includes(normStd));
}
function matches(channel, candidate) { return matchesText(channel, candidate.id || '') || matchesText(channel, candidate.title || '') || matchesText(channel, `${candidate.title || ''} ${candidate.id || ''}`); }

async function resolvePlayer(spec, player, sourceUrl) {
  if (spec.mode === 'INTER') return [{ url: player, referer: sourceUrl }];
  const page = await requestText(player, { referer: sourceUrl, timeout: 12000 }); if (page.code !== 200) return [];
  if (spec.mode === 'WORDPRESS') {
    const embed = wordpressEmbed(page.text, page.url); if (!embed) return [];
    const html = await requestText(embed, { referer: sourceUrl, timeout: 12000 }); if (html.code !== 200) return [];
    const id = param(html.url, 'id'); if (!id) return [];
    if ((Number(id) || 0) > 10000) {
      const endpoint = /fetch\(['"](https:\/\/[^'"]+\/cinema)['"]/.exec(html.text)?.[1]; if (!endpoint) return [];
      const data = await requestText(endpoint, { referer: sourceUrl, method: 'POST', json: { AppId:'5000', AppVer:'1', VpcVer:'1.0.12', Language:'en', Token:'', VideoId:id }, timeout:12000 });
      const url = apiStream(data.text); return url ? [{ url, referer: origin(embed) }] : [];
    }
    const session = await requestText(`${origin(embed)}t?id=${encodeURIComponent(id)}`, { referer: embed, timeout: 10000 }); if (session.code !== 200) return [];
    const url = wordpressStream(html.text, html.url, session.text); return url ? [{ url, referer: origin(embed) }] : [];
  }
  if (spec.mode === 'ROYAL') {
    const endpoint = domainEndpoint(page.text); if (!endpoint) return [];
    const data = await requestText(endpoint, { referer: origin(page.url), timeout: 10000 });
    const url = royalStream(data.text, page.url); return url ? [{ url, referer: origin(page.url) }] : [];
  }
  if (spec.mode === 'BEYAZ') {
    const result = [];
    for (const url of nextStreams(page.text, page.url).slice(0,3)) {
      if (new URL(url).pathname === '/api/embed') {
        try { const embedded = await requestText(url, { referer: sourceUrl, timeout: 12000 }); if (embedded.code === 200) { const hls = embeddedHls(embedded.text, embedded.url); if (hls) result.push({ url: hls, referer: sourceUrl }); } } catch {}
      } else result.push({ url, referer: sourceUrl });
    }
    return result;
  }
  return [];
}

function qualityFromLine(line) { const h = /RESOLUTION=\d+x(\d+)/i.exec(line)?.[1]; return h ? `${h}p` : 'Auto'; }
function hlsVariants(text, playlistUrl) {
  const lines = String(text || '').split(/\r?\n/); const out = [];
  for (let i=0;i<lines.length;i++) if (lines[i].startsWith('#EXT-X-STREAM-INF:')) { let j=i+1; while (j<lines.length && (!lines[j] || lines[j].startsWith('#'))) j++; if (j<lines.length) out.push({ url: resolveUrl(lines[j].trim(), playlistUrl), quality: qualityFromLine(lines[i]) }); }
  return out;
}
function streamObject(spec, sourceChannel, playback, quality = 'Auto', url = playback.url) {
  const reqHeaders = { 'User-Agent': UA, Referer: playback.referer, Origin: playback.referer.replace(/\/$/, '') };
  return { name: `WioSpor • ${spec.name}`, title: `${sourceChannel.title} • ${quality}`, url, behaviorHints: { notWebReady: true, proxyHeaders: { request: reqHeaders } } };
}

export async function getStreamsForWioChannel(wioChannel) {
  const specs = readJson('generated/wiospor/source-specs.json', readJson('config/wiospor-source-specs.bootstrap.json', []));
  const all = [];
  const settled = await Promise.allSettled(specs.map(async spec => {
    const snapshot = await resolveSource(spec);
    const sourceChannel = snapshot.channels.find(c => matches(wioChannel, c)); if (!sourceChannel) return [];
    const found = [];
    for (const player of sourceChannel.players.slice(0,4)) {
      let playbacks = []; try { playbacks = await resolvePlayer(spec, player, snapshot.url); } catch {}
      for (const playback of playbacks) {
        try {
          const playlist = await requestText(playback.url, { referer: playback.referer, timeout: 12000 });
          if (playlist.code === 200 && playlist.text.trimStart().startsWith('#EXTM3U')) {
            const variants = hlsVariants(playlist.text, playlist.url);
            if (variants.length) for (const variant of variants) found.push(streamObject(spec, sourceChannel, playback, variant.quality, variant.url));
            else found.push(streamObject(spec, sourceChannel, playback));
          } else found.push(streamObject(spec, sourceChannel, playback));
        } catch { found.push(streamObject(spec, sourceChannel, playback)); }
      }
    }
    return found;
  }));
  for (const item of settled) if (item.status === 'fulfilled') all.push(...item.value);
  const seen = new Set(); return all.filter(x => x.url && !seen.has(x.url) && seen.add(x.url)).slice(0,24);
}
