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

function resolveVidSrcMe(tmdbId, mediaType, season, episode) {
  var isTv = mediaType === "tv" && season != null && episode != null;
  var url = isTv
    ? "https://vidsrc.me/embed/tv?tmdb=" + encodeURIComponent(String(tmdbId)) + "&season=" + encodeURIComponent(String(season)) + "&episode=" + encodeURIComponent(String(episode))
    : "https://vidsrc.me/embed/movie?tmdb=" + encodeURIComponent(String(tmdbId));
  return [{ name: "WioCinema • Mapple", title: "Mapple • VidSrc Me • 1080p", url: url, quality: 1080, provider: "wiocinema-mapple", format: "video", headers: { "User-Agent": UA, "Referer": "https://vidsrc.me/" } }];
}

function resolveVidSrcTo(tmdbId, mediaType, season, episode) {
  var isTv = mediaType === "tv" && season != null && episode != null;
  var url = isTv
    ? "https://vidsrc.to/embed/tv/" + encodeURIComponent(String(tmdbId)) + "/" + encodeURIComponent(String(season)) + "/" + encodeURIComponent(String(episode))
    : "https://vidsrc.to/embed/movie/" + encodeURIComponent(String(tmdbId));
  return [{ name: "WioCinema • Mapple", title: "Mapple • VidSrc To • 1080p", url: url, quality: 1080, provider: "wiocinema-mapple", format: "video", headers: { "User-Agent": UA, "Referer": "https://vidsrc.to/" } }];
}

function resolveVidSrcCc(tmdbId, mediaType, season, episode) {
  var isTv = mediaType === "tv" && season != null && episode != null;
  var url = isTv
    ? "https://vidsrc.cc/v3/embed/tv/" + encodeURIComponent(String(tmdbId)) + "/" + encodeURIComponent(String(season)) + "/" + encodeURIComponent(String(episode))
    : "https://vidsrc.cc/v3/embed/movie/" + encodeURIComponent(String(tmdbId));
  return [{ name: "WioCinema • Mapple", title: "Mapple • VidSrc CC • 1080p", url: url, quality: 1080, provider: "wiocinema-mapple", format: "video", headers: { "User-Agent": UA, "Referer": "https://vidsrc.cc/" } }];
}

function resolveVidLink(tmdbId, mediaType, season, episode) {
  var isTv = mediaType === "tv" && season != null && episode != null;
  var url = isTv
    ? "https://vidlink.pro/tv/" + encodeURIComponent(String(tmdbId)) + "/" + encodeURIComponent(String(season)) + "/" + encodeURIComponent(String(episode))
    : "https://vidlink.pro/movie/" + encodeURIComponent(String(tmdbId));
  return [{ name: "WioCinema • Mapple", title: "Mapple • VidLink • 1080p", url: url, quality: 1080, provider: "wiocinema-mapple", format: "video", headers: { "User-Agent": UA, "Referer": "https://vidlink.pro/" } }];
}

function resolveVidFast(tmdbId, mediaType, season, episode) {
  var isTv = mediaType === "tv" && season != null && episode != null;
  var url = isTv
    ? "https://www.vidfast.pro/tv/" + encodeURIComponent(String(tmdbId)) + "/" + encodeURIComponent(String(season)) + "/" + encodeURIComponent(String(episode))
    : "https://www.vidfast.pro/movie/" + encodeURIComponent(String(tmdbId));
  return [{ name: "WioCinema • Mapple", title: "Mapple • VidFast • 1080p", url: url, quality: 1080, provider: "wiocinema-mapple", format: "video", headers: { "User-Agent": UA, "Referer": "https://www.vidfast.pro/" } }];
}

function resolveVideasy(tmdbId, mediaType, season, episode) {
  var isTv = mediaType === "tv" && season != null && episode != null;
  var url = isTv
    ? "https://player.videasy.net/tv/" + encodeURIComponent(String(tmdbId)) + "/" + encodeURIComponent(String(season)) + "/" + encodeURIComponent(String(episode))
    : "https://player.videasy.net/movie/" + encodeURIComponent(String(tmdbId));
  return [{ name: "WioCinema • Mapple", title: "Mapple • Videasy • 1080p", url: url, quality: 1080, provider: "wiocinema-mapple", format: "video", headers: { "User-Agent": UA, "Referer": "https://player.videasy.net/" } }];
}

