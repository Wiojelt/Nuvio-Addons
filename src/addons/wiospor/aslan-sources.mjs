import { createDecipheriv, createHash } from 'node:crypto';
import { ASLAN_SOURCES } from './source-registry.mjs';

const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
const MAX_PLAYLIST_BYTES = 25_000_000;
const LOAD_CONCURRENCY = 8;
const SEED = 'TurkSpor|Aslan|Wiojelt|registry-v1';

// Same encrypted bootstrap registry shipped by the upstream AslanTV plugin.
const BOOTSTRAP_HEX = [
'b98823b42c20fd50ab95ac42fe85cc6fca55259f3481d3630d7d50988cfe723a0d9d044952d42a18208c644d3c162634b23efdba8bfdbe873338db0eefacdfc5f9e2f43d7cf391043a5e824966cd3200',
'cec26aa9e2f581b55dbd8a7a304fe414a6403931128c5cdd43f046d5421c8b677e7720e2126a4f37af76f21c5620c4066ef6a16bc63ec0d95fb6232f0292d7f09cb2fc514ecd05c929e938b8b454de63',
'a0d73096311d25672125fdae7946891af901895f08aab10385dc8c09aab46febc1280134ca37b8ceda8b85699dd382c486017e3cbb8d05fa1882d5e0be47a1295914d5f751b1c96dbb6af2129933e812',
'9fa5cdb5836038359bcd03ea4b338e503b0a1f3010561e62aa52234284fec3cd214f2a0968e07d83d28a69cdedacc603fe11676c3e0b30cd47a91e01864e7647231777eb1b8959ae95cafc270da955f2',
'bac94363e56dfa55c721465878dbfc169b7731c8889a6e1840cababa3b14a66b2c3f41b9bc0631b450115d91777ca568ab57cc270631fad61ee449e38372e9b77d4daaa15798a76c030807712a820ea8',
'd3ec9930eff9c6ae26401ec32e4baf4920dfb19e284a161a2418adebe24176d917621050c2843742a0e048c0c7250229a9b8fc046f1ed601b368230ec932d351ba7ce1f758e33893721ed388edd845a1',
'183f83ace850cb396feb0255fe286488fb69e48d94f8a6a2b058c7647a2aa33b42f9a60fae715e280650f8e36a6a1324b1d0b32fd2476091173c8b8c78ddcdd6608e1ef8d65e2921e89e83d6f55361fd',
'e5ebc302fe37c70ba040492f8f9e14b5ca3019efed1a74e72e7eebcd0bba730d6c50c1fd236094171b021d323529fa62ca5c2c1afc26b063d7862f7ecb98e439266b327a80deb97c48e31a1d8136357c',
'93f37a30b89b901546eb379a67bbc9b5aca7dcefabf9e266b12f461ee36db47cd866f772774b0cce0ec476e6507a3088bcdf70e24fa7cf9dd7470fec9b843ce82627930a789f3a013bdc13bc4ac96e64',
'e50f7d967cecde4f645e5ba602f87c618a96990fa7e2542564099ad28cc65b9295314c884a510ab4d5b4c4f35b6680cfc32e1265ef8fa2855868a47747eb43dd371100705a7207059ce0c6d4933afa44',
'178a2cdd5e1e7ed90dde9df5339a033905c50214ccf33eea03cab3832b11bd40e428274d92e40ce9302c2a63dfef04df08dc0fbe18bbd5c34bd3828c907d61923f4d539f90ab614886dfb9e6b11dffaf',
'8b22d80e850c848ff877175eb823275b196dd269944fff9bf47429d032136312fcd9961a25e4d93f725e60134c16bdc117f4398e46894f8e4917806362cbfd570e15004ce0e551854c32430276fbeca3',
'd0cbc93b7f16e1da2d4ca2da3307501fefba32615eed97b4326be7131ff28d61ca6473a76bd26df52ef151fe7c61ec703e0ee3c3385f4006a5dd53224b0590e22dff1383c7ad16892622523292b9095a',
'e5118fcc946669ab6ec974132d4da8513804626a98ea6f4583a23d94d472bf276f6f7afdc7b32c1653b9614a3dd7872b4d32aa515612c25a4c43ffe73b8a5d61a8cef71fb54a54d2ede2832b996f1e41',
'250227b01cd3e82df85322d9ad9207f6537eb9b72be61fd126b6f868117511dc613ec5ae59f2980cfeb8648cc9a376bc0e0470e5905af648a7c601411afb9dd663034d285204fcc3bc4d625ce27ed218',
'3cbc2c9d5c65c9076e2316df1fb4ca64331757a6e435ed6c862a1692a3efc5a9199b3b19a26c99fac2d50f44381c2a4a555d557293d33b0f6a077642e11062df1ed8c31945d45d84a4c550f9f59d6f61',
'604322f73afc24205a61c70f8e190c780385b8b40a2891bf61df21aad13e35b0196107abf2d52eaa9314fc5546f7b0475af611429787b12dfc01f2ed0d8f0d2f592754072dc2c74c4dbee416eb24b209',
'abf4b798e0fb7a934ecc4b6be267bf60163c229e426ccd940c08ab252a7ca507b5a685e557bb4cc1f8950679d29bfab857c71008abf1c07ac264f37976b4cb4cfb9162f6cb6c90f774068511603ba187',
'6e4040d77623909a55296ac996cd0562766f0a685356b0d0b7e289073993bee6a85e60e17fcb06abcdde593695ef007b97137766345ce3419542892a09c0c5a73d13899c4b37f247bf48dcd8a9d4416c',
'8a3d0e2cd71b00d6c53d200d39f68afbc319d2839f0076633b35d45d4999887375c41a05d83fd101a48c4e1a99e0bbd2d152745b2f19a349df6add7010ee558905ce0011dea7b067d0fe82bb3171adc9',
'e68f5dea8670625207d9a84440a79c6ae551378367b744f04247940eeeb0a8c0925e0225a02d2a394cff94f6abf246e484cb31c986d6f167dfb044bdf8449af9bd99e4b63f722766a5ffe03693f7dc7d',
'd1a2ea22fc47f4ec8fb42cc570002ea6f084310f331aa2b6297e101279054dc18a8684a57e56afa164b2628eacd31c74b1dbed4cdcaaaebee7e2bad9d93b9fc25540dddfc4dcbf097efc9591734f0f78',
'c61b4ec974fb11b0d4687a35dd62d80254516d0bdc81a6995ad70c7c222595b50d87d1e0e64c75b03db3d1968e9c1ec9336994ee57eda3c8f6edfc65786abc5a2d5cf445cad9e3bbfe54d5e593cd7449',
'c1d1f53a6c844ba5d1567412038d00863f3525858ef09139873019c60d6a2e0f2d41a6fcf48995d3125aee9bae86763f463571c10eeba20275a5540768223d9dd545cb3e44fe7c1daca138b77d825bd6',
'b872a6d8963a0ec55f2d4ada7104855a3ccc7df26ce3de78d62f6f97d5f2ec951764d036a4bebbe8c998904accde48457b3906d76cc90d093a195db8919bddbbea99b9ff74f2ac96ad65f7d0e384e65f',
'12e1eeeee0501e4dc73aa1a63712d71bee7d57cf54a3f7197de4371d6add10ef3d8d128031b6c87d68b23913d89f27e6be83b76b6ca431459c240bd9d19fe68bc233bbe253c4fd8d264c26d0a6d5c10e',
'db76d1b66f58cd9bb2ff65f76cf643522d2a08e358be495a5c924bcc424aef3aa23fe426f8aa78805b3b8d0525334080d99c805332abdc2811b6e6282bdce77d26d3895ca3ffc3ed867531aacfd4c300',
'757dd12c6b64b6f14055c2d01077e0a4206b94604bb425e145f4af40e9cae0a6ef2dcf6e76148893c41bb626aa5ee073a8d1c128912014ae4161f938eb90ac3994ae9d000042cfbd121de44775ef7737',
'99564dc728e624daea934d870b438939153e34444420c67df6c27be1d06f111074c61811e498d66d938d79bc884099d8316a4a9f04071ff2ab3ac4119b3219b640ab6625a4b97eb3e52a288fa37ad271',
'c14e7c7f18b1e4393c77467be32a871e285812fe4160e313aa3f8e15c5dc7490de13c9fc4f8d2dc96ac01fd3be2530107b50a1231caa0cbe7f176be4482b6295c5588f0306774132218c209aea547a8f',
'7f6112a592cb1e4e76841b669bcf27cdfc63a3b4764d429f7e691237b15eff7fc6cb98a62f60f5ce026c541654b8e054b782b36e2159161f58caaaceaf449175a9fa7b41181ab7aab6079507fc3595af',
'365cee1402126b860118fbacbe25cb010ad56aeac70b25749d4ea9d14d8c8ea1684a5b5d40d9814371c34608e71f00248ae42aa659fe2f7339bdae45e93df28a476768f3b038c6e2c13bcdc62dd70f44',
'48ff5455aabe97e3be663b174f70aa92ec82c2e49410c08009964a4c7b86fbee8402d00a0f0d930e0057ee23924e58a882705d8bd38d3a56ce51b108c623e0e82b32ce4ec9bd2a8cd7f3c85c68a359df',
'd7ba7d23337e03fff76d07cc8cee935bab8cd432188beb79906862bc8c519744e21d537aae9fc9c5484d9933260f20bf5321a5db3c4df3390742df74dc244711176617c87f7d5705542fb95889756d3a',
'a5c12f18baf4f9da1d3838e14e4ea8bc3383e225bee5f54c1c7c12037384549772ed91539d2cb3381f3c162b10f20c63dc3bf190aebf32f786dfbaaaa49c76292a24'
].join('');

