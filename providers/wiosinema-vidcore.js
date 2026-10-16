/* SPDX-License-Identifier: GPL-3.0-only
 * Nuvio port of WioSinema/CineStream invokeVidcore.
 */
"use strict";

var VIDCORE = "https://vidcore.io";
var DECRYPT = "https://enc-dec.app/api";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

function headers() {
  return { "User-Agent": UA, "Referer": VIDCORE + "/", "X-Requested-With": "XMLHttpRequest", "Accept": "*/*" };
}
function parseJson(text) { try { return JSON.parse(text); } catch (_) { return null; } }
function resultOf(obj) { return obj && obj.result != null ? obj.result : null; }
function post(url, payload, h) {
  var hdr = Object.assign({}, h || {});
  var body = undefined;
  if (payload != null) {
    hdr["Content-Type"] = "application/json";
    body = JSON.stringify(payload);
  }
  return fetch(url, { method: "POST", headers: hdr, body: body }).then(function (r) { return r.ok ? r.text() : ""; });
}
function tokenFrom(text) {
  var m = /\\\"(?:en|token)\\\":\\\"(.*?)\\\"/.exec(text || "");
  if (m) return m[1];
  m = /[\"](?:en|token)[\"]\s*:\s*[\"]([^\"]+)[\"]/.exec(text || "");
  return m ? m[1] : null;
}
function decrypt(text, h) { return post(DECRYPT + "/dec-vidcore", { text: text }, h).then(parseJson); }

function resolveServer(server, streamBase, h) {
  if (!server || !server.data) return Promise.resolve([]);
  var endpoint = streamBase.replace(/\/$/, "") + "/" + server.data;
  return post(endpoint, null, h)
    .then(function (encrypted) { return encrypted ? decrypt(encrypted, null) : null; })
    .then(function (decoded) {
      var data = resultOf(decoded); if (!data || !data.url) return [];
      var url = data.url;
      return [{
        name: "WioSinema • Vidcore",
        title: "Vidcore • " + (server.name || "Server"),
        url: url,
        quality: 1080,
        provider: "wiosinema-vidcore",
        format: url.indexOf(".m3u8") >= 0 ? "m3u8" : "video",
        headers: { "User-Agent": UA, "Referer": VIDCORE + "/" }
      }];
    }).catch(function () { return []; });
}

function getStreams(tmdbId, mediaType, season, episode) {
  if (tmdbId == null) return Promise.resolve([]);
  var isTv = mediaType === "tv" && season != null && episode != null;
  var page = isTv
    ? VIDCORE + "/tv/" + encodeURIComponent(String(tmdbId)) + "/" + encodeURIComponent(String(season)) + "/" + encodeURIComponent(String(episode))
    : VIDCORE + "/movie/" + encodeURIComponent(String(tmdbId));
  return fetch(page, { headers: { "User-Agent": UA, "Referer": VIDCORE + "/", "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" } })
    .then(function (r) { return r.ok ? r.text() : ""; })
    .then(function (html) {
      var encrypted = tokenFrom(html); if (!encrypted) return null;
      return fetch(DECRYPT + "/enc-vidcore?text=" + encodeURIComponent(encrypted) + "&stage=1", { headers: headers() })
        .then(function (r) { return r.ok ? r.text() : ""; });
    })
    .then(function (stage1Text) {
      if (!stage1Text) return null;
      var s1 = parseJson(stage1Text);
      var res = resultOf(s1);
      if (!res) return null;

      if (res.stage1) {
        var h1 = Object.assign({}, headers(), res.token ? { "X-CSRF-Token": res.token } : {});
        return post(res.stage1, null, h1)
          .then(function (p1Text) {
            if (!p1Text) return null;
            return fetch(DECRYPT + "/enc-vidcore?text=" + encodeURIComponent(p1Text) + "&stage=2", { headers: headers() })
              .then(function (r) { return r.ok ? r.text() : ""; });
          })
          .then(function (s2Text) {
            var s2 = parseJson(s2Text);
            return resultOf(s2);
          });
      }
      return res;
    })
    .then(function (initial) {
      if (!initial || !initial.servers || !initial.stream) return [];
      var h = Object.assign({}, headers(), initial.token ? { "X-CSRF-Token": initial.token } : {});
      return post(initial.servers, null, h)
        .then(function (encryptedServers) { return encryptedServers ? decrypt(encryptedServers, null) : null; })
        .then(function (serverData) {
          var servers = resultOf(serverData);
          if (!Array.isArray(servers)) return [];
          return Promise.all(servers.map(function (server) { return resolveServer(server, initial.stream, h); }))
            .then(function (groups) {
              var out = [], seen = {};
              groups.forEach(function (g) { g.forEach(function (x) { if (x.url && !seen[x.url]) { seen[x.url] = true; out.push(x); } }); });
              return out;
            });
        });
    })
    .catch(function (e) { console.error("[WioSinema Vidcore] " + (e && e.message ? e.message : String(e))); return []; });
}

module.exports = { getStreams: getStreams };
