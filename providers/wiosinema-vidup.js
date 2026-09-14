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
    "X-Requested-With": "XMLHttpRequest"
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

  return fetch(pageUrl)
    .then(function (r) { return r.ok ? r.text() : ""; })
    .then(function (page) {
      var enc = extractEncryptedToken(page);
      if (!enc) return null;
      return fetch(DECRYPT + "/enc-vidup?text=" + encodeURIComponent(enc), { headers: baseHeaders() })
        .then(function (r) { return r.ok ? r.text() : ""; });
    })
    .then(function (initialText) {
      if (!initialText) return [];
      var initial = parseJson(initialText);
      if (!initial || initial.status !== 200 || !initial.result) return [];
      var serversUrl = initial.result.servers;
      var streamUrl = initial.result.stream;
      var token = initial.result.token;
      if (!serversUrl || !streamUrl || !token) return [];
      var postHeaders = Object.assign({}, baseHeaders(), { "X-CSRF-Token": token });
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
