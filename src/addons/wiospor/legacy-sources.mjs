import fs from 'node:fs';
import { createHash, createHmac, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36';
const DOMAIN_MANIFEST = 'https://raw.githubusercontent.com/Wiojelt/TurkSpor/main/domains.json';

const SOURCES = [
  { key: 'taraftarium24', name: 'Taraftarium24' },
  { key: 'ardaspor', name: 'ArdaSpor' },
  { key: 'mahsunsports', name: 'MahsunSports' },
  { key: 'crex', name: 'Crex' },
  { key: 'kralsportshd', name: 'KralSporHD' }
];

function norm(s) { return String(s || '').toLowerCase().replaceAll('ı','i').replaceAll('ğ','g').replaceAll('ü','u').replaceAll('ş','s').replaceAll('ö','o').replaceAll('ç','c').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\b(?:1080p|720p|480p|360p|fhd|uhd|hd|sd|4k|50fps|60fps|7\/24|24\/7)\b/g, ' ').replace(/\bsports\b/g, 'sport').replace(/[^a-z0-9]+/g, ' ').trim(); }
function compact(s) { return norm(s).replace(/\s+/g, ''); }
function nums(s) { return [...norm(s).matchAll(/\b([0-9]+)\b/g)].map(x => x[1]); }
function channelBrand(value) {
  const combined = ` ${compact(value)} `;
  if (combined.includes('ssportplus') || combined.includes('ssport+')) return 'ssportplus';
  if (combined.includes('ssport') || combined.includes('mavispor') || combined.includes(' ss ') || combined.includes(' ss2 ')) return 'ssport';
  if (combined.includes('smartspor') || combined.includes('sporsmart')) return 'smartspor';
  if (combined.includes('bein') || combined.includes('morspor') || combined.includes('patron') || combined.includes('ligtv') || combined.includes(' bs1 ') || combined.includes(' b1 ')) return 'bein';
  if (combined.includes('tivibu') || combined.includes('turuncuspor') || combined.includes(' t1 ') || combined.includes(' t2 ')) return 'tivibu';
  if (combined.includes('tabii') || combined.includes('yesilspor') || combined.includes(' ex1 ')) return 'tabii';
  if (combined.includes('exxen') || combined.includes('sarispor')) return 'exxen';
  if (combined.includes('eurosport') || combined.includes(' eu1 ') || combined.includes(' eu2 ')) return 'eurosport';
  if (combined.includes('trtspor') || combined.includes('trt1') || combined.includes('trt')) return 'trt';
  if (combined.includes('aspor')) return 'aspor';
  return '';
}