function resolveSmashy(tmdbId, mediaType, season, episode) {
  var isTv = mediaType === "tv" && season != null && episode != null;
  var url = isTv
    ? "https://embed.smashystream.com/playere.php?tmdb=" + encodeURIComponent(String(tmdbId)) + "&season=" + encodeURIComponent(String(season)) + "&episode=" + encodeURIComponent(String(episode))
    : "https://embed.smashystream.com/playere.php?tmdb=" + encodeURIComponent(String(tmdbId));
  return [{ name: "WioCinema • Mapple", title: "Mapple • SmashyStream • 1080p", url: url, quality: 1080, provider: "wiocinema-mapple", format: "video", headers: { "User-Agent": UA, "Referer": "https://embed.smashystream.com/" } }];
}

function resolveRive(tmdbId, mediaType, season, episode) {
  var isTv = mediaType === "tv" && season != null && episode != null;
  var url = isTv
    ? "https://rivestream.live/embed?type=tv&id=" + encodeURIComponent(String(tmdbId)) + "&season=" + encodeURIComponent(String(season)) + "&episode=" + encodeURIComponent(String(episode))
    : "https://rivestream.live/embed?type=movie&id=" + encodeURIComponent(String(tmdbId));
  return [{ name: "WioCinema • Mapple", title: "Mapple • RiveStream • 1080p", url: url, quality: 1080, provider: "wiocinema-mapple", format: "video", headers: { "User-Agent": UA, "Referer": "https://rivestream.live/" } }];
}

function resolveSuperEmbed(tmdbId, mediaType, season, episode) {
  var isTv = mediaType === "tv" && season != null && episode != null;
  var url = isTv
    ? "https://multiembed.mov/?video_id=" + encodeURIComponent(String(tmdbId)) + "&tmdb=1&s=" + encodeURIComponent(String(season)) + "&e=" + encodeURIComponent(String(episode))
    : "https://multiembed.mov/?video_id=" + encodeURIComponent(String(tmdbId)) + "&tmdb=1";
  return [{ name: "WioCinema • Mapple", title: "Mapple • SuperEmbed • 1080p", url: url, quality: 1080, provider: "wiocinema-mapple", format: "video", headers: { "User-Agent": UA, "Referer": "https://multiembed.mov/" } }];
}

function getStreams(tmdbId, mediaType, season, episode) {
  if (tmdbId == null) return Promise.resolve([]);
  return resolveVixSrc(tmdbId, mediaType, season, episode).then(function (vixList) {
    var staticServers = []
      .concat(resolveVidSrcMe(tmdbId, mediaType, season, episode))
      .concat(resolveVidSrcTo(tmdbId, mediaType, season, episode))
      .concat(resolveVidSrcCc(tmdbId, mediaType, season, episode))
      .concat(resolveVidLink(tmdbId, mediaType, season, episode))
      .concat(resolveVidFast(tmdbId, mediaType, season, episode))
      .concat(resolveVideasy(tmdbId, mediaType, season, episode))
      .concat(resolveSmashy(tmdbId, mediaType, season, episode))
      .concat(resolveRive(tmdbId, mediaType, season, episode))
      .concat(resolveSuperEmbed(tmdbId, mediaType, season, episode));
    var out = vixList.concat(staticServers);
    var seen = {}, filtered = [];
    out.forEach(function (x) {
      if (x && x.url && !seen[x.url]) {
        seen[x.url] = true;
        filtered.push(x);
      }
    });
    return filtered;
  }).catch(function (error) {
    console.error("[WioCinema Mapple] " + (error && error.message ? error.message : String(error)));
    return [];
  });
}

module.exports = { getStreams: getStreams };
