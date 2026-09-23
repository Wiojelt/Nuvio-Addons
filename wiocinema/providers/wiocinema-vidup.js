/* SPDX-License-Identifier: GPL-3.0-only
 * WioCinema Vidup direct TMDB route.
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
        name: "WioCinema • Vidup",
        title: "Vidup • " + name + " • 1080p",
        url: finalUrl,
        quality: 1080,
        provider: "wiocinema-vidup",
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

  return fetch(pageUrl, { headers: baseHeaders() })
    .then(function (r) { return r.ok ? r.text() : ""; })
    .then(function (html) {
      var token = extractEncryptedToken(html);
      if (!token) return [];
      var encUrl = DECRYPT + "/enc-vidup?text=" + encodeURIComponent(token);
      return fetch(encUrl)
        .then(function (r) { return r.ok ? r.text() : ""; })
        .then(parseJson)
        .then(function (encData) {
          if (!encData || encData.status !== 200 || !encData.result) return [];
          var res = encData.result;
          var serversUrl = res.servers;
          var streamBase = res.stream;
          var csrf = res.token;
          if (!serversUrl || !streamBase) return [];
          var postHeaders = Object.assign(baseHeaders(), csrf ? { "X-Csrf-Token": csrf } : {});
          return emptyPost(serversUrl, postHeaders)
            .then(function (encServers) { return encServers ? decrypt(encServers) : null; })
            .then(function (serversData) {
              if (!serversData || serversData.status !== 200 || !Array.isArray(serversData.result)) return [];
              return Promise.all(serversData.result.map(function (server) {
                return resolveServer(server, streamBase, postHeaders);
              })).then(function (nested) {
                var out = [], seen = {};
                nested.forEach(function (group) {
                  group.forEach(function (stream) {
                    if (stream && stream.url && !seen[stream.url]) {
                      seen[stream.url] = true;
                      out.push(stream);
                    }
                  });
                });
                return out;
              });
            });
        });
    })
    .catch(function (error) {
      console.error("[WioCinema Vidup] " + (error && error.message ? error.message : String(error)));
      return [];
    });
}

module.exports = { getStreams: getStreams };
