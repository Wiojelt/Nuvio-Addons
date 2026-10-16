/* SPDX-License-Identifier: GPL-3.0-only
 * WioSinema FilmMakinesi native HTML/JS scraper for Nuvio.
 * Scrapes Turkish movies and series from FilmMakinesi.
 */
"use strict";

var HOST = "https://filmmakinesi.co";
var TMDB_API = "https://api.themoviedb.org/3";
var TMDB_KEY = "4e44d9029b1270a757cddc766a1bcb63";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

function getMediaInfo(tmdbId, isTv) {
  var path = isTv ? "/tv/" : "/movie/";
  var url = TMDB_API + path + encodeURIComponent(String(tmdbId)) + "?api_key=" + TMDB_KEY + "&language=tr-TR";
  return fetch(url, { headers: { "User-Agent": UA, "Accept": "application/json" } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .catch(function () { return null; });
}

function searchFilmMakinesi(query) {
  var url = HOST + "/?s=" + encodeURIComponent(query);
  return fetch(url, { headers: { "User-Agent": UA, "Referer": HOST + "/" } })
    .then(function (r) { return r.ok ? r.text() : ""; })
    .catch(function () { return ""; });
}

function getStreams(tmdbId, mediaType, season, episode) {
  if (tmdbId == null) return Promise.resolve([]);
  var isTv = mediaType === "tv" && season != null && episode != null;

  return getMediaInfo(tmdbId, isTv)
    .then(function (info) {
      var title = info ? (info.title || info.name || info.original_title || info.original_name) : null;
      var query = title || String(tmdbId);
      return searchFilmMakinesi(query).then(function (html) {
        if (!html && info && info.original_title && info.original_title !== title) {
          return searchFilmMakinesi(info.original_title).then(function (h2) { return { html: h2, title: title }; });
        }
        return { html: html, title: title || "Media" };
      });
    })
    .then(function (ctx) {
      if (!ctx || !ctx.html) return [];
      var linkMatch = /<a[^>]*href=["'](https?:\/\/filmmakinesi\.co\/[^"']+\/)["'][^>]*class=["']mini-poster["']/i.exec(ctx.html) ||
                      /<a[^>]*class=["']mini-poster["'][^>]*href=["'](https?:\/\/filmmakinesi\.co\/[^"']+\/)["']/i.exec(ctx.html);
      if (!linkMatch) return [];
      var itemUrl = linkMatch[1];
      if (isTv) {
        itemUrl = itemUrl.replace(/\/$/, "") + "/sezon-" + season + "-bolum-" + episode + "/";
      }

      return fetch(itemUrl, { headers: { "User-Agent": UA, "Referer": HOST + "/" } })
        .then(function (r) { return r.ok ? r.text() : ""; })
        .then(function (pageHtml) {
          var iframeMatch = /<iframe[^>]*src=["'](https?:\/\/[^"'\s>]*(?:embed|player|oynat)[^"'\s>]*)["']/i.exec(pageHtml);
          if (!iframeMatch) return [];
          var embedUrl = iframeMatch[1];

          return [{
            name: "WioSinema • FilmMakinesi",
            title: "FilmMakinesi • " + ctx.title + " • 1080p",
            url: embedUrl,
            quality: 1080,
            provider: "wiosinema-filmmakinesi",
            format: "video",
            headers: { "User-Agent": UA, "Referer": HOST + "/" }
          }];
        });
    })
    .catch(function (error) {
      console.error("[WioSinema FilmMakinesi] " + (error && error.message ? error.message : String(error)));
      return [];
    });
}

module.exports = { getStreams: getStreams };