function fold(value) {
  return String(value || '').toLowerCase().replaceAll('ı', 'i').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}
function normalize(value) {
  return String(value || '').toLowerCase()
    .replaceAll('ı','i').replaceAll('ğ','g').replaceAll('ü','u').replaceAll('ş','s').replaceAll('ö','o').replaceAll('ç','c')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(?:1080p|720p|576p|540p|480p|360p|fhd|uhd|hd|sd|4k|50fps|60fps|7\/24|24\/7)\b/g, ' ')
    .replace(/\bsports\b/g, 'sport').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function compact(value) { return normalize(value).replace(/\s+/g, ''); }
function lastNumber(value) { return [...normalize(value).matchAll(/\b(\d+)\b/g)].at(-1)?.[1] || ''; }
function safeHttp(value) {
  try {
    const u = new URL(String(value || '').trim());
    if (!['http:', 'https:'].includes(u.protocol) || !u.hostname || ['localhost','127.0.0.1','0.0.0.0','::1'].includes(u.hostname) || u.hostname.startsWith('127.')) return '';
    return u.toString();
  } catch { return ''; }
}

export function decodeAslanRegistry() {
  const bytes = Buffer.from(BOOTSTRAP_HEX, 'hex');
  if (bytes.length <= 28) throw new Error('Invalid Aslan bootstrap payload');
  const key = createHash('sha256').update(SEED, 'utf8').digest();
  const iv = bytes.subarray(0, 12);
  const tag = bytes.subarray(bytes.length - 16);
  const encrypted = bytes.subarray(12, bytes.length - 16);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  const root = JSON.parse(plain);
  if (!Array.isArray(root) || root.length > 100) throw new Error('Invalid Aslan registry');
  const out = [];
  for (const row of root) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    for (const [title, rawUrl] of Object.entries(row)) {
      const url = safeHttp(rawUrl);
      if (url) out.push({ id: fold(title), title, url });
    }
  }
  return [...new Map(out.map(item => [item.id, item])).values()];
}

