/* SPDX-License-Identifier: GPL-3.0-only
 * Bootstrap Nuvio port of WioSinema ClipBox/VixSrc direct TMDB route.
 * After the first upstream sync this file is regenerated from source.
 */
"use strict";

var HOST = "https://vixsrc.to";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

function headers() {
  return {
    "User-Agent": UA,
    "Referer": HOST + "/",
    "Accept": "application/json, text/javascript, */*; q=0.01"
  };
}

function getStreams(tmdbId, mediaType, season, episode) {
  var isTv = mediaType === "tv" && season != null && episode != null;
  var path = isTv
    ? "/api/tv/" + encodeURIComponent(String(tmdbId)) + "/" + encodeURIComponent(String(season)) + "/" + encodeURIComponent(String(episode))
    : "/api/movie/" + encodeURIComponent(String(tmdbId));

  return fetch(HOST + path, { headers: headers() })
    .then(function (response) {
      if (!response.ok) return null;
      return response.json();
    })
    .then(function (payload) {
      if (!payload || !payload.src) return [];
      var pageUrl = /^https?:/i.test(payload.src) ? payload.src : HOST + payload.src;
      return fetch(pageUrl, { headers: headers() })
        .then(function (response) { return response.ok ? response.text() : ""; });
    })
    .then(function (html) {
      if (!html || Array.isArray(html)) return [];
      var streamMatch = /(?:url|file)\s*:\s*['\"]([^'\"]+)['\"]/.exec(html);
      var tokenMatch = /['\"]?token['\"]?\s*:\s*['\"]([^'\"]+)['\"]/.exec(html);
      var expiresMatch = /['\"]?expires['\"]?\s*:\s*['\"]([^'\"]+)['\"]/.exec(html);
      if (!streamMatch || !tokenMatch || !expiresMatch) return [];
      var stream = streamMatch[1];
      var url = stream + (stream.indexOf("?") >= 0 ? "&" : "?") +
        "token=" + encodeURIComponent(tokenMatch[1]) +
        "&expires=" + encodeURIComponent(expiresMatch[1]) + "&h=1";
      return [{
        name: "WioSinema • ClipBox",
        title: "ClipBox • VixSrc • 1080p",
        url: url,
        quality: 1080,
        provider: "wiosinema-clipbox",
        format: "m3u8",
        headers: { "User-Agent": UA, "Referer": HOST + "/" }
      }];
    })
    .catch(function (error) {
      console.error("[WioSinema ClipBox] " + (error && error.message ? error.message : String(error)));
      return [];
    });
}

module.exports = { getStreams: getStreams };
