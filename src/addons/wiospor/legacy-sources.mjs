const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36';
const DOMAIN_MANIFEST = 'https://raw.githubusercontent.com/Wiojelt/TurkSpor/main/domains.json';

const SOURCES = [
  { key: 'selcuksports', name: 'SelçukSports' },
  { key: 'taraftarium24', name: 'Taraftarium24' },
  { key: 'inattv', name: 'İnat TV' },
  { key: 'ardaspor', name: 'ArdaSpor' },
  { key: 'mahsunsports', name: 'MahsunSports' },
  { key: 'crex', name: 'Crex' },
  { key: 'kralsportshd', name: 'KralSporHD' }
];

function norm(s) { return String(s || '').toLowerCase().replaceAll('ı','i').replaceAll('ğ','g').replaceAll('ü','u').replaceAll('ş','s').replaceAll('ö','o').replaceAll('ç','c').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\b(?:1080p|720p|480p|360p|fhd|uhd|hd|sd|4k|50fps|60fps|7\/24|24\/7)\b/g, ' ').replace(/\bsports\b/g, 'sport').replace(/[^a-z0-9]+/g, ' ').trim(); }
function compact(s) { return norm(s).replace(/\s+/g, ''); }
function nums(s) { return [...norm(s).matchAll(/\b([0-9]+)\b/g)].map(x => x[1]); }
function matches(channel, row) {
  const candidates = [row?.title, row?.id, `${row?.title || ''} ${row?.id || ''}`].filter(Boolean);
  const targets = [channel?.standardTitle, ...(channel?.aliases || [])].filter(Boolean);
  for (const c of candidates) {
    const cc = compact(c); if (!cc) continue;
    const cnum = nums(c).at(-1);
    for (const t of targets) {
      const tt = compact(t); if (!tt) continue;
      const tnum = nums(t).at(-1);
      if (tnum && cnum && tnum !== cnum) continue;
      if (cc === tt || (tt.length >= 4 && (cc.includes(tt) || tt.includes(cc)))) return true;
    }
  }
  return false;
}
function decodeHtml(s) { return String(s || '').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>'); }
function stripTags(s) { return decodeHtml(String(s || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim(); }
function attr(raw, key) { const m = new RegExp(`${key}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(raw || ''); return decodeHtml(m ? (m[1] ?? m[2] ?? m[3] ?? '') : ''); }
function abs(value, base) { try { return new URL(value, base).toString(); } catch { return ''; } }
function http(value) { try { const u = new URL(value); return /^https?:$/.test(u.protocol) ? u.toString() : ''; } catch { return ''; } }
function origin(value) { try { const u = new URL(value); return `${u.protocol}//${u.host}`; } catch { return ''; } }
function q(url, key) { try { return new URL(url).searchParams.get(key) || ''; } catch { return ''; } }

async function text(url, referer = '', timeout = 10000) {
  const headers = { 'User-Agent': UA, Accept: '*/*' }; if (referer) headers.Referer = referer;
  const r = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(timeout) });
  return { code: r.status, url: r.url, text: await r.text() };
}

let manifestCache = null, manifestAt = 0;
async function domainManifest() {
  if (manifestCache && Date.now() - manifestAt < 120000) return manifestCache;
  try { const r = await text(DOMAIN_MANIFEST, '', 8000); manifestCache = r.code === 200 ? JSON.parse(r.text) : { sources: {} }; }
  catch { manifestCache = { sources: {} }; }
  manifestAt = Date.now(); return manifestCache;
}

function anchorRows(html, base) {
  const rows = [];
  for (const m of String(html || '').matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const raw = m[1], body = m[2];
    const href = attr(raw, 'data-url') || attr(raw, 'data-streamx') || attr(raw, 'href'); if (!href) continue;
    const player = http(abs(href, base)); if (!player) continue;
    const nameMatch = /class\s*=\s*["'][^"']*(?:name|home|channel-name)[^"']*["'][^>]*>([\s\S]*?)<\//i.exec(body);
    const title = stripTags(nameMatch?.[1] || attr(/<img\b([^>]*)>/i.exec(body)?.[1] || '', 'alt') || body); if (!title) continue;
    rows.push({ id: q(player, 'id') || q(player, 'channel') || player.split('/').filter(Boolean).at(-1) || title, title, player });
  }
  return rows;
}

function extractPlayerUrls(html, playerUrl) {
  const out = [];
  function add(v) { const url = http(decodeHtml(String(v || '').replace(/\\\//g, '/'))); if (url && !out.includes(url)) out.push(url); }
  for (const m of String(html || '').matchAll(/https?:\\?\/\\?\/[^'"\s<>]+?\.m3u8(?:\?[^'"\s<>]*)?/gi)) add(m[0]);
  for (const m of String(html || '').matchAll(/(?:file|source|src|streamUrl|hls)\s*[:=]\s*['"]([^'"]+)['"]/gi)) add(abs(m[1], playerUrl));
  const base = /this\.baseStreamUrl\s*=\s*['"](https?:\/\/[^'"]+)['"]/i.exec(html)?.[1];
  if (base) { const id = q(playerUrl, 'id'); if (/privateStream\s*=\s*1\b/i.test(html)) add(base); else if (id && /\/playlist\.m3u8/i.test(html)) add(`${base.replace(/\/$/, '')}/${encodeURIComponent(id)}/playlist.m3u8`); }
  return out;
}

function stream(sourceName, title, url, referer, headers = {}) {
  const request = { 'User-Agent': headers['User-Agent'] || UA };
  const ref = headers.Referer || referer || ''; if (ref) request.Referer = ref;
  const org = headers.Origin || origin(ref); if (org) request.Origin = org;
  return { name: `WioSpor • ${sourceName}`, title: `${title} • Auto`, url, behaviorHints: { notWebReady: true, proxyHeaders: { request } } };
}

async function genericSource(source, wioChannel) {
  const manifest = await domainManifest(); const entry = manifest?.sources?.[source.key] || {};
  const roots = [...(entry.candidates || []), ...(entry.gateways || [])].filter(Boolean).slice(0, 5);
  for (const root of roots) try {
    const home = await text(root, '', 9000); if (home.code !== 200) continue;
    const selected = anchorRows(home.text, home.url).filter(row => matches(wioChannel, row)).slice(0, 4); const found = [];
    for (const row of selected) try {
      const page = await text(row.player, home.url, 9000); if (page.code !== 200) continue;
      for (const url of extractPlayerUrls(page.text, page.url).slice(0, 5)) found.push(stream(source.name, row.title, url, origin(page.url) || home.url));
    } catch {}
    if (found.length) return found;
  } catch {}
  return [];
}

async function domino(wioChannel) {
  const api = 'http://dominotv58.site/admin_panel/api/';
  for (const category of ['⚽ 🇹🇷 SPOR', '⚽ Sports']) try {
    const url = `${api}tv/channels?channel_category=${encodeURIComponent(category)}&page=1&limit=100`;
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000) }); if (!r.ok) continue;
    const rows = await r.json();
    const candidates = (Array.isArray(rows) ? rows : []).filter(x => x?.active !== false && x?.title && x?.stream_url && matches(wioChannel, { id: String(x.id || ''), title: x.title }));
    const out = [];
    for (const ch of candidates.slice(0, 5)) {
      const headers = { 'User-Agent': ch.user_agent || UA, Referer: ch.referer || '', Origin: ch.origin || '' };
      for (const u of [ch.stream_url, ...(Array.isArray(ch.alternative_stream_urls) ? ch.alternative_stream_urls : [])]) if (http(u)) out.push(stream('Domino TV', ch.title, u, ch.referer || '', headers));
    }
    if (out.length) return out;
  } catch {}
  return [];
}

export async function getLegacyStreams(wioChannel) {
  const settled = await Promise.allSettled([domino(wioChannel), ...SOURCES.map(source => genericSource(source, wioChannel))]);
  const out = []; for (const item of settled) if (item.status === 'fulfilled') out.push(...item.value);
  const seen = new Set(); return out.filter(x => x.url && !seen.has(x.url) && seen.add(x.url));
}
