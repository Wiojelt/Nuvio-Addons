/* SPDX-License-Identifier: GPL-3.0-only
 * Nuvio/Hermes port of WioSinema/CineStream invokeHexa.
 * Decryption follows the upstream public HTTP decrypt service; no Node crypto module is used.
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
      if (!encrypted) return null;
      return postJson(DECRYPT_API + "/dec-hexa", { text: encrypted, key: key });
    })
    .then(function (decodedText) {
      if (!decodedText) return [];
      var decoded = parseJson(decodedText);
      var sources = decoded && decoded.result && decoded.result.sources;
      if (!Array.isArray(sources)) return [];
      var seen = {};
      var out = [];
      sources.forEach(function (source) {
        if (!source || !source.url || seen[source.url]) return;
        seen[source.url] = true;
        var server = source.server || "Server";
        out.push({
          name: "WioSinema • Hexa",
          title: "Hexa • " + server,
          url: source.url,
          quality: 1080,
          provider: "wiosinema-hexa",
          format: String(source.url).indexOf(".m3u8") >= 0 ? "m3u8" : "video",
          headers: { "User-Agent": UA, "Referer": HEXA_REFERER }
        });
      });
      return out;
    })
    .catch(function (error) {
      console.error("[WioSinema Hexa] " + (error && error.message ? error.message : String(error)));
      return [];
    });
}

module.exports = { getStreams: getStreams };
