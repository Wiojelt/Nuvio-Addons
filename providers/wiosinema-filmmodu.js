/* SPDX-License-Identifier: GPL-3.0-only
 * WioSinema FilmModu native HTML/JS scraper for Nuvio.
 * Direct scraper extracting HLS master playlist from FilmModu / Vidmixi.
 */
"use strict";

var HOST = "https://filmmodu.cc";
var TMDB_API = "https://api.themoviedb.org/3";
var TMDB_KEY = "4e44d9029b1270a757cddc766a1bcb63";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

function getCrypto() {
  if (typeof crypto !== "undefined" && typeof crypto.createHash === "function") return crypto;
  try { return require("crypto"); } catch (_) { return null; }
}

function decodeBase64(str) {
  if (typeof atob === "function") {
    try { return atob(str); } catch (_) {}
  }
  if (typeof Buffer !== "undefined") {
    return Buffer.from(str, "base64").toString("utf8");
  }
  return "";
}

function evpKdf(password, salt, keyLen, ivLen, cr) {
  var d = Buffer.alloc ? Buffer.alloc(0) : Buffer.from("");
  var dI = Buffer.alloc ? Buffer.alloc(0) : Buffer.from("");
  while (d.length < keyLen + ivLen) {
    var h = cr.createHash("md5");
    h.update(dI);
    h.update(password);
    h.update(salt);
    dI = h.digest();
    d = Buffer.concat([d, dI]);
  }
  return { key: d.subarray(0, keyLen), iv: d.subarray(keyLen, keyLen + ivLen) };
}

function decryptAes(setStr, hashStr) {
  var cr = getCrypto();
  if (!cr) return null;
  var obj = typeof setStr === "string" ? JSON.parse(setStr) : setStr;
  var ciphertext = Buffer.from(obj.ct, "base64");
  var salt = obj.s ? Buffer.from(obj.s, "hex") : (Buffer.alloc ? Buffer.alloc(0) : Buffer.from(""));
  var password = Buffer.from(hashStr, "utf8");

  var key, iv;
  if (salt.length > 0) {
    var derived = evpKdf(password, salt, 32, 16, cr);
    key = derived.key;
    iv = obj.iv ? Buffer.from(obj.iv, "hex") : derived.iv;
  } else {
    key = cr.createHash("md5").update(password).digest();
    iv = obj.iv ? Buffer.from(obj.iv, "hex") : (Buffer.alloc ? Buffer.alloc(16, 0) : Buffer.from(new Uint8Array(16)));
  }

  var decipher = cr.createDecipheriv("aes-256-cbc", key, iv);
  var decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(decrypted.toString("utf8"));
}

function getMovieInfo(tmdbId) {
  var url = TMDB_API + "/movie/" + encodeURIComponent(String(tmdbId)) + "?api_key=" + TMDB_KEY + "&language=tr-TR";
  return fetch(url, { headers: { "User-Agent": UA, "Accept": "application/json" } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .catch(function () { return null; });
}

function searchFilmModu(query) {
  var body = "action=ajax_search&arama_kelime=" + encodeURIComponent(query);
  return fetch(HOST + "/arama/", {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "Referer": HOST + "/",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
    },
    body: body
  })
    .then(function (r) { return r.ok ? r.text() : ""; })
    .catch(function () { return ""; });
}

function getStreams(tmdbId, mediaType, season, episode) {
  if (tmdbId == null || mediaType === "tv") return Promise.resolve([]);

  return getMovieInfo(tmdbId)
    .then(function (info) {
      var imdbId = info && info.imdb_id ? info.imdb_id : null;
      var title = info && (info.title || info.original_title) ? (info.title || info.original_title) : null;
      var query = imdbId || title || String(tmdbId);

      return searchFilmModu(query).then(function (html) {
        if (!html && title && query !== title) {
          return searchFilmModu(title).then(function (h2) { return { html: h2, info: info }; });
        }
        return { html: html, info: info };
      });
    })
    .then(function (ctx) {
      if (!ctx || !ctx.html) return [];
      var linkMatch = /href=["'](https?:\/\/filmmodu\.cc\/film\/[^"']+)["']/i.exec(ctx.html);
      if (!linkMatch) return [];
      var movieUrl = linkMatch[1];

      return fetch(movieUrl, { headers: { "User-Agent": UA, "Referer": HOST + "/" } })
        .then(function (r) { return r.ok ? r.text() : ""; })
        .then(function (pageHtml) {
          var partMatch = /(?:var|let|const)\s+ilkpartkod\s*=\s*['"]([^'"]+)['"]/i.exec(pageHtml);
          if (!partMatch) return [];
          var decodedIframe = decodeBase64(partMatch[1]);
          var embedMatch = /src=["']([^"']+)["']/i.exec(decodedIframe);
          if (!embedMatch) return [];
          var embedUrl = embedMatch[1].replace(/[\r\n]+/g, "").trim();

          return fetch(embedUrl, { headers: { "User-Agent": UA, "Referer": movieUrl } })
            .then(function (r) { return r.ok ? r.text() : ""; })
            .then(function (embedHtml) {
              var playerMatch = /bePlayer\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"](\{[\s\S]*?\})['"]/i.exec(embedHtml);
              if (!playerMatch) return [];
              var hash = playerMatch[1];
              var setRaw = playerMatch[2].replace(/\\"/g, '"').replace(/\\\//g, "/");
              var playerParams = decryptAes(setRaw, hash);
              if (!playerParams || !playerParams.video_location) return [];

              var movieTitle = (ctx.info && ctx.info.title) || playerParams.title || "Film";
              return [{
                name: "WioSinema • FilmModu",
                title: "FilmModu • " + movieTitle + " • HLS 1080p",
                url: playerParams.video_location,
                quality: 1080,
                provider: "wiosinema-filmmodu",
                format: "m3u8",
                headers: { "User-Agent": UA, "Referer": embedUrl }
              }];
            });
        });
    })
    .catch(function (error) {
      console.error("[WioSinema FilmModu] " + (error && error.message ? error.message : String(error)));
      return [];
    });
}

module.exports = { getStreams: getStreams };