function mirrors(value) {
  const url = safeHttp(value); if (!url) return [];
  try {
    const u = new URL(url);
    if (u.hostname !== 'raw.githubusercontent.com') return [url];
    const parts = u.pathname.replace(/^\//, '').split('/');
    if (parts.length < 4) return [url];
    let tail = parts.slice(2);
    if (tail[0] === 'refs' && tail[1] === 'heads') tail = tail.slice(2);
    if (tail.length < 2) return [url];
    const cdn = `https://cdn.jsdelivr.net/gh/${parts[0]}/${parts[1]}@${tail[0]}/${tail.slice(1).join('/')}`;
    return [url, cdn];
  } catch { return [url]; }
}

function extinfTitle(line) {
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') quoted = !quoted;
    else if (line[i] === ',' && !quoted) return line.slice(i + 1).trim();
  }
  return '';
}
function attrs(line) {
  const out = {};
  for (const match of line.matchAll(/([\w-]+)=(?:"([^"]*)"|'([^']*)')/g)) out[match[1].toLowerCase()] = match[2] ?? match[3] ?? '';
  return out;
}
function canonicalHeader(key) {
  switch (fold(key)) {
    case 'useragent': case 'httpuseragent': return 'User-Agent';
    case 'referer': case 'referrer': case 'httpreferer': case 'httpreferrer': return 'Referer';
    case 'origin': case 'httporigin': return 'Origin';
    case 'cookie': case 'httpcookie': return 'Cookie';
    default: return '';
  }
}
function putHeader(headers, key, value) {
  const name = canonicalHeader(key);
  const clean = String(value || '');
  if (name && clean && clean.length < 4096 && !/[\r\n]/.test(clean)) headers[name] = clean;
}
function urlAndPipeHeaders(line, baseHeaders) {
  const [rawUrl, rawPipe = ''] = String(line || '').split('|', 2);
  const url = safeHttp(rawUrl); if (!url) return null;
  const headers = { ...baseHeaders };
  for (const part of rawPipe.split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    const key = eq >= 0 ? part.slice(0, eq) : part;
    let value = eq >= 0 ? part.slice(eq + 1) : '';
    try { value = decodeURIComponent(value); } catch {}
    putHeader(headers, key, value);
  }
  return { url, headers };
}

export function parseAslanM3u(text) {
  const body = String(text || '');
  if (Buffer.byteLength(body, 'utf8') > MAX_PLAYLIST_BYTES) return [];
  const start = body.replace(/^\uFEFF/, '').trimStart();
  if (!start.startsWith('#EXTM3U') && !start.startsWith('#EXTINF:')) return [];
  let current = null;
  const rows = [];
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (/^#EXTINF:/i.test(line)) {
      const a = attrs(line);
      const durationText = line.slice(line.indexOf(':') + 1).split(/[ ,]/, 1)[0];
      const duration = Number(durationText);
      const title = extinfTitle(line) || a['tvg-name'] || a['tvg-id'] || '';
      const group = a['group-title'] || '';
      const blocked = (Number.isFinite(duration) && duration > 0) || /(?:^|[ _-])(dizi|movie|series|radyo|radio|xxx|adult)(?:$|[ _-])/i.test(group);
      current = { title, id: a['tvg-id'] || fold(title), group, label: title, headers: {}, blocked };
      continue;
    }
    if (!current) continue;
    if (/^#EXTVLCOPT:/i.test(line)) {
      const option = line.slice(line.indexOf(':') + 1), eq = option.indexOf('=');
      putHeader(current.headers, eq >= 0 ? option.slice(0, eq) : option, eq >= 0 ? option.slice(eq + 1) : '');
      continue;
    }
    if (/^#KODIPROP:/i.test(line) && /license/i.test(line)) { current.blocked = true; continue; }
    if (!line || line.startsWith('#')) continue;
    const item = current; current = null;
    if (item.blocked || !item.title) continue;
    const parsed = urlAndPipeHeaders(line, item.headers); if (!parsed) continue;
    if (/\.mpd(?:$|[?#])/i.test(new URL(parsed.url).pathname + new URL(parsed.url).search)) continue;
    rows.push({ title: item.title, id: item.id || fold(item.title), group: item.group, label: item.label, url: parsed.url, headers: parsed.headers });
  }
  const grouped = new Map();
  for (const row of rows) {
    const key = fold(row.title) || fold(row.id); if (!key) continue;
    const existing = grouped.get(key) || { id: key, title: row.title, group: row.group, players: [] };
    const playerKey = row.url + JSON.stringify(row.headers);
    if (!existing.players.some(p => p._key === playerKey)) existing.players.push({ url: row.url, headers: row.headers, label: row.label, _key: playerKey });
    grouped.set(key, existing);
  }
  return [...grouped.values()].map(row => ({ ...row, players: row.players.map(({ _key, ...player }) => player) }));
}

export function matchAslanChannel(wioChannel, row) {
  const targets = [wioChannel?.standardTitle, wioChannel?.name, ...(wioChannel?.aliases || [])].filter(Boolean);
  const candidates = [row?.title, row?.id, row?.group ? `${row.title || ''} ${row.group}` : ''].filter(Boolean);
  for (const candidate of candidates) {
    const cc = compact(candidate), cn = lastNumber(candidate); if (!cc) continue;
    for (const target of targets) {
      const tt = compact(target), tn = lastNumber(target); if (!tt) continue;
      if (tn && cn && tn !== cn) continue;
      if (cc === tt || (Math.min(cc.length, tt.length) >= 4 && (cc.includes(tt) || tt.includes(cc)))) return true;
    }
  }
  return false;
}

function qualityHint(label) {
  const value = String(label || '').toLowerCase();
  if (/2160|4k|uhd/.test(value)) return 2160;
  if (/1440/.test(value)) return 1440;
  if (/1080|fhd/.test(value)) return 1080;
  if (/720|\bhd\b/.test(value)) return 720;
  if (/576/.test(value)) return 576;
  if (/540/.test(value)) return 540;
  if (/480/.test(value)) return 480;
  if (/360/.test(value)) return 360;
  return 0;
}
function streamItem(source, row, player) {
  const request = { 'User-Agent': player.headers?.['User-Agent'] || UA };
  for (const key of ['Referer','Origin','Cookie']) if (player.headers?.[key]) request[key] = player.headers[key];
  const quality = qualityHint(player.label || row.title);
  return {
    name: `WioSpor • Aslan • ${source.title}`,
    title: `${row.title}${quality ? ` • ${quality}p` : ' • Auto'}`,
    url: player.url,
    behaviorHints: { notWebReady: true, proxyHeaders: { request } }
  };
}

async function fetchPlaylist(url) {
  const response = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(15000) });
  if (!response.ok) return '';
  const length = Number(response.headers.get('content-length') || 0);
  if (length > MAX_PLAYLIST_BYTES) return '';
  const body = await response.text();
  return Buffer.byteLength(body, 'utf8') <= MAX_PLAYLIST_BYTES ? body : '';
}

let catalogPromise = null;
async function loadAllSources() {
  const registry = new Map(decodeAslanRegistry().map(item => [item.id, item]));
  const result = new Map();
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= ASLAN_SOURCES.length) return;
      const source = ASLAN_SOURCES[index];
      const entry = registry.get(source.sourceId);
      if (!entry) { result.set(source.sourceId, []); continue; }
      let channels = [];
      for (const url of mirrors(entry.url)) {
        try {
          const body = await fetchPlaylist(url);
          channels = parseAslanM3u(body);
          if (channels.length) break;
        } catch {}
      }
      result.set(source.sourceId, channels);
    }
  }
  await Promise.all(Array.from({ length: LOAD_CONCURRENCY }, () => worker()));
  return result;
}

export async function getAslanStreams(wioChannel) {
  if (!catalogPromise) catalogPromise = loadAllSources().catch(error => { catalogPromise = null; throw error; });
  let catalogs;
  try { catalogs = await catalogPromise; } catch { return []; }
  const out = [];
  const seen = new Set();
  for (const source of ASLAN_SOURCES) {
    const rows = catalogs.get(source.sourceId) || [];
    const match = rows.find(row => matchAslanChannel(wioChannel, row));
    if (!match) continue;
    const players = [...match.players].sort((a, b) => qualityHint(b.label) - qualityHint(a.label)).slice(0, 3);
    for (const player of players) {
      if (!safeHttp(player.url) || seen.has(player.url)) continue;
      seen.add(player.url);
      out.push(streamItem(source, match, player));
    }
  }
  return out;
}
