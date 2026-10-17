/* SPDX-License-Identifier: GPL-3.0-only
 * WioCinema FlixNetwork Provider
 */
"use strict";

var HOST = "https://flixnetwork.is";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

function resolveVix(tmdbId, mediaType, season, episode) {
  var isTv = mediaType === "tv" && season != null && episode != null;
  var path = isTv
    ? "https://vixsrc.to/api/tv/" + encodeURIComponent(String(tmdbId)) + "/" + encodeURIComponent(String(season)) + "/" + encodeURIComponent(String(episode))
    : "https://vixsrc.to/api/movie/" + encodeURIComponent(String(tmdbId));
  var h = { "User-Agent": UA, "Referer": "https://vixsrc.to/", "Accept": "application/json" };

  return fetch(path, { headers: h })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (payload) {
      if (!payload || !payload.src) return [];
      var pageUrl = /^https?:/i.test(payload.src) ? payload.src : "https://vixsrc.to" + payload.src;
      return fetch(pageUrl, { headers: h }).then(function (r) { return r.ok ? r.text() : ""; });
    })
    .then(function (html) {
      if (!html) return [];
      var s = /(?:url|file)\s*:\s*['"]([^'"]+)['"]/.exec(html);
      var t = /['"]?token['"]?\s*:\s*['"]([^'"]+)['"]/.exec(html);
      var e = /['"]?expires['"]?\s*:\s*['"]([^'"]+)['"]/.exec(html);
      if (!s || !t || !e) return [];
      var url = s[1] + (s[1].indexOf("?") >= 0 ? "&" : "?") + "token=" + encodeURIComponent(t[1]) + "&expires=" + encodeURIComponent(e[1]) + "&h=1";
      return [{
        name: "WioCinema • FlixNetwork",
        title: "FlixNetwork • Direct • 1080p [Multi-Sub]",
        url: url,
        quality: 1080,
        provider: "wiocinema-flixnetwork",
        format: "m3u8",
        headers: { "User-Agent": UA, "Referer": "https://vixsrc.to/" }
      }];
    }).catch(function () { return []; });
}

function getStreams(tmdbId, mediaType, season, episode) {
  if (tmdbId == null) return Promise.resolve([]);
  var isTv = mediaType === "tv" && season != null && episode != null;
  var pageUrl = isTv
    ? HOST + "/tv/" + encodeURIComponent(String(tmdbId)) + "/" + encodeURIComponent(String(season)) + "/" + encodeURIComponent(String(episode))
    : HOST + "/movie/" + encodeURIComponent(String(tmdbId));

  return fetch(pageUrl, { headers: { "User-Agent": UA, "Referer": HOST + "/" } })
    .then(function (r) { return r.ok ? r.text() : ""; })
    .then(function (html) {
      if (html) {
        var streamMatch = /(?:url|file|src)\s*[:=]\s*['"]([^'"]+\.(?:m3u8|mp4)[^'"]*)['"]/i.exec(html);
        if (streamMatch) {
          return [{
            name: "WioCinema • FlixNetwork",
            title: "FlixNetwork • Stream • 1080p",
            url: streamMatch[1],
            quality: 1080,
            provider: "wiocinema-flixnetwork",
            format: streamMatch[1].indexOf(".m3u8") >= 0 ? "m3u8" : "video",
            headers: { "User-Agent": UA, "Referer": HOST + "/" }
          }];
        }
      }
      return resolveVix(tmdbId, mediaType, season, episode).then(function (direct) {
        if (Array.isArray(direct) && direct.length > 0) return direct;
        return [{
          name: "WioCinema • FlixNetwork",
          title: "FlixNetwork • Player • 1080p",
          url: pageUrl,
          quality: 1080,
          provider: "wiocinema-flixnetwork",
          format: "video",
          headers: { "User-Agent": UA, "Referer": HOST + "/" }
        }];
      });
    }).catch(function (error) {
      console.error("[WioCinema FlixNetwork] " + (error && error.message ? error.message : String(error)));
      return [];
    });
}

if (typeof module !== "undefined" && module.exports) module.exports = { getStreams: getStreams };
if (typeof exports !== "undefined") exports.getStreams = getStreams;
if (typeof globalThis !== "undefined") globalThis.getStreams = getStreams;
