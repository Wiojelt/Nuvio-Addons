/* SPDX-License-Identifier: GPL-3.0-only
 * WioCinema Hexa direct TMDB route.
 */
"use strict";

var HEXA_API = "https://theemoviedb.hexa.su";
var DECRYPT_API = "https://enc-dec.app/api";
var HEXA_REFERER = "https://hexa.su/";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

function randomHex(bytes) {
  var out = "";
  for (var i = 0; i < bytes; i++) {
    var n = Math.floor(Math.random() * 256).toString(16);
    out += n.length === 1 ? "0" + n : n;
  }
  return out;
}

function parseJson(text) {
  try { return JSON.parse(text); } catch (_) { return null; }
}

function getText(url, headers) {
  return fetch(url, { headers: headers || {} }).then(function (r) { return r.ok ? r.text() : ""; });
}

function postJson(url, payload) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }).then(function (r) { return r.ok ? r.text() : ""; });
}

function getStreams(tmdbId, mediaType, season, episode) {
  if (tmdbId == null) return Promise.resolve([]);
  var isTv = mediaType === "tv" && season != null && episode != null;
  var url = isTv
    ? HEXA_API + "/api/tmdb/tv/" + encodeURIComponent(String(tmdbId)) + "/season/" + encodeURIComponent(String(season)) + "/episode/" + encodeURIComponent(String(episode)) + "/images"
    : HEXA_API + "/api/tmdb/movie/" + encodeURIComponent(String(tmdbId)) + "/images";

  var key = randomHex(32);
  return getText(DECRYPT_API + "/enc-hexa")
    .then(function (tokenText) {
      var tokenJson = parseJson(tokenText);
      var token = tokenJson && tokenJson.result && tokenJson.result.token;
      if (!token) return null;
      var headers = {
        "User-Agent": UA,
        "Accept": "text/plain",
        "X-Api-Key": key,
        "X-Fingerprint-Lite": "e9136c41504646444",
        "Referer": HEXA_REFERER,
        "X-Cap-Token": token
      };
      return getText(url, headers);
    })
    .then(function (encrypted) {
      if (!encrypted) return [];
      return postJson(DECRYPT_API + "/dec-hexa", { text: encrypted })
        .then(parseJson)
        .then(function (data) {
          var sources = data && data.result && data.result.sources;
          if (!Array.isArray(sources)) return [];
          var out = [], seen = {};
          for (var i = 0; i < sources.length; i++) {
            var item = sources[i];
            var streamUrl = item && item.url;
            if (!streamUrl || seen[streamUrl]) continue;
            seen[streamUrl] = true;
            out.push({
              name: "WioCinema • Hexa",
              title: "Hexa • " + (item.server || "Stream") + " • 1080p",
              url: streamUrl,
              quality: 1080,
              provider: "wiocinema-hexa",
              format: streamUrl.indexOf(".m3u8") >= 0 ? "m3u8" : "video",
              headers: { "User-Agent": UA, "Referer": HEXA_REFERER }
            });
          }
          return out;
        });
    })
    .catch(function (error) {
      console.error("[WioCinema Hexa] " + (error && error.message ? error.message : String(error)));
      return [];
    });
}

module.exports = { getStreams: getStreams };
