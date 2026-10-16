/* SPDX-License-Identifier: GPL-3.0-only
 * WioCinema Velarium / Lightflix Provider (Direct 4K Master Playlist Router)
 * Copyright (c) 2026 Wiojelt.
 */
"use strict";

var HOST = "https://velarium.cc";
var LIGHTFLIX_HOST = "https://lightflix.app";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

var nodeCrypto = null;
try {
  if (typeof require === "function") {
    nodeCrypto = require("crypto");
  }
} catch (_) {}

function parseJson(text) { try { return JSON.parse(text); } catch (_) { return null; } }
function postJson(url, payload, headers) {
  var h = Object.assign({}, headers || {});
  if (payload != null) h["Content-Type"] = "application/json";
  return fetch(url, { method: "POST", headers: h, body: payload == null ? undefined : JSON.stringify(payload) })
    .then(function (r) { return r.ok ? r.text() : ""; }).catch(function () { return ""; });
}
function getText(url, headers) {
  return fetch(url, { headers: headers || {} }).then(function (r) { return r.ok ? r.text() : ""; }).catch(function () { return ""; });
}

function solvePow(challenge, difficulty) {
  var fullBytes = Math.floor(difficulty / 8);
  var remainingBits = difficulty % 8;
  var mask = remainingBits > 0 ? (0xff << (8 - remainingBits)) & 0xff : 0;

  var nonce = 0;
  while (nonce < 2000000) {
    var hash = null;
    if (nodeCrypto && nodeCrypto.createHash) {
      hash = nodeCrypto.createHash("sha256").update(challenge + nonce).digest();
    }
    if (hash) {
      var match = true;
      for (var i = 0; i < fullBytes; i++) {
        if (hash[i] !== 0) { match = false; break; }
      }
      if (match && remainingBits > 0) {
        if ((hash[fullBytes] & mask) !== 0) match = false;
      }
      if (match) return String(nonce);
    } else {
      return String(nonce);
    }
    nonce++;
  }
  return null;
}

function buildSubtitles(tmdbId, isTv, season, episode, extraTracks) {
  var idStr = encodeURIComponent(String(tmdbId));
  var query = isTv ? "&s=" + encodeURIComponent(String(season)) + "&e=" + encodeURIComponent(String(episode)) : "";
  var list = [];
  if (Array.isArray(extraTracks)) {
    extraTracks.forEach(function (tr, i) {
      if (tr && tr.file) {
        list.push({
          id: "velarium-emb-" + i,
          url: tr.file,
          language: (tr.label || "").toLowerCase().slice(0, 2) || "en",
          name: tr.label || "Subtitle " + (i + 1)
        });
      }
    });
  }
  var defaults = [
    { id: "velarium-sub-tr", url: "https://sub.vyper.top/vtt?tmdb=" + idStr + "&lang=tr" + query, language: "tr", name: "Turkish" },
    { id: "velarium-sub-en", url: "https://sub.vyper.top/vtt?tmdb=" + idStr + "&lang=en" + query, language: "en", name: "English" },
    { id: "velarium-sub-es", url: "https://sub.vyper.top/vtt?tmdb=" + idStr + "&lang=es" + query, language: "es", name: "Spanish" },
    { id: "velarium-sub-de", url: "https://sub.vyper.top/vtt?tmdb=" + idStr + "&lang=de" + query, language: "de", name: "German" },
    { id: "velarium-sub-fr", url: "https://sub.vyper.top/vtt?tmdb=" + idStr + "&lang=fr" + query, language: "fr", name: "French" }
  ];
  defaults.forEach(function (d) {
    if (!list.some(function (x) { return x.language === d.language; })) {
      list.push(d);
    }
  });
  return list;
}

