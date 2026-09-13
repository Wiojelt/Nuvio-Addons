import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const root = new URL('../', import.meta.url);
let aggregator = '';
let clipboxSource = '';
try { aggregator = await fs.readFile(new URL('.upstream-cache/turksinema-source/StreamAggregator.kt', root), 'utf8'); } catch {}
try { clipboxSource = await fs.readFile(new URL('.upstream-cache/turksinema-source/ClipBoxProvider.kt', root), 'utf8'); } catch {}

if (!aggregator || !clipboxSource) {
  await fs.mkdir(new URL('generated/wiosinema', root), { recursive: true });
  await fs.writeFile(new URL('generated/wiosinema/provider-registry.json', root), JSON.stringify({
    generatedAt: new Date().toISOString(),
    conversion: { working: ['Bootstrap ClipBox provider'], pending: ['Private TurkSinema-Source sync not configured'] },
    sourceSha256: null
  }, null, 2) + '\n');
  console.warn('TurkSinema private source cache missing; keeping bootstrap ClipBox provider.');
  process.exit(0);
}

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

const recommended = parseQuotedSet('RECOMMENDED_PROVIDERS', aggregator);
const directClasses = parseProviderConstructors('directTmdbProviders', aggregator);
const scraperClasses = parseProviderConstructors('scraperProviders', aggregator);

const b64 = clipboxSource.match(/Base64\.decode\("([A-Za-z0-9+/=]+)"/)?.[1];
if (!b64) throw new Error('ClipBox host marker changed; adapter requires review.');
const clipboxHost = Buffer.from(b64, 'base64').toString('utf8');
if (!/^https:\/\//.test(clipboxHost)) throw new Error(`Unexpected ClipBox host: ${clipboxHost}`);
for (const marker of ['/api/tv/', '/api/movie/', 'token=$token&expires=$expires&h=1']) {
  if (!clipboxSource.includes(marker)) throw new Error(`ClipBox upstream logic changed (missing ${marker}); refusing to publish stale translation.`);
}

const providerCode = `/* SPDX-License-Identifier: GPL-3.0-only\n * GENERATED from Wiojelt/TurkSinema-Source ClipBoxProvider.kt.\n */\n"use strict";\nvar HOST=${JSON.stringify(clipboxHost)};\nvar UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";\nfunction headers(){return{"User-Agent":UA,"Referer":HOST+"/","Accept":"application/json, text/javascript, */*; q=0.01"};}\nfunction getStreams(tmdbId,mediaType,season,episode){var isTv=mediaType==="tv"&&season!=null&&episode!=null;var path=isTv?"/api/tv/"+encodeURIComponent(String(tmdbId))+"/"+encodeURIComponent(String(season))+"/"+encodeURIComponent(String(episode)):"/api/movie/"+encodeURIComponent(String(tmdbId));return fetch(HOST+path,{headers:headers()}).then(function(r){return r.ok?r.json():null;}).then(function(payload){if(!payload||!payload.src)return[];var pageUrl=/^https?:/i.test(payload.src)?payload.src:HOST+payload.src;return fetch(pageUrl,{headers:headers()}).then(function(r){return r.ok?r.text():"";});}).then(function(html){if(!html||Array.isArray(html))return[];var s=/(?:url|file)\\s*:\\s*['\"]([^'\"]+)['\"]/.exec(html),t=/['\"]?token['\"]?\\s*:\\s*['\"]([^'\"]+)['\"]/.exec(html),e=/['\"]?expires['\"]?\\s*:\\s*['\"]([^'\"]+)['\"]/.exec(html);if(!s||!t||!e)return[];var stream=s[1],url=stream+(stream.indexOf("?")>=0?"&":"?")+"token="+encodeURIComponent(t[1])+"&expires="+encodeURIComponent(e[1])+"&h=1";return[{name:"WioSinema • ClipBox",title:"ClipBox • VixSrc • 1080p",url:url,quality:1080,provider:"wiosinema-clipbox",format:"m3u8",headers:{"User-Agent":UA,"Referer":HOST+"/"}}];}).catch(function(error){console.error("[WioSinema ClipBox] "+(error&&error.message?error.message:String(error)));return[];});}\nmodule.exports={getStreams:getStreams};\n`;

await fs.mkdir(new URL('providers', root), { recursive: true });
await fs.mkdir(new URL('generated/wiosinema', root), { recursive: true });
await fs.writeFile(new URL('providers/wiosinema-clipbox.js', root), providerCode, 'utf8');
await fs.writeFile(new URL('generated/wiosinema/provider-registry.json', root), JSON.stringify({
  generatedAt: new Date().toISOString(),
  sourceSha256: { streamAggregator: sha256(aggregator), clipBoxProvider: sha256(clipboxSource) },
  recommendedProviders: recommended,
  directProviderClasses: directClasses,
  scraperProviderClasses: scraperClasses,
  conversion: { working: ['ClipBox • VixSrc direct TMDB route'], pending: ['CineStream inherited resolvers', 'remaining direct TMDB providers', 'scraper/search providers'] }
}, null, 2) + '\n');
console.log(`Generated WioSinema ClipBox provider for ${clipboxHost}`);
