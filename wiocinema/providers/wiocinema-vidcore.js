/* SPDX-License-Identifier: GPL-3.0-only
 * WioCinema Vidcore direct TMDB route.
 */
"use strict";

var VIDCORE = "https://vidcore.io";
var DECRYPT = "https://enc-dec.app/api";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

function headers() {
  return { "User-Agent": UA, "Referer": VIDCORE + "/", "X-Requested-With": "XMLHttpRequest" };
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
  return post(DECRYPT + "/dec-vidcore", { text: text }).then(parseJson);
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
      var url = data.url;
      return [{
        name: "WioCinema • Vidcore",
        title: "Vidcore • " + (server.name || "Server") + (server.description ? " • " + server.description : ""),
        url: url,
        quality: 1080,
        provider: "wiocinema-vidcore",
        format: url.indexOf(".m3u8") >= 0 ? "m3u8" : "video",
        headers: { "User-Agent": UA, "Referer": VIDCORE + "/", "X-Requested-With": "XMLHttpRequest" }
      }];
    }).catch(function () { return []; });
}

function getStreams(tmdbId, mediaType, season, episode) {
  if (tmdbId == null) return Promise.resolve([]);
  var isTv = mediaType === "tv" && season != null && episode != null;
  var page = isTv
    ? VIDCORE + "/tv/" + encodeURIComponent(String(tmdbId)) + "/" + encodeURIComponent(String(season)) + "/" + encodeURIComponent(String(episode))
    : VIDCORE + "/movie/" + encodeURIComponent(String(tmdbId));
  return fetch(page, { headers: headers() })
    .then(function (r) { return r.ok ? r.text() : ""; })
    .then(function (body) {
      var token = encryptedToken(body);
      if (!token) return [];
      return fetch(DECRYPT + "/enc-vidcore?text=" + encodeURIComponent(token))
        .then(function (r) { return r.ok ? r.text() : ""; })
        .then(parseJson)
        .then(function (enc) {
          var res = resultOf(enc);
          if (!res || !res.servers || !res.stream) return [];
          var reqHeaders = Object.assign(headers(), res.token ? { "X-Csrf-Token": res.token } : {});
          return post(res.servers, null, reqHeaders)
            .then(function (txt) { return txt ? dec(txt) : null; })
            .then(function (serversPayload) {
              var servers = resultOf(serversPayload);
              if (!Array.isArray(servers)) return [];
              return Promise.all(servers.map(function (s) {
                return resolveServer(s, res.stream, reqHeaders);
              })).then(function (nested) {
                var out = [], seen = {};
                nested.forEach(function (list) {
                  list.forEach(function (item) {
                    if (item.url && !seen[item.url]) {
                      seen[item.url] = true;
                      out.push(item);
                    }
                  });
                });
                return out;
              });
            });
        });
    }).catch(function (error) {
      console.error("[WioCinema Vidcore] " + (error && error.message ? error.message : String(error)));
      return [];
    });
}

module.exports = { getStreams: getStreams };
