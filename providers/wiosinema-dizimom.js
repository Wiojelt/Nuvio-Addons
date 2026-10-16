/* SPDX-License-Identifier: GPL-3.0-only
 * WioSinema DiziMom native HTML/JS scraper for Nuvio.
 * Direct scraper extracting HLS master playlist for TV series from DiziMom / Pilavyer.
 */
"use strict";

var HOST = "https://ddizimom.net";
var TMDB_API = "https://api.themoviedb.org/3";
var TMDB_KEY = "4e44d9029b1270a757cddc766a1bcb63";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

function getTvInfo(tmdbId) {
  var url = TMDB_API + "/tv/" + encodeURIComponent(String(tmdbId)) + "?api_key=" + TMDB_KEY + "&language=tr-TR";
  return fetch(url, { headers: { "User-Agent": UA, "Accept": "application/json" } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .catch(function () { return null; });
}

function searchDiziMom(title) {
  var url = HOST + "/ara?q=" + encodeURIComponent(title);
  return fetch(url, { headers: { "User-Agent": UA, "Referer": HOST + "/" } })
    .then(function (r) { return r.ok ? r.text() : ""; })
    .catch(function () { return ""; });
}

function parseJson(str) {
  try { return JSON.parse(str); } catch (_) { return null; }
}

function getStreams(tmdbId, mediaType, season, episode) {
  if (tmdbId == null || mediaType === "movie") return Promise.resolve([]);

  var sNum = season != null ? Number(season) : 1;
  var eNum = episode != null ? Number(episode) : 1;

  return getTvInfo(tmdbId)
    .then(function (info) {
      var title = info && (info.name || info.original_name) ? (info.name || info.original_name) : null;
      if (!title) return null;
      return searchDiziMom(title).then(function (html) {
        if (!html && info.original_name && info.original_name !== title) {
          return searchDiziMom(info.original_name).then(function (h2) { return { html: h2, title: title }; });
        }
        return { html: html, title: title };
      });
    })
    .then(function (ctx) {
      if (!ctx || !ctx.html) return [];
      var seriesMatch = /href=["'](https?:\/\/ddizimom\.net\/dizi\/[^"'/]+)["']/i.exec(ctx.html);
      if (!seriesMatch) return [];
      var seriesUrl = seriesMatch[1];
      var epUrl = seriesUrl + "/sezon-" + sNum + "/bolum-" + eNum;

      return fetch(epUrl, { headers: { "User-Agent": UA, "Referer": seriesUrl } })
        .then(function (r) { return r.ok ? r.text() : ""; })
        .then(function (epHtml) {
          var pvMatch = /data-pv=["']([^"']+)["']/i.exec(epHtml);
          if (!pvMatch) return [];
          var slug = pvMatch[1];
          var bridgeUrl = "https://play2.pilavyerplay.top/assets/js/s.php?s=" + encodeURIComponent(slug);

          return fetch(bridgeUrl, { headers: { "User-Agent": UA, "Referer": HOST + "/" } })
            .then(function (r) { return r.ok ? r.text() : ""; })
            .then(function (bridgeHtml) {
              var playerMatch = /window\.__PLAYER__\s*=\s*(\{[\s\S]*?\});/i.exec(bridgeHtml);
              if (!playerMatch) return [];
              var playerConfig = parseJson(playerMatch[1]);
              if (!playerConfig || !playerConfig.stream) return [];

              return [{
                name: "WioSinema • DiziMom",
                title: "DiziMom • " + ctx.title + " • S" + sNum + "E" + eNum + " • HLS 1080p",
                url: playerConfig.stream,
                quality: 1080,
                provider: "wiosinema-dizimom",
                format: "m3u8",
                headers: { "User-Agent": UA, "Referer": "https://play2.pilavyerplay.top/" }
              }];
            });
        });
    })
    .catch(function (error) {
      console.error("[WioSinema DiziMom] " + (error && error.message ? error.message : String(error)));
      return [];
    });
}

module.exports = { getStreams: getStreams };
