/* SPDX-License-Identifier: GPL-3.0-only
 * Nuvio port of WioSinema/CineStream invokeXpass.
 */
"use strict";

var XPASS = "https://play.xpass.top";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

function parse(text) { try { return JSON.parse(text); } catch (_) { return null; } }
function backups(html) {
  var m = /var\s+backups\s*=\s*(\[[\s\S]*?\]);/.exec(html || ""); if (!m) return [];
  var arr = parse(m[1]); if (!Array.isArray(arr)) return [];
  return arr.filter(function (x) { return x && x.name && x.url; });
}
function full(url) { if (/^https?:\/\//i.test(url)) return url; return XPASS.replace(/\/$/, "") + (url.charAt(0) === "/" ? url : "/" + url); }

function getStreams(tmdbId, mediaType, season, episode) {
  if (tmdbId == null) return Promise.resolve([]);
  var isTv = mediaType === "tv" && season != null && episode != null;
  var embed = isTv
    ? XPASS + "/e/tv/" + encodeURIComponent(String(tmdbId)) + "/" + encodeURIComponent(String(season)) + "/" + encodeURIComponent(String(episode))
    : XPASS + "/e/movie/" + encodeURIComponent(String(tmdbId));
  return fetch(embed, { headers: { "User-Agent": UA, "Referer": XPASS + "/" } })
    .then(function (r) { return r.ok ? r.text() : ""; })
    .then(function (html) {
      var list = backups(html);
      return Promise.all(list.map(function (server) {
        return fetch(full(server.url), { headers: { "User-Agent": UA, "Referer": embed } })
          .then(function (r) { return r.ok ? r.text() : ""; })
          .then(function (body) {
            var root = parse(body); var sources = root && root.playlist && root.playlist[0] && root.playlist[0].sources;
            if (!Array.isArray(sources)) return [];
            return sources.filter(function (s) { return s && /^https?:\/\//i.test(s.file || ""); }).map(function (s) {
              var url = s.file;
              return {
                name: "WioSinema • Xpass",
                title: "Xpass • " + server.name,
                url: url,
                quality: 1080,
                provider: "wiosinema-xpass",
                format: /hls/i.test(s.type || "") || url.indexOf(".m3u8") >= 0 ? "m3u8" : "video",
                headers: { "User-Agent": UA, "Referer": XPASS + "/" }
              };
            });
          }).catch(function () { return []; });
      })).then(function (groups) {
        var out = [], seen = {};
        groups.forEach(function (g) { g.forEach(function (x) { if (x.url && !seen[x.url]) { seen[x.url] = true; out.push(x); } }); });
        return out;
      });
    })
    .catch(function (e) { console.error("[WioSinema Xpass] " + (e && e.message ? e.message : String(e))); return []; });
}

module.exports = { getStreams: getStreams };
