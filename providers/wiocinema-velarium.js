/* SPDX-License-Identifier: GPL-3.0-only
 * WioCinema Velarium / Lightflix Provider (Direct 4K Master Playlist Router)
 * Copyright (c) 2026 Wiojelt.
 */
"use strict";

var HOST = "https://velarium.cc";
var LIGHTFLIX_HOST = "https://lightflix.app";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

var K_SHA = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);
var W_SHA = new Uint32Array(64);
function sha256Into(msg, out) {
  var h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  var h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  var l = msg.length;
  var bitLen = l * 8;
  var total = (l + 1 + 8 + 63) & ~63;
  var buf = new Uint8Array(total);
  buf.set(msg);
  buf[l] = 0x80;
  var dv = new DataView(buf.buffer);
  dv.setUint32(total - 4, bitLen >>> 0, false);
  dv.setUint32(total - 8, Math.floor(bitLen / 0x100000000), false);
  for (var off = 0; off < total; off += 64) {
    for (var i = 0; i < 16; i++) W_SHA[i] = dv.getUint32(off + i * 4, false);
    for (var i = 16; i < 64; i++) {
      var a = W_SHA[i - 15], b = W_SHA[i - 2];
      var s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      var s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      W_SHA[i] = (W_SHA[i - 16] + s0 + W_SHA[i - 7] + s1) | 0;
    }
    var a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (var i = 0; i < 64; i++) {
      var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      var ch = (e & f) ^ (~e & g);
      var t1 = (h + S1 + ch + K_SHA[i] + W_SHA[i]) | 0;
      var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      var maj = (a & b) ^ (a & c) ^ (b & c);
      var t2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }
  var odv = new DataView(out.buffer, out.byteOffset, 32);
  odv.setUint32(0, h0 >>> 0, false);
  odv.setUint32(4, h1 >>> 0, false);
  odv.setUint32(8, h2 >>> 0, false);
  odv.setUint32(12, h3 >>> 0, false);
  odv.setUint32(16, h4 >>> 0, false);
  odv.setUint32(20, h5 >>> 0, false);
  odv.setUint32(24, h6 >>> 0, false);
  odv.setUint32(28, h7 >>> 0, false);
}

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
  var hash = new Uint8Array(32);
  var nonce = 0;
  while (nonce < 2000000) {
    var str = challenge + nonce;
    var bytes = new Uint8Array(str.length);
    for (var i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
    sha256Into(bytes, hash);
    var match = true;
    for (var i = 0; i < fullBytes; i++) {
      if (hash[i] !== 0) { match = false; break; }
    }
    if (match && remainingBits > 0) {
      if ((hash[fullBytes] & mask) !== 0) match = false;
    }
    if (match) return String(nonce);
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
      var fullList = [];
      streams.forEach(function (s) {
        fullList.push(s);
        fullList.push({
          name: "WioCinema • Velarium",
          title: s.title.replace("Velarium •", "Lightflix •"),
          url: s.url,
          quality: s.quality,
          provider: "wiocinema-velarium",
          format: "m3u8",
          headers: { "User-Agent": UA, "Referer": LIGHTFLIX_HOST + "/" },
          subtitles: s.subtitles
        });
      });
      return fullList;
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
        format: "video",
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
        format: "video",
        headers: { "User-Agent": UA, "Referer": LIGHTFLIX_HOST + "/" },
        subtitles: subs
      }
    ];
  }).catch(function (error) {
    console.error("[WioCinema Velarium] " + (error && error.message ? error.message : String(error)));
    return [];
  });
}

if (typeof module !== "undefined" && module.exports) module.exports = { getStreams: getStreams };
if (typeof exports !== "undefined") exports.getStreams = getStreams;
if (typeof globalThis !== "undefined") globalThis.getStreams = getStreams;
