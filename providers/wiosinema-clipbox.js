/* SPDX-License-Identifier: GPL-3.0-only
 * GENERATED from Wiojelt/TurkSinema-Source ClipBoxProvider.kt.
 */
"use strict";
var HOST="https://vixsrc.to";
var UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
function headers(){return{"User-Agent":UA,"Referer":HOST+"/","Accept":"application/json, text/javascript, */*; q=0.01"};}
function getStreams(tmdbId,mediaType,season,episode){var isTv=mediaType==="tv"&&season!=null&&episode!=null;var path=isTv?"/api/tv/"+encodeURIComponent(String(tmdbId))+"/"+encodeURIComponent(String(season))+"/"+encodeURIComponent(String(episode)):"/api/movie/"+encodeURIComponent(String(tmdbId));return fetch(HOST+path,{headers:headers()}).then(function(r){return r.ok?r.json():null;}).then(function(payload){if(!payload||!payload.src)return[];var pageUrl=/^https?:/i.test(payload.src)?payload.src:HOST+payload.src;return fetch(pageUrl,{headers:headers()}).then(function(r){return r.ok?r.text():"";});}).then(function(html){if(!html||Array.isArray(html))return[];var s=/(?:url|file)\s*:\s*['"]([^'"]+)['"]/.exec(html),t=/['"]?token['"]?\s*:\s*['"]([^'"]+)['"]/.exec(html),e=/['"]?expires['"]?\s*:\s*['"]([^'"]+)['"]/.exec(html);if(!s||!t||!e)return[];var stream=s[1],url=stream+(stream.indexOf("?")>=0?"&":"?")+"token="+encodeURIComponent(t[1])+"&expires="+encodeURIComponent(e[1])+"&h=1";return[{name:"WioSinema • ClipBox",title:"ClipBox • VixSrc • 1080p",url:url,quality:1080,provider:"wiosinema-clipbox",format:"m3u8",headers:{"User-Agent":UA,"Referer":HOST+"/"}}];}).catch(function(error){console.error("[WioSinema ClipBox] "+(error&&error.message?error.message:String(error)));return[];});}
module.exports={getStreams:getStreams};
