/* SPDX-License-Identifier: GPL-3.0-only
 * Nuvio port of WioSinema/CineStream invokeVidFastPro.
 */
"use strict";

var VIDFAST = "https://vidfast.vc";
var DECRYPT = "https://enc-dec.app/api";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

function headers() {
  return { "User-Agent": UA, "Referer": VIDFAST + "/", "X-Requested-With": "XMLHttpRequest" };
}
function parseJson(text) { try { return JSON.parse(text); } catch (_) { return null; } }
function post(url, payload, h) {
  var hdr = Object.assign({ "Content-Type": "application/json" }, h || {});
  return fetch(url, { method: "POST", headers: hdr, body: payload == null ? undefined : JSON.stringify(payload) })
    .then(function (r) { return r.ok ? r.text() : ""; });
}
function encryptedToken(text) {
  var a = /\\\"(?:en|token)\\\":\\\"(.*?)\\\"/.exec(text || "");
  if (a) return a[1];
  var b = /[\"](?:en|token)[\"]\s*:\s*[\"]([^\"]+)[\"]/.exec(text || "");
  return b ? b[1] : null;
}
function dec(text) {
  return post(DECRYPT + "/dec-vidfast", { text: text }).then(parseJson);
}
function resultOf(obj) { return obj && obj.result != null ? obj.result : null; }

function resolveServer(server, streamBase, requestHeaders) {
  if (!server || !server.data) return Promise.resolve([]);
  var endpoint = streamBase.replace(/\/$/, "") + "/" + server.data;
  return post(endpoint, null, requestHeaders)
    .then(function (encrypted) { return encrypted ? dec(encrypted) : null; })
    .then(function (decoded) {
      var data = resultOf(decoded);
      if (!data || !data.url) return [];
      var q = data.is4kAvailable === true || /4k/i.test(server.description || "") ? 2160 : 1080;
      var url = data.url;
      return [{
        name: "WioSinema • VidFastPro",
        title: "VidFastPro • " + (server.name || "Server") + (server.description ? " • " + server.description : ""),
        url: url,
        quality: q,
        provider: "wiosinema-vidfastpro",
        format: url.indexOf(".m3u8") >= 0 ? "m3u8" : "video",
        headers: { "User-Agent": UA, "Referer": VIDFAST + "/", "X-Requested-With": "XMLHttpRequest" }
      }];
    }).catch(function () { return []; });
}

function getStreams(tmdbId, mediaType, season, episode) {
  if (tmdbId == null) return Promise.resolve([]);
  var isTv = mediaType === "tv" && season != null && episode != null;
  var page = isTv
    ? VIDFAST + "/tv/" + encodeURIComponent(String(tmdbId)) + "/" + encodeURIComponent(String(season)) + "/" + encodeURIComponent(String(episode)) + "/"
    : VIDFAST + "/movie/" + encodeURIComponent(String(tmdbId)) + "/";
  return fetch(page, { headers: headers() })
    .then(function (r) { return r.ok ? r.text() : ""; })
    .then(function (body) {
      var token = encryptedToken(body); if (!token) return null;
      return fetch(DECRYPT + "/enc-vidfast?text=" + encodeURIComponent(token)).then(function (r) { return r.ok ? r.text() : ""; });
    })
    .then(function (initialText) {
      if (!initialText) return [];
      var initial = resultOf(parseJson(initialText));
      if (!initial || !initial.servers || !initial.stream || !initial.token) return [];
      var h = Object.assign({}, headers(), { "X-CSRF-Token": initial.token });
      return post(initial.servers, null, h)
        .then(function (encrypted) { return encrypted ? dec(encrypted) : null; })
        .then(function (decoded) {
          var servers = resultOf(decoded); if (!Array.isArray(servers)) return [];
          return Promise.all(servers.map(function (server) { return resolveServer(server, initial.stream, h); }))
            .then(function (groups) {
              var out = [], seen = {};
              groups.forEach(function (g) { g.forEach(function (x) { if (x.url && !seen[x.url]) { seen[x.url] = true; out.push(x); } }); });
              return out;
            });
        });
    })
    .catch(function (e) { console.error("[WioSinema VidFastPro] " + (e && e.message ? e.message : String(e))); return []; });
}

module.exports = { getStreams: getStreams };
