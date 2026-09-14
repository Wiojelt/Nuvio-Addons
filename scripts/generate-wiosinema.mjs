import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const root = new URL('../', import.meta.url);
let aggregator = '';
let clipboxSource = '';
let apiConstants = '';
let cineExtractors = '';
try { aggregator = await fs.readFile(new URL('.upstream-cache/turksinema-source/StreamAggregator.kt', root), 'utf8'); } catch {}
try { clipboxSource = await fs.readFile(new URL('.upstream-cache/turksinema-source/ClipBoxProvider.kt', root), 'utf8'); } catch {}
try { apiConstants = await fs.readFile(new URL('.upstream-cache/turksinema-source/ApiConstants.kt', root), 'utf8'); } catch {}
try { cineExtractors = await fs.readFile(new URL('.upstream-cache/turksinema-source/CineStreamExtractors.kt', root), 'utf8'); } catch {}

function sha256(text) { return crypto.createHash('sha256').update(text).digest('hex'); }
function parseQuotedSet(blockName, text) {
  const start = text.indexOf(`${blockName} = setOf(`);
  if (start < 0) return [];
  const body = text.slice(start, text.indexOf(')', start) + 1);
  return [...body.matchAll(/"([^"]+)"/g)].map(m => m[1]);
}
function parseProviderConstructors(sectionName, text) {
  const start = text.indexOf(`val ${sectionName}:`);
  if (start < 0) return [];
  const end = text.indexOf('\n    val ', start + 5);
  const body = text.slice(start, end > start ? end : undefined);
  return [...body.matchAll(/runCatching\s*\{\s*([^\n{}]+?)\(.*?\)/g)].map(m => m[1].trim()).filter(Boolean);
}
function kotlinConst(name, text) {
  return text.match(new RegExp(`const\\s+val\\s+${name}\\s*=\\s*"([^"]+)"`))?.[1] || null;
}
async function rewriteConstants(file, replacements) {
  const path = new URL(file, root);
  let code = await fs.readFile(path, 'utf8');
  for (const [name, value] of Object.entries(replacements)) {
    if (!value) throw new Error(`${file}: missing upstream value for ${name}`);
    const re = new RegExp(`var ${name} = "[^"]+";`);
    if (!re.test(code)) throw new Error(`${file}: constant marker ${name} changed`);
    code = code.replace(re, `var ${name} = ${JSON.stringify(value)};`);
  }
  await fs.writeFile(path, code, 'utf8');
}
function requireMarkers(label, markers) {
  for (const marker of markers) if (!cineExtractors.includes(marker)) throw new Error(`${label} upstream contract changed (missing ${marker}); refusing stale translation.`);
}

await fs.mkdir(new URL('providers', root), { recursive: true });
await fs.mkdir(new URL('generated/wiosinema', root), { recursive: true });

const directWorking = [
  'ClipBox • VixSrc direct TMDB route',
  'CineStream • Vidup TMDB route',
  'CineStream • Hexa TMDB route',
  'CineStream • VidFastPro TMDB route',
  'CineStream • Vidcore TMDB route'
];

if (!aggregator || !clipboxSource) {
  await fs.writeFile(new URL('generated/wiosinema/provider-registry.json', root), JSON.stringify({
    generatedAt: new Date().toISOString(),
    conversion: {
      working: directWorking.map(x => `${x} (bootstrap)`),
      pending: ['Private TurkSinema-Source sync not configured; endpoint/contract guards skipped']
    },
    sourceSha256: null
  }, null, 2) + '\n');
  console.warn('TurkSinema private source cache missing; keeping bootstrap direct providers.');
  process.exit(0);
}

const recommended = parseQuotedSet('RECOMMENDED_PROVIDERS', aggregator);
const directClasses = parseProviderConstructors('directTmdbProviders', aggregator);
const scraperClasses = parseProviderConstructors('scraperProviders', aggregator);

const b64 = clipboxSource.match(/Base64\.decode\("([A-Za-z0-9+/=]+)"/)?.[1];
if (!b64) throw new Error('ClipBox host marker changed; adapter requires review.');
const clipboxHost = Buffer.from(b64, 'base64').toString('utf8');
if (!/^https:\/\//.test(clipboxHost)) throw new Error(`Unexpected ClipBox host: ${clipboxHost}`);
for (const marker of ['/api/tv/', '/api/movie/', 'token=$token&expires=$expires&h=1']) {
  if (!clipboxSource.includes(marker)) throw new Error(`ClipBox upstream logic changed (missing ${marker}); refusing stale translation.`);
}
const clipboxCode = `/* SPDX-License-Identifier: GPL-3.0-only\n * GENERATED from Wiojelt/TurkSinema-Source ClipBoxProvider.kt.\n */\n"use strict";\nvar HOST=${JSON.stringify(clipboxHost)};\nvar UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";\nfunction headers(){return{"User-Agent":UA,"Referer":HOST+"/","Accept":"application/json, text/javascript, */*; q=0.01"};}\nfunction getStreams(tmdbId,mediaType,season,episode){var isTv=mediaType==="tv"&&season!=null&&episode!=null;var path=isTv?"/api/tv/"+encodeURIComponent(String(tmdbId))+"/"+encodeURIComponent(String(season))+"/"+encodeURIComponent(String(episode)):"/api/movie/"+encodeURIComponent(String(tmdbId));return fetch(HOST+path,{headers:headers()}).then(function(r){return r.ok?r.json():null;}).then(function(payload){if(!payload||!payload.src)return[];var pageUrl=/^https?:/i.test(payload.src)?payload.src:HOST+payload.src;return fetch(pageUrl,{headers:headers()}).then(function(r){return r.ok?r.text():"";});}).then(function(html){if(!html||Array.isArray(html))return[];var s=/(?:url|file)\\s*:\\s*['\"]([^'\"]+)['\"]/.exec(html),t=/['\"]?token['\"]?\\s*:\\s*['\"]([^'\"]+)['\"]/.exec(html),e=/['\"]?expires['\"]?\\s*:\\s*['\"]([^'\"]+)['\"]/.exec(html);if(!s||!t||!e)return[];var stream=s[1],url=stream+(stream.indexOf("?")>=0?"&":"?")+"token="+encodeURIComponent(t[1])+"&expires="+encodeURIComponent(e[1])+"&h=1";return[{name:"WioSinema • ClipBox",title:"ClipBox • VixSrc • 1080p",url:url,quality:1080,provider:"wiosinema-clipbox",format:"m3u8",headers:{"User-Agent":UA,"Referer":HOST+"/"}}];}).catch(function(error){console.error("[WioSinema ClipBox] "+(error&&error.message?error.message:String(error)));return[];});}\nmodule.exports={getStreams:getStreams};\n`;
await fs.writeFile(new URL('providers/wiosinema-clipbox.js', root), clipboxCode, 'utf8');

let guarded = [];
if (apiConstants && cineExtractors) {
  const decryptApi = kotlinConst('multiDecryptAPI', apiConstants);

  requireMarkers('Vidup', ['suspend fun invokeVidup(', '$vidupAPI/tv/$tmdbId/$season/$episode', '$vidupAPI/movie/$tmdbId', '/enc-vidup?text=', '/dec-vidup']);
  await rewriteConstants('providers/wiosinema-vidup.js', { VIDUP: kotlinConst('vidupAPI', apiConstants), DECRYPT: decryptApi });
  guarded.push('Vidup');

  requireMarkers('Hexa', ['suspend fun invokeHexa(', '$hexaAPI/api/tmdb/movie/$tmdbId/images', '$hexaAPI/api/tmdb/tv/$tmdbId/season/$season/episode/$episode/images', '/enc-hexa', '/dec-hexa', 'X-Fingerprint-Lite']);
  await rewriteConstants('providers/wiosinema-hexa.js', { HEXA_API: kotlinConst('hexaAPI', apiConstants), DECRYPT_API: decryptApi });
  guarded.push('Hexa');

  requireMarkers('VidFastPro', ['suspend fun invokeVidFastPro(', '$vidfastProApi/movie/$tmdbId/', '$vidfastProApi/tv/$tmdbId/$season/$episode/', '/enc-vidfast?text=', '/dec-vidfast']);
  await rewriteConstants('providers/wiosinema-vidfastpro.js', { VIDFAST: kotlinConst('vidfastProApi', apiConstants), DECRYPT: decryptApi });
  guarded.push('VidFastPro');

  requireMarkers('Vidcore', ['suspend fun invokeVidcore(', '$vidcoreAPI/movie/$tmdbId', '$vidcoreAPI/tv/$tmdbId/$season/$episode', '/enc-vidcore?text=', '/dec-vidcore']);
  await rewriteConstants('providers/wiosinema-vidcore.js', { VIDCORE: kotlinConst('vidcoreAPI', apiConstants), DECRYPT: decryptApi });
  guarded.push('Vidcore');
}

await fs.writeFile(new URL('generated/wiosinema/provider-registry.json', root), JSON.stringify({
  generatedAt: new Date().toISOString(),
  sourceSha256: {
    streamAggregator: sha256(aggregator),
    clipBoxProvider: sha256(clipboxSource),
    apiConstants: apiConstants ? sha256(apiConstants) : null,
    cineStreamExtractors: cineExtractors ? sha256(cineExtractors) : null
  },
  recommendedProviders: recommended,
  directProviderClasses: directClasses,
  scraperProviderClasses: scraperClasses,
  conversion: {
    working: directWorking.map(x => guarded.some(g => x.includes(g)) ? `${x} (upstream guarded)` : x),
    pending: ['remaining CineStream providers', 'search/scraper providers']
  }
}, null, 2) + '\n');
console.log(`Generated WioSinema direct providers; guarded=${guarded.join(',') || 'none'}.`);
