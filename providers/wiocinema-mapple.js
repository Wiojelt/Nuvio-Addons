/* SPDX-License-Identifier: GPL-3.0-only
 * WioCinema Mapple Provider (Multi-source Global Route)
 */
"use strict";

var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

function parseJson(text) { try { return JSON.parse(text); } catch (_) { return null; } }
function getText(url, headers) {
  return fetch(url, { headers: headers || { "User-Agent": UA } }).then(function (r) { return r.ok ? r.text() : ""; });
}

function resolveVixSrc(tmdbId, mediaType, season, episode) {
  var isTv = mediaType === "tv" && season != null && episode != null;
  var path = isTv
    ? "https://vixsrc.to/api/tv/" + encodeURIComponent(String(tmdbId)) + "/" + encodeURIComponent(String(season)) + "/" + encodeURIComponent(String(episode))
    : "https://vixsrc.to/api/movie/" + encodeURIComponent(String(tmdbId));
  var h = { "User-Agent": UA, "Referer": "https://vixsrc.to/", "Accept": "application/json" };

  return getText(path, h)
    .then(parseJson)
    .then(function (payload) {
      if (!payload || !payload.src) return [];
      var pageUrl = /^https?:/i.test(payload.src) ? payload.src : "https://vixsrc.to" + payload.src;
      return getText(pageUrl, h);
    })
    .then(function (html) {
      if (!html) return [];
      var s = /(?:url|file)\s*:\s*['"]([^'"]+)['"]/.exec(html);
      var t = /['"]?token['"]?\s*:\s*['"]([^'"]+)['"]/.exec(html);
      var e = /['"]?expires['"]?\s*:\s*['"]([^'"]+)['"]/.exec(html);
      if (!s || !t || !e) return [];
      var url = s[1] + (s[1].indexOf("?") >= 0 ? "&" : "?") + "token=" + encodeURIComponent(t[1]) + "&expires=" + encodeURIComponent(e[1]) + "&h=1";
      return [{
        name: "WioCinema • Mapple",
        title: "Mapple • VixSrc • 1080p",
        url: url,
        quality: 1080,
        provider: "wiocinema-mapple",
        format: "m3u8",
        headers: { "User-Agent": UA, "Referer": "https://vixsrc.to/" }
      }];
    }).catch(function () { return []; });
}

function resolveVidSrc(tmdbId, mediaType, season, episode) {
  var isTv = mediaType === "tv" && season != null && episode != null;
  var embedUrl = isTv
    ? "https://vidsrc.me/embed/tv?tmdb=" + encodeURIComponent(String(tmdbId)) + "&season=" + encodeURIComponent(String(season)) + "&episode=" + encodeURIComponent(String(episode))
    : "https://vidsrc.me/embed/movie?tmdb=" + encodeURIComponent(String(tmdbId));
  return Promise.resolve([{
    name: "WioCinema • Mapple",
    title: "Mapple • VidSrc • 1080p",
    url: embedUrl,
    quality: 1080,
    provider: "wiocinema-mapple",
    format: "video",
    headers: { "User-Agent": UA, "Referer": "https://vidsrc.me/" }
  }]);
}

function resolveVideasy(tmdbId, mediaType, season, episode) {
  var isTv = mediaType === "tv" && season != null && episode != null;
  var embedUrl = isTv
    ? "https://player.videasy.net/tv/" + encodeURIComponent(String(tmdbId)) + "/" + encodeURIComponent(String(season)) + "/" + encodeURIComponent(String(episode))
    : "https://player.videasy.net/movie/" + encodeURIComponent(String(tmdbId));
  return Promise.resolve([{
    name: "WioCinema • Mapple",
    title: "Mapple • Videasy • 1080p",
    url: embedUrl,
    quality: 1080,
    provider: "wiocinema-mapple",
    format: "video",
    headers: { "User-Agent": UA, "Referer": "https://player.videasy.net/" }
  }]);
}

function getStreams(tmdbId, mediaType, season, episode) {
  if (tmdbId == null) return Promise.resolve([]);
  return Promise.all([
    resolveVixSrc(tmdbId, mediaType, season, episode),
    resolveVidSrc(tmdbId, mediaType, season, episode),
    resolveVideasy(tmdbId, mediaType, season, episode)
  ]).then(function (results) {
    var out = [];
    results.forEach(function (list) { list.forEach(function (x) { if (x && x.url) out.push(x); }); });
    return out;
  }).catch(function (error) {
    console.error("[WioCinema Mapple] " + (error && error.message ? error.message : String(error)));
    return [];
  });
}

module.exports = { getStreams: getStreams };
