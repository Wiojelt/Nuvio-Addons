import fs from 'node:fs/promises';

const DB = new URL('../../../generated/birdirbir/channels.json', import.meta.url);
let channelCache = null;

function norm(value) {
  return String(value || '')
    .toLowerCase()
    .replaceAll('ı', 'i').replaceAll('ğ', 'g').replaceAll('ü', 'u')
    .replaceAll('ş', 's').replaceAll('ö', 'o').replaceAll('ç', 'c')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(?:2160p|1440p|1080p|720p|576p|540p|480p|360p|uhd|fhd|hd|sd|4k|50fps|60fps|7\/24|24\/7)\b/g, ' ')
    .replace(/\bsports\b/g, 'sport')
    .replace(/[^a-z0-9+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function compact(value) { return norm(value).replace(/\s+/g, ''); }
function lastNumber(value) { return [...norm(value).matchAll(/\b([0-9]+)\b/g)].at(-1)?.[1] || ''; }

function brand(value) {
  const n = ` ${norm(value)} `;
  if (n.includes(' s sport plus ')) return 'ssportplus';
  if (n.includes(' s sport ')) return 'ssport';
  if (n.includes(' smart sport ')) return 'smartspor';
  if (n.includes(' bein sport ')) return 'bein';
  if (n.includes(' tivibu sport ')) return 'tivibu';
  if (n.includes(' tabii sport ')) return 'tabii';
  if (n.includes(' trt sport ')) return 'trtspor';
  if (n.includes(' euro sport ') || n.includes(' eurosport ')) return 'eurosport';
  if (n.includes(' a sport ')) return 'aspor';
  return '';
}

export function matchBirdirbirChannel(wioChannel, row) {
  const candidates = [row?.name, row?.id, row?.description].filter(Boolean);
  const targets = [wioChannel?.standardTitle, wioChannel?.name, ...(wioChannel?.aliases || [])].filter(Boolean);
  for (const candidate of candidates) {
    const cc = compact(candidate);
    if (!cc) continue;
    const cn = lastNumber(candidate);
    const cb = brand(candidate);
    for (const target of targets) {
      const tt = compact(target);
      if (!tt) continue;
      const tn = lastNumber(target);
      const tb = brand(target);
      if (tn && cn && tn !== cn) continue;
      if (tb && cb && tb !== cb) continue;
      if (cc === tt || (tt.length >= 4 && (cc.includes(tt) || tt.includes(cc)))) return true;
    }
  }
  return false;
}

function qualityLabel(value) {
  const q = String(value || '').toUpperCase();
  if (q === '4K') return '2160p';
  if (q === 'FHD') return '1080p';
  if (q === 'HD') return '720p';
  return '';
}

export function toBirdirbirStreams(channel) {
  const seen = new Set();
  const out = [];
  for (const source of Array.isArray(channel?.streams) ? channel.streams : []) {
    const url = String(source?.url || '').trim();
    if (!/^https?:\/\//i.test(url)) continue;
    const panel = String(source?.panel || 'BirdirbirIPTV').trim() || 'BirdirbirIPTV';
    const label = String(source?.label || channel?.name || panel).trim();
    const quality = qualityLabel(source?.quality);
    const key = `${panel}\0${label}\0${url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name: `Birdirbir • ${panel}`,
      title: `${label}${quality ? ` • ${quality}` : ''}`,
      url,
      behaviorHints: { notWebReady: true }
    });
  }
  return out;
}

export async function loadBirdirbirChannels() {
  if (channelCache) return channelCache;
  channelCache = JSON.parse(await fs.readFile(DB, 'utf8'));
  if (!Array.isArray(channelCache)) throw new Error('Birdirbir channel database is invalid');
  return channelCache;
}

export async function getBirdirbirStreams(wioChannel) {
  const channels = await loadBirdirbirChannels();
  return channels.filter(row => matchBirdirbirChannel(wioChannel, row)).flatMap(toBirdirbirStreams);
}

export function birdirbirPanelStats(channels) {
  const counts = {};
  for (const channel of channels || []) for (const source of channel?.streams || []) {
    const key = String(source?.panel || 'Unknown');
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}