function resolveVelariumDirect(tmdbId, mediaType, season, episode) {
  var isTv = mediaType === "tv" && season != null && episode != null;
  var tvSlug = isTv ? String(season) + "-" + String(episode) : "";
  var pagePath = isTv ? "/en/watch/tv/" + encodeURIComponent(String(tmdbId)) + "-" + tvSlug : "/en/watch/movie/" + encodeURIComponent(String(tmdbId));
  var watchUrl = HOST + pagePath;
  var h = { "User-Agent": UA, "Referer": HOST + "/", "Accept": "*/*" };

  return getText(watchUrl, { "User-Agent": UA, "Referer": HOST + "/" })
    .then(function (html) {
      if (!html) return [];
      var tokenMatch = /window\.__REQUEST_TOKEN__\s*=\s*["']([^"']+)["']/.exec(html);
      if (!tokenMatch) return [];
      var requestToken = tokenMatch[1];

      return postJson(HOST + "/api/playback-init", {
        mediaId: Number(tmdbId),
        mediaType: isTv ? "tv" : "movie",
        tv_slug: tvSlug,
        requestToken: requestToken
      }, h).then(function (initTxt) {
        var initJson = parseJson(initTxt);
        if (!initJson) return [];

        var streamTokenPromise;
        if (initJson.requiresPow && initJson.pow) {
          var nonce = solvePow(initJson.pow.challenge, initJson.pow.difficulty);
          if (!nonce) return [];
          streamTokenPromise = postJson(HOST + "/api/playback-init", {
            mediaId: Number(tmdbId),
            mediaType: isTv ? "tv" : "movie",
            tv_slug: tvSlug,
            requestToken: requestToken,
            pow: {
              challengeId: initJson.pow.challengeId,
              nonce: nonce
            }
          }, h).then(function (powTxt) {
            var powJson = parseJson(powTxt);
            return powJson && powJson.success && powJson.token ? powJson.token : null;
          });
        } else if (initJson.token) {
          streamTokenPromise = Promise.resolve(initJson.token);
        } else {
          return [];
        }

        return streamTokenPromise.then(function (streamToken) {
          if (!streamToken) return [];

          var servers = [
            { id: "s0", name: "Lumen", quality: 1080 },
            { id: "s10", name: "Lux", quality: 2160 },
            { id: "s25", name: "Prism", quality: 2160 },
            { id: "s3", name: "Ray", quality: 1080 }
          ];

          var subs = buildSubtitles(tmdbId, isTv, season, episode, []);

          return Promise.all(servers.map(function (server) {
            return postJson(HOST + "/api/encrypt", {
              data: {
                mediaId: Number(tmdbId),
                mediaType: isTv ? "tv" : "movie",
                tv_slug: tvSlug,
                source: server.id
              },
              endpoint: "stream-encrypted",
              requestToken: requestToken
            }, h).then(function (encTxt) {
              var encJson = parseJson(encTxt);
              if (!encJson || !encJson.url) return null;

              var streamApiUrl = HOST + encJson.url;
              streamApiUrl += (streamApiUrl.indexOf("?") >= 0 ? "&" : "?") + "requestToken=" + encodeURIComponent(requestToken);
              streamApiUrl += "&token=" + encodeURIComponent(streamToken);

              return getText(streamApiUrl, {
                "User-Agent": UA,
                "Referer": watchUrl,
                "Accept": "application/json"
              }).then(function (streamTxt) {
                var streamJson = parseJson(streamTxt);
                if (streamJson && streamJson.success && streamJson.data && streamJson.data.stream_url && streamJson.data.stream_url.indexOf("playback-unavailable") === -1) {
                  return {
                    name: "WioCinema • Velarium",
                    title: "Velarium • " + server.name + " (" + (server.quality === 2160 ? "4K" : "1080p") + ") [Multi-Sub]",
                    url: streamJson.data.stream_url,
                    quality: server.quality,
                    provider: "wiocinema-velarium",
                    format: "m3u8",
                    headers: { "User-Agent": UA, "Referer": HOST + "/" },
                    subtitles: subs
                  };
                }
                return null;
              }).catch(function () { return null; });
            }).catch(function () { return null; });
          })).then(function (list) {
            return list.filter(Boolean);
          });
        });
      });
    }).catch(function () { return []; });
}

function getStreams(tmdbId, mediaType, season, episode) {
  if (tmdbId == null) return Promise.resolve([]);
  var isTv = mediaType === "tv" && season != null && episode != null;
  var idStr = encodeURIComponent(String(tmdbId));
  var sStr = isTv ? encodeURIComponent(String(season)) : "1";
  var eStr = isTv ? encodeURIComponent(String(episode)) : "1";

  return resolveVelariumDirect(tmdbId, mediaType, season, episode).then(function (streams) {
    if (Array.isArray(streams) && streams.length > 0) {
      return streams;
    }

    var subs = buildSubtitles(tmdbId, isTv, season, episode, []);
    return [
      {
        name: "WioCinema • Velarium",
        title: "Velarium • Player Direct • 4K [Multi-Sub]",
        url: isTv
          ? HOST + "/en/watch/tv/" + idStr + "-" + sStr + "-" + eStr + "?autoPlay=true&autoNext=true"
          : HOST + "/en/watch/movie/" + idStr + "?autoPlay=true",
        quality: 2160,
        provider: "wiocinema-velarium",
        format: "m3u8",
        headers: { "User-Agent": UA, "Referer": HOST + "/" },
        subtitles: subs
      },
      {
        name: "WioCinema • Lightflix",
        title: "Lightflix • Player Direct • 4K [Multi-Sub]",
        url: isTv
          ? LIGHTFLIX_HOST + "/en/watch/tv/" + idStr + "-" + sStr + "-" + eStr + "?autoPlay=true&autoNext=true"
          : LIGHTFLIX_HOST + "/en/watch/movie/" + idStr + "?autoPlay=true",
        quality: 2160,
        provider: "wiocinema-velarium",
        format: "m3u8",
        headers: { "User-Agent": UA, "Referer": LIGHTFLIX_HOST + "/" },
        subtitles: subs
      }
    ];
  }).catch(function (error) {
    console.error("[WioCinema Velarium] " + (error && error.message ? error.message : String(error)));
    return [];
  });
}

module.exports = { getStreams: getStreams };
