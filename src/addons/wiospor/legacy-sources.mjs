import { createHash, createHmac, createDecipheriv, randomBytes } from 'node:crypto';

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
  return { code: r.status, url: r.url, text: await r.text(), headers: r.headers };
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
  if (headers.Cookie) request.Cookie = headers.Cookie;
  if (headers['X-Requested-With']) request['X-Requested-With'] = headers['X-Requested-With'];
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

const DOMATES_IDENTITY = 'https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=';
const DOMATES_KEY = 'REMOVED_GOOGLE_API_KEY';
const DOMATES_DB = 'https://domates-tv-live-sports6.europe-west1.firebasedatabase.app/channels.json?auth=';
let domatesToken = '', domatesTokenAt = 0, domatesChannels = [], domatesAt = 0;

async function domatesList() {
  if (domatesChannels.length && Date.now() - domatesAt < 10 * 60_000) return domatesChannels;
  if (!domatesToken || Date.now() - domatesTokenAt > 45 * 60_000) {
    const auth = await fetch(DOMATES_IDENTITY + DOMATES_KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Android-Package': 'com.tv.domates', 'X-Android-Cert': 'e0ec0ae65a2326db28b58bee83d0248bc1fc9ba2' },
      body: JSON.stringify({ returnSecureToken: true }),
      signal: AbortSignal.timeout(15000)
    });
    if (!auth.ok) return [];
    domatesToken = (await auth.json())?.idToken || ''; domatesTokenAt = Date.now(); if (!domatesToken) return [];
  }
  let r = await fetch(DOMATES_DB + encodeURIComponent(domatesToken), { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
  if (r.status === 401) { domatesToken = ''; domatesTokenAt = 0; return []; }
  if (!r.ok) return [];
  const rows = await r.json(); domatesChannels = Array.isArray(rows) ? rows.filter(x => x?.name && x?.url) : []; domatesAt = Date.now(); return domatesChannels;
}
function domatesHeaders(ch, referer) {
  const type = String(ch.type || '').toLowerCase();
  const userAgent = type === 'kabloweb' ? 'Dalvik/2.1.0 (Linux; U; Android 12; Pixel 6 Build/SP2A.220505.002)' : type === 'sspr' ? 'com.ssportplus.dice/303 (Linux; U; Android 14; tr; Redfin; Build/FCB4.356145.001; Cronet/144.0.7509.3)' : UA;
  return { 'User-Agent': userAgent, Referer: referer || '', Origin: referer ? origin(referer) : '' };
}
async function domates(wioChannel) {
  try {
    const rows = await domatesList(); const selected = rows.filter(ch => matches(wioChannel, { id: ch.name, title: ch.name })).slice(0, 6); const out = [];
    for (const ch of selected) try {
      const parts = String(ch.url || '').split('::'); let url = http(parts[0]); let referer = http(parts[1] || ''); if (!url) continue;
      if (String(ch.type || '').toLowerCase() === 'yt') { out.push(stream('Domates TV', ch.name, `https://www.youtube.com/watch?v=${encodeURIComponent(parts[0])}`, '', domatesHeaders(ch, ''))); continue; }
      if (['custom', 'cdnlive'].includes(String(ch.type || '').toLowerCase())) {
        const headers = domatesHeaders(ch, referer); const r = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(12000) });
        if (r.ok) { const body = (await r.text()).replace(/\\\//g, '/'); const found = /https?:\/\/[^"'\s]+(?:m3u8|mpd)[^"'\s]*/i.exec(body)?.[0]; if (found) url = found; if (!referer) referer = r.url; }
      }
      out.push(stream('Domates TV', ch.name, url, referer, domatesHeaders(ch, referer)));
    } catch {}
    return out;
  } catch { return []; }
}

const INAT_DEFAULT_KEY = 'ywevqtjrurkwtqgz';
const INAT_SIGNING_KEY = 'x7kkk0qmqz63kj68tla5i7u26192v7zqnnddhjgm';
const INAT_FALLBACK = 'https://static.staticsave.com/fast/ctls.js';
const INAT_LIVE = 'https://diziboxen.help/CDN/001/002/dizibox/v2/tv/list1.php';
const INAT_DOCS = ['https://raw.githubusercontent.com/mtlshash/cert/main/hash','https://cdn.jsdelivr.net/gh/mtlshash/cert@main/hash','https://api.github.com/repos/mtlshash/cert/contents/hash'];
let inatOffset = 0, inatCache = [], inatAt = 0;

function inatDecode(value, defaultKey = INAT_DEFAULT_KEY) {
  try {
    let data = String(value || '').replace('-----BEGIN CERTIFICATE-----','').replace('-----END CERTIFICATE-----','').trim();
    if (data.length > 8_000_000) return null;
    for (let round = 0; round < 4; round++) {
      if (data.startsWith('[') || data.startsWith('{')) {
        if (data.length > 64 && /^[0-9a-f]{64}$/i.test(data.slice(-64))) data = data.slice(0, -64);
        return JSON.parse(data);
      }
      const split = data.indexOf(':'); const enc = (split >= 0 ? data.slice(0, split) : data).trim(); const keyText = (split >= 0 ? data.slice(split + 1) : defaultKey).trim();
      let key = Buffer.from(keyText, 'base64'); if (![16,24,32].includes(key.length)) key = Buffer.from(keyText, 'utf8'); if (![16,24,32].includes(key.length)) return null;
      const algorithm = `aes-${key.length * 8}-cbc`; const decipher = createDecipheriv(algorithm, key, key.subarray(0, 16)); decipher.setAutoPadding(true);
      data = Buffer.concat([decipher.update(Buffer.from(enc, 'base64')), decipher.final()]).toString('utf8').trim();
    }
    return data.startsWith('[') || data.startsWith('{') ? JSON.parse(data) : null;
  } catch { return null; }
}
function inatHeaders(row) {
  const out = { Referer: 'https://google.com/', 'User-Agent': UA };
  try { let h = row?.chHeaders; if (typeof h === 'string') h = JSON.parse(h); if (Array.isArray(h)) h = h[0]; if (h && typeof h === 'object') for (const [key, value] of Object.entries(h)) {
    const name = key === 'UserAgent' ? 'User-Agent' : key === 'XRequestedWith' ? 'X-Requested-With' : key;
    if (['user-agent','referer','origin','x-requested-with','cookie'].includes(name.toLowerCase()) && typeof value === 'string' && !/[\r\n]/.test(value)) out[name] = value;
  } } catch {}
  try { let reg = row?.chReg; if (typeof reg === 'string') reg = JSON.parse(reg); if (Array.isArray(reg)) reg = reg[0]; if (reg?.playSH2 && reg.playSH2 !== 'null' && !/[\r\n]/.test(reg.playSH2)) out.Cookie = reg.playSH2; } catch {}
  return out;
}
function inatRowKey(row) { try { let reg = row?.chReg; if (typeof reg === 'string') reg = JSON.parse(reg); if (Array.isArray(reg)) reg = reg[0]; return reg?.Regex1 && reg.Regex1 !== 'null' ? reg.Regex1 : INAT_DEFAULT_KEY; } catch { return INAT_DEFAULT_KEY; } }
async function inatSigned(url, key = INAT_DEFAULT_KEY) {
  const isGet = url.includes('/SPR/') || new URL(url).hostname === 'sprspr.help'; const requestKey = randomBytes(12).toString('base64url').slice(0, 16); const body = isGet ? '' : `1=${encodeURIComponent(requestKey)}&0=${encodeURIComponent(requestKey)}`;
  async function send(offset) {
    const timestamp = String(Math.floor(Date.now()/1000) + offset), nonce = randomBytes(16).toString('hex');
    const bodyHash = createHash('sha256').update(body).digest('hex'); const canonical = `${isGet?'GET':'POST'}\n${new URL(url).pathname}\n${timestamp}\n${nonce}\n${bodyHash}`;
    const signature = createHmac('sha256', INAT_SIGNING_KEY).update(canonical).digest('hex');
    const headers = { 'User-Agent':'speedrestapi', Referer:'https://speedrestapi.com/', 'X-Requested-With':'com.bp.box', 'Cache-Control':'no-cache', 'X-Ts':timestamp, 'X-Nc':nonce, 'X-Sg':signature };
    if (!isGet) headers['Content-Type'] = 'application/x-www-form-urlencoded';
    return fetch(url, { method: isGet ? 'GET':'POST', headers, body: isGet ? undefined : body, redirect:'follow', signal:AbortSignal.timeout(12000) });
  }
  let r = await send(inatOffset); const server = Number(r.headers.get('x-st')); if (r.status === 403 && Number.isFinite(server) && server > 0) { inatOffset = server - Math.floor(Date.now()/1000); r = await send(inatOffset); }
  return r.ok ? r.text() : '';
}
function inatChannels(data) {
  if (!Array.isArray(data)) return [];
  return data.filter(row => { const type = String(row?.chType || ''); return (type === 'live_url' || type === 'live_url_mode' || type.startsWith('tekli_regex_lb_sh_3')) && row?.chName && http(row?.chUrl); });
}
async function inatBoxList() {
  if (inatCache.length && Date.now() - inatAt < 10 * 60_000) return inatCache;
  const candidateDocs = [];
  for (const doc of INAT_DOCS) try {
    const r = await text(doc, '', 8000); if (r.code !== 200) continue; let body = r.text;
    if (doc.includes('api.github.com')) body = Buffer.from(JSON.parse(body)?.content || '', 'base64').toString('utf8');
    const config = inatDecode(body); if (config) for (const key of ['DC10','DC2']) if (http(config?.[key])) candidateDocs.push(config[key]);
    if (candidateDocs.length) break;
  } catch {}
  for (const candidate of [...candidateDocs, INAT_FALLBACK]) try {
    const raw = candidate.toLowerCase().split('?')[0].endsWith('.php') ? await inatSigned(candidate) : (await text(candidate, '', 10000)).text;
    const index = inatDecode(raw); if (!Array.isArray(index)) continue;
    const cats = index.filter(x => compact(x?.catName) === 'spor' && String(x?.catType || '').includes('tv')).slice(0,3); let rows = [];
    for (const cat of cats) { const endpoint = http(cat?.catUrl); if (!endpoint) continue; const decoded = inatDecode(await inatSigned(endpoint)); rows.push(...inatChannels(decoded)); }
    if (rows.length) { inatCache = rows; inatAt = Date.now(); return rows; }
  } catch {}
  try { const decoded = inatDecode(await inatSigned(INAT_LIVE)); const rows = inatChannels(decoded).filter(x => /(spor|sport|nba|eurosport|cbc|idman|tivibu|tabii|exxen)/i.test(x.chName || '')); if (rows.length) { inatCache = rows; inatAt = Date.now(); return rows; } } catch {}
  return [];
}
async function inatBox(wioChannel) {
  try {
    const rows = (await inatBoxList()).filter(row => matches(wioChannel, { id: row.chName, title: String(row.chName).split('|')[0].trim() })).slice(0,6); const out = [];
    for (const row of rows) try {
      let url = http(row.chUrl); if (!url) continue; const type = String(row.chType || '');
      if (type.startsWith('tekli_regex_lb_sh_3') && !/\.m3u8/i.test(url)) { const key = inatRowKey(row); const decoded = inatDecode(await inatSigned(url, key), key); url = http(decoded?.chUrl || (Array.isArray(decoded) ? decoded[0]?.chUrl : '')); if (!url) continue; }
      const headers = inatHeaders(row); out.push(stream('İnat Box', String(row.chName).split('|')[0].trim(), url, headers.Referer || '', headers));
    } catch {}
    return out;
  } catch { return []; }
}

export async function getLegacyStreams(wioChannel) {
  const settled = await Promise.allSettled([domino(wioChannel), domates(wioChannel), inatBox(wioChannel), ...SOURCES.map(source => genericSource(source, wioChannel))]);
  const out = []; for (const item of settled) if (item.status === 'fulfilled') out.push(...item.value);
  const seen = new Set(); return out.filter(x => x.url && !seen.has(x.url) && seen.add(x.url));
}