function matches(channel, row) {
  const rowText = `${row?.title || ''} ${row?.id || ''} ${row?.name || ''}`;
  const targetBrand = channelBrand(`${channel?.standardTitle || ''} ${channel?.name || ''}`);
  const rowBrand = channelBrand(rowText);

  if (targetBrand && rowBrand && targetBrand !== rowBrand) return false;
  if (targetBrand === 'bein' && /tivibu|ssport|s sport|euro|tabii|exxen|smart|trt|aspor|t1|t2|ss|eu1/i.test(rowText)) return false;
  if (targetBrand === 'ssport' && /tivibu|bein|euro|tabii|exxen|smart|trt|aspor|t1|b1|ex1/i.test(rowText)) return false;
  if (targetBrand === 'tivibu' && /bein|ssport|s sport|euro|tabii|exxen|smart|trt|aspor|b1|ss|ex1/i.test(rowText)) return false;
  if (targetBrand === 'tabii' && /bein|ssport|s sport|euro|tivibu|exxen|smart|aspor|b1|ss|t1/i.test(rowText)) return false;
  if (targetBrand === 'exxen' && /bein|ssport|s sport|euro|tivibu|tabii|smart|aspor|b1|ss|t1/i.test(rowText)) return false;

  const candidates = [row?.title, row?.id, `${row?.title || ''} ${row?.id || ''}`].filter(Boolean);
  const targets = [channel?.standardTitle, ...(channel?.aliases || [])].filter(Boolean);

  for (const c of candidates) {
    const cc = compact(c); if (!cc) continue;
    const cnum = nums(c).at(-1);
    const isCandHaber = /haber/i.test(c);
    const isCandMax = /max/i.test(c);

    for (const t of targets) {
      const isTargetHaber = /haber/i.test(t);
      const isTargetMax = /max/i.test(t);
      if (isCandHaber !== isTargetHaber || isCandMax !== isTargetMax) continue;

      const tt = compact(t); if (!tt) continue;
      const tnum = nums(t).at(-1);

      if (tnum && cnum && tnum !== cnum) continue;
      if (tnum && !cnum && !/4k|uhd/i.test(c)) continue;
      if (!tnum && cnum && !['1', '24', '7'].includes(cnum)) continue;

      if (cc === tt) return true;
      if (Math.min(cc.length, tt.length) >= 4 && (tt.includes(cc) || cc.includes(tt))) return true;
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
  function isPlayable(u) {
    if (!u) return false;
    const lower = u.toLowerCase();
    if (/\.(png|jpe?g|gif|webp|svg|css|js|ico)(\?.*)?$/i.test(lower)) return false;
    if (lower.includes('yandex.ru') || lower.includes('google-analytics') || lower.includes('googletagmanager')) return false;
    return lower.includes('.m3u8') || lower.includes('.mpd') || lower.includes('/playlist') || lower.includes('mono.m3u8') || lower.includes('/live/') || lower.includes('/hls/');
  }
  function add(v) {
    const url = http(decodeHtml(String(v || '').replace(/\\\//g, '/')));
    if (url && isPlayable(url) && !out.includes(url)) out.push(url);
  }
  for (const m of String(html || '').matchAll(/https?:\\?\/\\?\/[^'"\s<>]+?\.m3u8(?:\?[^'"\s<>]*)?/gi)) add(m[0]);
  for (const m of String(html || '').matchAll(/(?:file|source|src|streamUrl|hls)\s*[:=]\s*['"]([^'"]+)['"]/gi)) add(abs(m[1], playerUrl));
  const base = /this\.baseStreamUrl\s*=\s*['"](https?:\/\/[^'"]+)['"]/i.exec(html)?.[1];
  if (base) {
    const id = q(playerUrl, 'id');
    if (/privateStream\s*=\s*1\b/i.test(html)) add(base);
    else if (id && /\/playlist\.m3u8/i.test(html)) add(`${base.replace(/\/$/, '')}/${encodeURIComponent(id)}/playlist.m3u8`);
  }
  return out;
}

function stream(sourceName, title, url, referer, headers = {}) {
  const request = {};
  for (const [key, value] of Object.entries(headers || {})) {
    if (typeof value !== 'string' || !value || /[\r\n]/.test(value)) continue;
    if (['host', 'content-length'].includes(key.toLowerCase())) continue;
    request[key] = value;
  }
  if (!request['User-Agent']) request['User-Agent'] = UA;
  const ref = request.Referer || request.referer || referer || '';
  if (ref && !request.Referer && !request.referer) request.Referer = ref;
  if (!request.Origin && !request.origin && ref) {
    const org = origin(ref);
    if (org) request.Origin = org;
  }
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

let cifd2mCatalog = null;
let cifd2mCatalogAt = 0;
async function getCifd2mCatalog() {
  if (cifd2mCatalog && Date.now() - cifd2mCatalogAt < 10 * 60_000) return cifd2mCatalog;
  try {
    const fsMod = await import('node:fs/promises');
    const localDbUrl = new URL('../../../config/cifd2m-channel-db.json', import.meta.url);
    const raw = await fsMod.readFile(localDbUrl, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.live_channels) && parsed.live_channels.length) {
      cifd2mCatalog = parsed.live_channels;
      cifd2mCatalogAt = Date.now();
      return cifd2mCatalog;
    }
  } catch {}
  const urls = [
    'https://raw.githubusercontent.com/Wiojelt/WioSpor/builds/cifd2m_live.json',
    'https://raw.githubusercontent.com/Wiojelt/WioSpor/main/cifd2m_live.json',
    'https://raw.githubusercontent.com/Wiojelt/WioSpor/builds/domino_live.json',
    'https://raw.githubusercontent.com/Wiojelt/WioSpor/main/domino_live.json'
  ];
  for (const u of urls) {
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(8000) });
      if (r.ok) {
        const json = await r.json();
        cifd2mCatalog = Array.isArray(json?.live_channels) ? json.live_channels : [];
        cifd2mCatalogAt = Date.now();
        return cifd2mCatalog;
      }
    } catch {}
  }
  return [];
}

function channelMatchScore(channelTitle, wioChannel) {
  const name = String(channelTitle || '').toLowerCase().trim();
  const st = String(wioChannel?.standardTitle || '').toLowerCase().trim();
  const tb = channelBrand(st);
  const cb = channelBrand(name);
  if (tb && cb && tb !== cb) return -1000;

  let pts = 0;
  if (st && (name === st || compact(name) === compact(st))) pts += 500;
  else if (st && (name.includes(st) || st.includes(name))) pts += 300;
  if (tb && cb && tb === cb) pts += 200;
  for (const a of (wioChannel?.aliases || [])) {
    const al = String(a).toLowerCase().trim();
    if (!al) continue;
    if (name === al || compact(name) === compact(al)) pts += 150;
    else if (al.length >= 4 && name.includes(al)) pts += 50;
  }
  return pts;
}

async function cifd2m(wioChannel) {
  try {
    const channels = await getCifd2mCatalog();
    const candidates = channels
      .filter(x => x?.active !== false && (x?.title || x?.name) && (x?.stream_url || (Array.isArray(x?.sources) && x.sources.length)) && matches(wioChannel, { id: String(x.id || ''), title: x.title || x.name }))
      .sort((a, b) => channelMatchScore(b.title || b.name, wioChannel) - channelMatchScore(a.title || a.name, wioChannel));
    const out = [];
    for (const ch of candidates.slice(0, 5)) {
      const headers = { 'User-Agent': ch.user_agent || UA, Referer: ch.referer || '', Origin: ch.origin || '' };
      const candidateUrls = [ch.stream_url, ...(Array.isArray(ch.alternative_stream_urls) ? ch.alternative_stream_urls : [])];
      if (Array.isArray(ch.sources)) {
        for (const s of ch.sources) if (s?.url) candidateUrls.push(s.url);
      }
      for (const u of candidateUrls) {
        if (http(u) && !u.includes('youtube.com')) out.push(stream('çifd2m', ch.title || ch.name, u, ch.referer || '', headers));
      }
    }
    return out;
  } catch { return []; }
}
const domino = cifd2m;

const DOMATES_IDENTITY = 'https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=';
const DOMATES_KEY = process.env.DOMATES_GOOGLE_API_KEY || '';
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

const PATRON_ROOT = 'https://patronsports2.cfd';
async function patron(wioChannel) {
  try {
    const [domain, list] = await Promise.all([
      text(`${PATRON_ROOT}/domain.php`, `${PATRON_ROOT}/`, 9000),
      text(`${PATRON_ROOT}/channels.php`, `${PATRON_ROOT}/`, 11000)
    ]);
    if (domain.code !== 200 || list.code !== 200) return [];
    const base = http(String(JSON.parse(domain.text)?.baseurl || '').trim().replace(/\/?$/, '/'));
    const rows = JSON.parse(list.text);
    if (!base || !Array.isArray(rows)) return [];
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Mobile)',
      Origin: PATRON_ROOT,
      Referer: `${PATRON_ROOT}/`,
      'Sec-Fetch-Site': 'cross-site',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Dest': 'empty'
    };
    const out = [];
    for (const row of rows) {
      const title = String(row?.Mac || '').trim();
      const raw = String(row?.URL || '');
      let id = '';
      try { id = new URL(raw, PATRON_ROOT).searchParams.get('id') || ''; } catch {}
      if (!id || !matches(wioChannel, { title, id })) continue;
      out.push(stream('PatronHD', title || wioChannel.name, `${base}${encodeURIComponent(id)}/mono.m3u8`, `${PATRON_ROOT}/`, headers));
    }
    return out;
  } catch { return []; }
}

const VION_ROOT = 'https://mahmutabi.qzz.io';
const VION_API_PASSPHRASE = 'babaylazoryarışırlar';
const VION_PLAYBACK_KEY = 'tvvion01tvvion01';
const VION_UA = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36';
function vionDecryptEnvelope(envelope) {
  const encrypted = JSON.parse(envelope)?.r;
  if (!encrypted) return [];
  const seed = Buffer.from(VION_API_PASSPHRASE, 'utf8');
  const key = createHash('sha256').update(seed).digest();
  const iv = createHash('md5').update(seed).digest();
  const decipher = createDecipheriv('aes-256-cbc', key, iv);
  const plain = Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]).toString('utf8');
  const rows = JSON.parse(plain);
  return Array.isArray(rows) ? rows : [];
}
function vionPlaybackSign() {
  const payload = JSON.stringify({ ts: Date.now() + 24 * 60 * 60 * 1000 });
  const key = Buffer.from(VION_PLAYBACK_KEY, 'utf8');
  const cipher = createCipheriv('aes-128-cbc', key, key);
  return Buffer.concat([cipher.update(Buffer.from(payload, 'utf8')), cipher.final()])
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
async function vion(wioChannel) {
  try {
    const r = await fetch(`${VION_ROOT}/api/channels`, {
      headers: { 'User-Agent': VION_UA, Accept: 'application/json' },
      redirect: 'follow',
      signal: AbortSignal.timeout(12000)
    });
    if (!r.ok) return [];
    const rows = vionDecryptEnvelope(await r.text());
    const out = [];
    for (const row of rows) {
      if (!row?.url || !matches(wioChannel, { title: row.name, id: row.id })) continue;
      const headers = {
        Referer: 'https://google.com',
        'User-Agent': VION_UA,
        Connection: 'Keep-Alive',
        Accept: '*/*',
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
        ...(row.headers && typeof row.headers === 'object' ? row.headers : {}),
        'x-vion-sign': vionPlaybackSign()
      };
      out.push(stream('Mien TV', row.name || wioChannel.name, row.url, headers.Referer, headers));
    }
    return out;
  } catch { return []; }
}

function papazRows(html) {
  const out = [];
  for (const m of String(html || '').matchAll(/<[^>]+\bdata-url\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)[^>]*>/gi)) {
    const raw = m[0];
    const slug = attr(raw, 'data-url').replace(/^#/, '').trim();
    const title = stripTags(attr(raw, 'data-name')).trim();
    const target = attr(raw, 'data-target').trim();
    const source = attr(raw, 'data-source').trim();
    if (slug && title && target && source) out.push({ slug, title, target, source });
  }
  return out;
}
async function papaz(wioChannel) {
  const manifest = await domainManifest();
  const entry = manifest?.sources?.papazsports || {};
  const roots = [
    'https://www.papazsports1031.pro/',
    ...(entry.candidates || []),
    ...(entry.gateways || []),
    'https://www.papazsports1024.pro/',
    'https://www.papazsports1023.pro/',
    'https://www.papazsports1022.pro/'
  ].filter(url => /^https:\/\//i.test(url));
  for (const root of [...new Set(roots)]) try {
    const home = await text(root, '', 12000);
    if (home.code !== 200) continue;
    const base = origin(home.url);
    if (!base) continue;
    const selected = papazRows(home.text).filter(row => matches(wioChannel, row));
    const out = [];
    for (const row of selected) try {
      if (row.target === 'm3u8') {
        if (http(row.source)) out.push(stream('PapazSports', row.title, row.source, `${base}/`, { 'User-Agent': UA }));
        continue;
      }
      const field = row.target === 'viptv' ? 'channel' : 'id';
      const form = new URLSearchParams({ [field]: row.source });
      const authRes = await fetch(`${base}/auth.php`, {
        method: 'POST',
        headers: {
          'User-Agent': UA,
          'X-Requested-With': 'XMLHttpRequest',
          Origin: base,
          Referer: `${base}/`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: form,
        redirect: 'follow',
        signal: AbortSignal.timeout(10000)
      });
      if (!authRes.ok) continue;
      const auth = await authRes.json();
      const url = http(auth?.URL);
      if (!url) continue;
      const headers = { 'User-Agent': UA };
      if (auth?.TOKEN) {
        headers.usertoken = String(auth.TOKEN);
        headers.pl = 'PapazSports';
      }
      out.push(stream('PapazSports', row.title, url, `${base}/`, headers));
    } catch {}
    if (out.length) return out;
  } catch {}
  return [];
}

const JEST_START = 'https://www.jestyayin970.com';
const JEST_CHANNELS = 'https://data-reality.com/channels.php';
const JEST_DOMAIN = 'https://data-reality.com/domain.php';
const JEST_UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36';
const JEST_NAMES = {
  zirve:'beIN Sports 1', b2:'beIN Sports 2', b3:'beIN Sports 3', b4:'beIN Sports 4', b5:'beIN Sports 5',
  bm1:'beIN Sports Max 1', bm2:'beIN Sports Max 2', ss:'S Sport', ss2:'S Sport 2', smarts:'Smart Spor',
  sms2:'Smart Spor 2', t1:'Tivibu Spor 1', t2:'Tivibu Spor 2', t3:'Tivibu Spor 3', t4:'Tivibu Spor 4',
  ex7:'Tabii Spor', ex1:'Tabii Spor 1', ex2:'Tabii Spor 2', ex3:'Tabii Spor 3', ex4:'Tabii Spor 4',
  ex5:'Tabii Spor 5', ex6:'Tabii Spor 6', eu1:'Eurosport 1', eu2:'Eurosport 2', trt1:'TRT 1',
  trtspor:'TRT Spor', trtspor2:'TRT Spor Yıldız', as:'A Spor', atv:'ATV', tv8:'TV8', tv85:'TV8.5'
};
const JEST_FALLBACK = {
  zirve:'androstreamlivekral', b2:'androstreamlivebs2', b3:'androstreamlivebs3', b4:'androstreamlivebs4',
  b5:'androstreamlivebs5', ss2:'androstreamlivess2', as:'androstreamliveas'
};
function jestRows(html) {
  const out = [];
  for (const m of String(html || '').matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = attr(m[1], 'href');
    if (!href.includes('channel?id=')) continue;
    const id = href.split('channel?id=')[1]?.split(/[&#]/)[0]?.trim() || '';
    if (!id) continue;
    const inner = m[2];
    const titlePart = /class\s*=\s*["'][^"']*(?:match-name|match-title|home)[^"']*["'][^>]*>([\s\S]*?)<\//i.exec(inner)?.[1];
    const title = stripTags(titlePart || attr(m[1], 'data-name') || JEST_NAMES[id] || `JestYayın ${id.toUpperCase()}`);
    out.push({ id, title });
  }
  return out;
}
async function jestRoot() {
  try {
    const r = await fetch(JEST_START, { headers: { 'User-Agent': JEST_UA }, redirect: 'follow', signal: AbortSignal.timeout(9000) });
    return r.ok ? origin(r.url) || JEST_START : JEST_START;
  } catch { return JEST_START; }
}
async function jest(wioChannel) {
  try {
    const root = await jestRoot();
    const headers = { 'User-Agent': JEST_UA, Referer: `${root}/`, Origin: root };
    const listRes = await fetch(JEST_CHANNELS, { headers, redirect:'follow', signal:AbortSignal.timeout(12000) });
    if (!listRes.ok) return [];
    const selected = jestRows(await listRes.text()).filter(row => matches(wioChannel, row));
    if (!selected.length) return [];
    let streamBase = '';
    if (selected.some(row => !JEST_FALLBACK[row.id])) {
      try {
        const baseRes = await fetch(JEST_DOMAIN, { headers, signal:AbortSignal.timeout(9000) });
        if (baseRes.ok) streamBase = String((await baseRes.json())?.baseurl || '').trim().replace(/\/$/, '');
      } catch {}
    }
    const out = [];
    for (const row of selected) {
      const fallback = JEST_FALLBACK[row.id];
      const url = fallback
        ? `https://andro.evrenesoglu99.click/checklist/${fallback}.m3u8`
        : (streamBase ? `${streamBase}/${row.id}/mono.m3u8` : '');
      if (!http(url)) continue;
      const referer = fallback ? 'https://kralsportshd.com/' : `${root}/channel?id=${encodeURIComponent(row.id)}`;
      out.push(stream('JestYayın', row.title, url, referer, {
        'User-Agent': JEST_UA,
        Origin: origin(referer)
      }));
    }
    return out;
  } catch { return []; }
}

let atomTeletvHost = 'teletv15.top';
let atomTeletvAt = 0;
async function getAtomTeletvHost() {
  if (atomTeletvHost && Date.now() - atomTeletvAt < 30 * 60_000) return atomTeletvHost;
  const seeds = ['https://atomsportv519.top/', 'https://atomsportv520.top/'];
  for (const seed of seeds) {
    try {
      const r = await fetch(seed, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(6000) });
      if (r.ok) {
        const text = await r.text();
        const m = text.match(/https?:\/\/(teletv\d*\.top)\/load\//);
        if (m) {
          atomTeletvHost = m[1];
          atomTeletvAt = Date.now();
          return atomTeletvHost;
        }
      }
    } catch {}
  }
  return atomTeletvHost;
}

const ATOM_CHANNEL_MAP = {
  mor_1: 'bein-sports-1',
  mor_2: 'bein-sports-2',
  mor_3: 'bein-sports-3',
  mor_4: 'bein-sports-4',
  mor_5: 'bein-sports-5',
  mor_max_1: 'bein-sports-max-1',
  mor_max_2: 'bein-sports-max-2',
  yesil_1: 's-sport',
  yesil_2: 's-sport-2',
  mavi_1: 'tivibu-spor-1',
  mavi_2: 'tivibu-spor-2',
  mavi_3: 'tivibu-spor-3',
  mavi_4: 'tivibu-spor-4',
  sari_1: 'exxen-spor-1',
  sari_2: 'exxen-spor-2',
  sari_3: 'exxen-spor-3',
  sari_4: 'exxen-spor-4',
  turuncu_1: 'smart-spor',
  turuncu_2: 'smart-spor-2',
  ulusal_tv85: 'tv8-5',
  ulusal_trt_spor: 'trt-spor',
  ulusal_aspor: 'a-spor'
};

async function atomspor(wioChannel) {
  try {
    const atomId = ATOM_CHANNEL_MAP[wioChannel.id] ||
      Object.entries(ATOM_CHANNEL_MAP).find(([k, v]) => matches(wioChannel, { id: v, title: v }))?.[1];
    if (!atomId) return [];

    const host = await getAtomTeletvHost();
    const apiUrl = `https://${host}/load/yayinlink.php?id=${encodeURIComponent(atomId)}`;
    const r = await fetch(apiUrl, {
      headers: { 'User-Agent': UA, Referer: 'https://atomsportv519.top/' },
      signal: AbortSignal.timeout(8000)
    });
    if (!r.ok) return [];
    const json = await r.json();
    const streamUrl = (json?.deismackanal || json?.URL || '').replace(/\\\//g, '/').trim();
    if (!http(streamUrl)) return [];

    return [stream('AtomSpor', wioChannel.name, streamUrl, 'https://atomsportv519.top/', { 'User-Agent': UA })];
  } catch {
    return [];
  }
}


let newtvChannels = null;
function loadNewTvChannels() {
  if (newtvChannels) return newtvChannels;
  try {
    const raw = fs.readFileSync(new URL('../../../config/newtv-channel-db.json', import.meta.url), 'utf8');
    newtvChannels = JSON.parse(raw);
  } catch {
    newtvChannels = [];
  }
  return newtvChannels;
}

async function resolveNewTv(chId) {
  const r = await fetch(`https://dembed.st/premiumtv/daddy.php?id=${encodeURIComponent(chId)}`, {
    headers: {
      'User-Agent': UA,
      Referer: 'https://dlive.sx/'
    },
    signal: AbortSignal.timeout(8000)
  });
  if (!r.ok) return null;
  const t = await r.text();
  const slug = t.match(/const\s+CHANNEL\s*=\s*['"]([^'"]+)['"]/)?.[1];
  const edge = t.match(/const\s+EDGE\s*=\s*['"]([^'"]+)['"]/)?.[1];
  const src = t.match(/const\s+SRC\s*=\s*['"]([^'"]+)['"]/)?.[1];
  if (!src) return null;

  if (slug && edge) {
    try {
      const tokenRes = await fetch(`${edge}/api/playlist-token?slug=${encodeURIComponent(slug)}`, {
        headers: {
          'User-Agent': UA,
          Referer: 'https://dembed.st/',
          Origin: 'https://dembed.st'
        },
        signal: AbortSignal.timeout(5000)
      });
      if (tokenRes.ok) {
        const token = (await tokenRes.json())?.token;
        if (token) return `${src}?t=${token}&_=${Date.now()}`;
      }
    } catch {}
  }
  return src;
}

async function newtv(wioChannel) {
  try {
    const list = loadNewTvChannels();
    const matched = list.filter(c => matches(wioChannel, c));
    if (!matched.length) return [];
    const sorted = matched.sort((a,b) => (b.name.includes('Turkey') || b.cat === 'cat_tr') - (a.name.includes('Turkey') || a.cat === 'cat_tr'));
    const ch = sorted[0];
    const url = await resolveNewTv(ch.id);
    if (!url || !http(url)) return [];
    return [stream('NewTV Live', wioChannel.name, url, 'https://dembed.st/', {
      'User-Agent': UA,
      Referer: 'https://dembed.st/',
      Origin: 'https://dembed.st'
    })];
  } catch {
    return [];
  }
}

let beyazCatalog = null;
let beyazCatalogAt = 0;
async function getBeyazCatalog() {
  if (beyazCatalog && Date.now() - beyazCatalogAt < 15 * 60_000) return beyazCatalog;
  try {
    const r = await fetch('https://beyazelma78.com/api/channels', {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(6000)
    });
    if (r.ok) {
      beyazCatalog = await r.json();
      beyazCatalogAt = Date.now();
      return beyazCatalog;
    }
  } catch {}
  return [];
}

async function beyazelma(wioChannel) {
  try {
    const list = await getBeyazCatalog();
    if (!Array.isArray(list) || !list.length) return [];
    const matched = list.filter(c => matches(wioChannel, { id: c.slug || c._id, title: c.name }));
    if (!matched.length) return [];
    const ch = matched[0];
    const pageRes = await fetch(`https://beyazelma78.com/kanal/${encodeURIComponent(ch.slug)}`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(8000)
    });
    if (!pageRes.ok) return [];
    const html = await pageRes.text();
    const embedMatch = html.match(/\/api\/embed\?u=([^\s"'\\]+)/);
    if (!embedMatch) return [];
    const embedUrl = `https://beyazelma78.com/api/embed?u=${embedMatch[1]}`;
    const embedRes = await fetch(embedUrl, {
      headers: { 'User-Agent': UA, Referer: `https://beyazelma78.com/kanal/${encodeURIComponent(ch.slug)}` },
      signal: AbortSignal.timeout(8000)
    });
    if (!embedRes.ok) return [];
    const embedHtml = await embedRes.text();
    const slugMatch = embedHtml.match(/StreamPlayer\.mount\([^,]+,\s*\{[^}]*["']slug["']\s*:\s*["']([^"']+)["']/);
    if (!slugMatch) return [];
    const playSlug = slugMatch[1];
    const playRes = await fetch(`https://embed.beyazelma78.com/api/play/${encodeURIComponent(playSlug)}`, {
      headers: { 'User-Agent': UA, Referer: 'https://embed.beyazelma78.com/', Origin: 'https://embed.beyazelma78.com' },
      signal: AbortSignal.timeout(6000)
    });
    if (!playRes.ok) return [];
    const playJson = await playRes.json();
    const streamUrl = (playJson?.primary || playJson?.fallbacks?.[0] || '').trim();
    if (!http(streamUrl)) return [];
    return [stream('BeyazElma', wioChannel.name, streamUrl, 'https://embed.beyazelma78.com/', { 'User-Agent': UA, Referer: 'https://embed.beyazelma78.com/', Origin: 'https://embed.beyazelma78.com' })];
  } catch {
    return [];
  }
}


let leotvChannels = null, leotvAt = 0;
const LEO_ROOT = 'https://leograndtv11.com';

async function loadLeoChannels() {
  if (leotvChannels && Date.now() - leotvAt < 15 * 60_000) return leotvChannels;
  try {
    const r = await fetch(LEO_ROOT, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) return [];
    const html = await r.text();
    const serverDataMatch = html.match(/const\s+serverData\s*=\s*(\[[^;]+\]);/);
    if (!serverDataMatch) return [];
    const items = JSON.parse(serverDataMatch[1]);
    const rows = (Array.isArray(items) ? items : [])
      .filter(x => x?.sport === 'tv' && x?.channel && x?.home_name)
      .map(x => ({ id: String(x.channel), title: x.home_name.trim() }));
    if (rows.length) {
      leotvChannels = rows;
      leotvAt = Date.now();
      return rows;
    }
  } catch {}
  return [];
}

async function leotv(wioChannel) {
  try {
    const list = await loadLeoChannels();
    const matched = list.filter(row => matches(wioChannel, row)).slice(0, 2);
    const out = [];
    for (const row of matched) {
      try {
        const playerUrl = `https://bc4liveiframe1001.shop/player/player2.php?id=${encodeURIComponent(row.id)}`;
        const r = await fetch(playerUrl, { headers: { 'User-Agent': UA, Referer: `${LEO_ROOT}/` }, signal: AbortSignal.timeout(10000) });
        if (!r.ok) continue;
        const html = await r.text();
        const vGuardVal = html.match(/id=["']_vGuard["'][^>]*data-val=["']([^"']+)["']/)?.[1];
        const vGuardEnc = html.match(/id=["']_vGuard["'][^>]*data-enc=["']([^"']+)["']/)?.[1];
        const keyArrayStr = html.match(/var\s+keyArray\s*=\s*(\[[^\]]+\]);/)?.[1];
        const encStream = html.match(/var\s+primaryStream\s*=\s*decryptUrl\(['"]([^'"]+)['"]/)?.[1];
        if (!vGuardVal || !vGuardEnc || !keyArrayStr || !encStream) continue;

        const offset = parseInt(Buffer.from(vGuardVal, 'base64').toString('utf8').trim(), 10);
        const ivJson = JSON.parse(Buffer.from(vGuardEnc, 'base64').toString('utf8'));
        const keyJson = JSON.parse(keyArrayStr);

        const keyBytes = Buffer.from(keyJson.map(x => (x - offset) & 0xff));
        const ivBytes = Buffer.from(ivJson.map(x => (x - offset) & 0xff));

        const cipherName = keyBytes.length === 32 ? 'aes-256-cbc' : 'aes-128-cbc';
        const decipher = createDecipheriv(cipherName, keyBytes, ivBytes);
        decipher.setAutoPadding(true);
        const streamUrl = Buffer.concat([decipher.update(Buffer.from(encStream, 'base64')), decipher.final()]).toString('utf8').trim();
        if (http(streamUrl)) {
          out.push(stream('LeoTV', row.title, streamUrl, playerUrl, { 'User-Agent': UA, Referer: playerUrl }));
        }
      } catch {}
    }
    return out;
  } catch {
    return [];
  }
}

export async function getLegacyStreams(wioChannel) {
  const settled = await Promise.allSettled([domates(wioChannel), inatBox(wioChannel), patron(wioChannel), vion(wioChannel), jest(wioChannel), papaz(wioChannel), cifd2m(wioChannel), atomspor(wioChannel), newtv(wioChannel), beyazelma(wioChannel), leotv(wioChannel), ...SOURCES.map(source => genericSource(source, wioChannel))]);
  const out = []; for (const item of settled) if (item.status === 'fulfilled') out.push(...item.value);
  const seen = new Set(); return out.filter(x => x.url && !seen.has(x.url) && seen.add(x.url));
}
