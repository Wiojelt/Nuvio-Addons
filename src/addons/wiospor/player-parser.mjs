/* SPDX-License-Identifier: GPL-3.0-only
 * JavaScript port of TurkSpor shared PlayerParser primitives.
 * It parses public player metadata only; it never evals page JavaScript.
 */

function httpsOnly(value) {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || !u.hostname || u.username || u.password) return null;
    if (u.port && u.port !== '443') return null;
    return u.toString();
  } catch { return null; }
}

function queryParam(url, key) {
  try { return new URL(url).searchParams.get(key); } catch { return null; }
}

function b64Bytes(value) {
  try { return Uint8Array.from(Buffer.from(value, 'base64')); } catch { return null; }
}

function b64Text(value) {
  try { return Buffer.from(value, 'base64').toString('utf8'); } catch { return null; }
}

export function wordpressEmbed(html, base) {
  const m = /\bdata-player-url\s*=\s*["']([^"']+)["']/i.exec(html);
  if (!m) return null;
  try {
    const raw = m[1].split('#')[0];
    return httpsOnly(new URL(raw, base).toString());
  } catch { return null; }
}

export function wordpressStream(html, player, session) {
  try {
    const id = queryParam(player, 'id');
    if (!id || !/^[0-9]{1,12}$/.test(id)) return null;
    const encoded = /window\.streamradardomil\s*=\s*\[atob\(["']([^"']+)["']\)/.exec(html)?.[1];
    if (!encoded) return null;
    const domain = b64Text(encoded)?.replace(/^\./, '');
    if (!domain) return null;
    const path = /streamradardomi\.substring\(1\)\s*\+\s*["']([^"']+)["']\s*\+\s*window\.mainSource/.exec(html)?.[1];
    if (!path) return null;
    const parsed = JSON.parse(session);
    const q = typeof parsed?.[5] === 'string' ? parsed[5] : '';
    if (q.length > 8192 || (q && !q.startsWith('?')) || /[\r\n#]/.test(q)) return null;
    return httpsOnly(`https://${domain}${path}${id}/playlist.m3u8${q}`);
  } catch { return null; }
}

export function domainEndpoint(html) {
  const value = /domainUrl\s*:\s*["'](https:\/\/[^"']+)["']/.exec(html)?.[1];
  return value ? httpsOnly(value) : null;
}

export function royalStream(json, player) {
  try {
    const id = queryParam(player, 'id');
    if (!id || !/^[a-zA-Z0-9_-]{1,80}$/.test(id)) return null;
    const base = httpsOnly(JSON.parse(json)?.baseurl);
    if (!base) return null;
    return `${base}${base.endsWith('/') ? '' : '/'}${id}/mono.m3u8`;
  } catch { return null; }
}

export function apiStream(json) {
  try { return httpsOnly(JSON.parse(json)?.URL || ''); } catch { return null; }
}

function decodeJsonStringToken(token) {
  try { return JSON.parse(token); } catch { return null; }
}

export function nextStreams(html, base) {
  const out = [];
  const push = /self\.__next_f\.push\(/g;
  let m;
  while ((m = push.exec(html))) {
    const start = m.index + m[0].length;
    let depth = 0, inString = false, esc = false, end = -1;
    for (let i = start; i < html.length; i++) {
      const c = html[i];
      if (inString) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inString = false;
      } else {
        if (c === '"') inString = true;
        else if (c === '[') depth++;
        else if (c === ']') { depth--; if (depth === 0) { end = i + 1; break; } }
      }
    }
    if (end < 0) continue;
    try {
      const arr = JSON.parse(html.slice(start, end));
      const chunk = typeof arr?.[1] === 'string' ? arr[1] : '';
      const fields = /"streamUrl(?:2)?"\s*:\s*("(?:\\.|[^"\\])*")/g;
      let f;
      while ((f = fields.exec(chunk))) {
        const value = decodeJsonStringToken(f[1]);
        if (!value) continue;
        if (value.startsWith('/api/stream?') || value.startsWith('/api/embed?')) {
          try { out.push(new URL(value, base).toString()); } catch {}
        } else {
          const safe = httpsOnly(value);
          if (safe) out.push(safe);
        }
      }
    } catch {}
  }
  return [...new Set(out)];
}

export function unpackNumeric(html) {
  try {
    if (html.length > 2_000_000) return null;
    const m = /\}\("([^"]+)",(\d+),"([^"]+)",(\d+),(\d+),(\d+)\)\)/.exec(html);
    if (!m) return null;
    const packed = m[1], alphabet = m[3], offset = Number(m[4]), radix = Number(m[5]);
    if (packed.length > 1_500_000 || radix < 2 || radix > 9 || alphabet.length <= radix || new Set(alphabet).size !== alphabet.length || offset < 0 || offset > 255) return null;
    const bytes = [];
    for (const word of packed.split(alphabet[radix])) {
      if (!word) continue;
      if (word.length > 12) return null;
      let digits = '';
      for (const c of word) {
        const idx = alphabet.indexOf(c);
        if (idx < 0 || idx >= radix) return null;
        digits += String(idx);
      }
      const code = Number.parseInt(digits, radix) - offset;
      if (!Number.isInteger(code) || code < 0 || code > 255) return null;
      bytes.push(code);
    }
    return Buffer.from(bytes).toString('utf8');
  } catch { return null; }
}

function scriptField(script, key) {
  return new RegExp(`\\b${key}\\s*=\\s*"([^"]*)"`).exec(script)?.[1] ?? null;
}

export function embeddedHls(html, page) {
  try {
    const script = html.includes('let EMBD_STREAMID') ? html : unpackNumeric(html);
    if (!script) return null;
    if (scriptField(script, 'EMBD_STREAMTYPE') !== 'hls' || (scriptField(script, 'EMBD_DRMTYPE') || '') !== '') return null;
    const id = scriptField(script, 'EMBD_STREAMID');
    if (!id || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) return null;
    const endpoint = scriptField(script, 'EMBD_PLAYERURL');
    if (!endpoint) return null;
    const encoded = /EMBD_AUTHTOKEN\s*=\s*\w+\("decrypt",\s*"([^"]*)"\)/.exec(script)?.[1];
    if (!encoded) return null;
    const parts = /let\s+s="([^"]+)";return\s+s\+=String\.fromCharCode\(([^)]+)\),s\+"([^"]+)"/.exec(script);
    if (!parts) return null;
    const chars = parts[2].split(',').map(x => Number(x.trim()));
    if (chars.some(n => !Number.isInteger(n) || n < 0 || n > 127)) return null;
    const key = parts[1] + chars.map(n => String.fromCharCode(n)).join('') + parts[3];
    if (!key || key.length > 2048 || encoded.length > 16384) return null;
    const encrypted = b64Bytes(encoded);
    if (!encrypted) return null;
    let token = '';
    for (let i = 0; i < encrypted.length; i++) token += String.fromCharCode(encrypted[i] ^ key.charCodeAt(i % key.length));
    if (/[\r\n#]/.test(token)) return null;
    const baseHref = /<base\s+[^>]*href\s*=\s*["']([^"']+)["']/i.exec(html)?.[1];
    const origin = new URL(baseHref || page, page);
    const target = new URL(endpoint, origin);
    return httpsOnly(`${target.toString()}?id=${encodeURIComponent(id)}&${token}&format=.m3u8`);
  } catch { return null; }
}
