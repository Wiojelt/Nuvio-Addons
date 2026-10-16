/* SPDX-License-Identifier: GPL-3.0-only
 * Bootstrap Nuvio port of WioSinema/CineStream invokeVidup.
 * Uses the same public HTTP decrypt service as the upstream provider, avoiding Node-only crypto.
 */
"use strict";

var VIDUP = "https://vidup.to";
var DECRYPT = "https://enc-dec.app/api";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

function baseHeaders() {
  return {
    "User-Agent": UA,
    "Referer": VIDUP + "/",
    "X-Requested-With": "XMLHttpRequest",
    "Accept": "*/*"
  };
}

function jsonPost(url, payload, headers) {
  var h = Object.assign({ "Content-Type": "application/json" }, headers || {});
  return fetch(url, { method: "POST", headers: h, body: JSON.stringify(payload) })
    .then(function (r) { return r.ok ? r.text() : ""; });
}

function emptyPost(url, headers) {
  return fetch(url, { method: "POST", headers: headers || {} })
    .then(function (r) { return r.ok ? r.text() : ""; });
}

function parseJson(text) {
  try { return JSON.parse(text); } catch (_) { return null; }
}

function extractEncryptedToken(text) {
  var escaped = /\\\"(?:en|token)\\\":\\\"(.*?)\\\"/.exec(text || "");
  if (escaped) return escaped[1];
  var normal = /[\"](?:en|token)[\"]\s*:\s*[\"]([^\"]+)[\"]/.exec(text || "");
  return normal ? normal[1] : null;
}

function decrypt(text) {
  return jsonPost(DECRYPT + "/dec-vidup", { text: text }, null)
    .then(parseJson);
}

function resolveServer(server, streamBase, postHeaders) {
  if (!server || !server.data) return Promise.resolve([]);
  var name = server.name || "Vidup";
  var streamUrl = streamBase.replace(/\/$/, "") + "/" + server.data;
  return emptyPost(streamUrl, postHeaders)
    .then(function (encrypted) { return encrypted ? decrypt(encrypted) : null; })
    .then(function (decoded) {
      if (!decoded || decoded.status !== 200 || !decoded.result || !decoded.result.url) return [];
      var finalUrl = decoded.result.url;
      return [{
        name: "WioSinema • Vidup",
        title: "Vidup • " + name + " • 1080p",
        url: finalUrl,
        quality: 1080,
        provider: "wiosinema-vidup",
        format: finalUrl.indexOf(".m3u8") >= 0 ? "m3u8" : "video",
        headers: { "User-Agent": UA, "Referer": VIDUP + "/" }
      }];
    })
    .catch(function () { return []; });
}

function getStreams(tmdbId, mediaType, season, episode) {
  if (tmdbId == null) return Promise.resolve([]);
  var isTv = mediaType === "tv" && season != null && episode != null;
  var pageUrl = isTv
    ? VIDUP + "/tv/" + encodeURIComponent(String(tmdbId)) + "/" + encodeURIComponent(String(season)) + "/" + encodeURIComponent(String(episode))
    : VIDUP + "/movie/" + encodeURIComponent(String(tmdbId));

  return fetch(pageUrl, { headers: { "User-Agent": UA, "Referer": VIDUP + "/", "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" } })
    .then(function (r) { return r.ok ? r.text() : ""; })
    .then(function (page) {
      var enc = extractEncryptedToken(page);
      if (!enc) return null;
      return fetch(DECRYPT + "/enc-vidup?text=" + encodeURIComponent(enc) + "&stage=1", { headers: baseHeaders() })
        .then(function (r) { return r.ok ? r.text() : ""; });
    })
    .then(function (stage1Text) {
      if (!stage1Text) return [];
      var s1 = parseJson(stage1Text);
      if (!s1 || s1.status !== 200 || !s1.result) return [];

      // Support 2-stage response with stage1 url or legacy direct servers
      if (s1.result.stage1) {
        var h1 = Object.assign({}, baseHeaders(), s1.result.token ? { "X-CSRF-Token": s1.result.token } : {});
        return emptyPost(s1.result.stage1, h1)
          .then(function (p1Text) {
            if (!p1Text) return null;
            return fetch(DECRYPT + "/enc-vidup?text=" + encodeURIComponent(p1Text) + "&stage=2", { headers: baseHeaders() })
              .then(function (r) { return r.ok ? r.text() : ""; });
          })
          .then(function (s2Text) {
            var s2 = parseJson(s2Text);
            return s2 && s2.status === 200 && s2.result ? s2.result : null;
          });
      }
      return s1.result;
    })
    .then(function (initial) {
      if (!initial || !initial.servers || !initial.stream) return [];
      var serversUrl = initial.servers;
      var streamUrl = initial.stream;
      var token = initial.token;
      var postHeaders = Object.assign({}, baseHeaders(), token ? { "X-CSRF-Token": token } : {});
      return emptyPost(serversUrl, postHeaders)
        .then(function (encryptedServers) { return encryptedServers ? decrypt(encryptedServers) : null; })
        .then(function (serverData) {
          if (!serverData || serverData.status !== 200 || !Array.isArray(serverData.result)) return [];
          return Promise.all(serverData.result.map(function (server) { return resolveServer(server, streamUrl, postHeaders); }))
            .then(function (groups) {
              var out = [];
              groups.forEach(function (group) { group.forEach(function (item) { if (!out.some(function (x) { return x.url === item.url; })) out.push(item); }); });
              return out;
            });
        });
    })
    .catch(function (error) {
      console.error("[WioSinema Vidup] " + (error && error.message ? error.message : String(error)));
      return [];
    });
}

module.exports = { getStreams: getStreams };
