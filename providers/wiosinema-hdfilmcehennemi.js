/* SPDX-License-Identifier: GPL-3.0-only
 * WioSinema HDFilmCehennemi native HTML/JS scraper for Nuvio.
 * Direct scraper extracting streams from HDFilmCehennemi.
 */
"use strict";

var HOST = "https://www.hdfilmcehennemi.nl";
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

function parseJson(str) {
  try { return JSON.parse(str); } catch (_) { return null; }
}

function searchHdf(query) {
  var url = HOST + "/search/?q=" + encodeURIComponent(query);
  return fetch(url, {
    headers: {
      "User-Agent": UA,
      "Referer": HOST + "/",
      "X-Requested-With": "fetch",
      "Accept": "application/json"
    }
  })
    .then(function (r) { return r.ok ? r.text() : ""; })
    .catch(function () { return ""; });
}

function extractFirstLink(jsonText) {
  if (!jsonText) return null;
  var data = parseJson(jsonText);
  if (data && Array.isArray(data.results) && data.results.length > 0) {
    for (var i = 0; i < data.results.length; i++) {
      var html = data.results[i];
      var m = /href=["'](https?:\/\/[^"']*hdfilmcehennemi[^"']+)["']/i.exec(html);
      if (m) return m[1];
    }
  }
  // Fallback to direct href regex in raw text
  var fallback = /href=["'](https?:\/\/[^"']*hdfilmcehennemi\.nl\/[^"']+)["']/i.exec(jsonText);
  return fallback ? fallback[1] : null;
}

function getStreams(tmdbId, mediaType, season, episode) {
  if (tmdbId == null) return Promise.resolve([]);
  var isTv = mediaType === "tv" && season != null && episode != null;

  return getMediaInfo(tmdbId, isTv)
    .then(function (info) {
      var imdbId = info && info.imdb_id ? info.imdb_id : null;
      var title = info ? (info.title || info.name || info.original_title || info.original_name) : null;
      var query = imdbId || title || String(tmdbId);

      return searchHdf(query).then(function (raw) {
        if (!raw && title && query !== title) {
          return searchHdf(title).then(function (r2) { return { raw: r2, title: title }; });
        }
        return { raw: raw, title: title || "Media" };
      });
    })
    .then(function (ctx) {
      if (!ctx || !ctx.raw) return [];
      var itemUrl = extractFirstLink(ctx.raw);
      if (!itemUrl) return [];

      if (isTv) {
        itemUrl = itemUrl.replace(/\/$/, "") + "/sezon-" + season + "-bolum-" + episode + "/";
      }

      return fetch(itemUrl, { headers: { "User-Agent": UA, "Referer": HOST + "/" } })
        .then(function (r) { return r.ok ? r.text() : ""; })
        .then(function (pageHtml) {
          var iframeMatch = /<iframe[^>]*src=["']([^"']+)["']/i.exec(pageHtml) ||
                            /<iframe[^>]*data-src=["']([^"']+)["']/i.exec(pageHtml);
          if (!iframeMatch) return [];
          var embedUrl = iframeMatch[1];
          if (/^\/\//.test(embedUrl)) embedUrl = "https:" + embedUrl;

          return [{
            name: "WioSinema • HDFilmCehennemi",
            title: "HDFilmCehennemi • " + ctx.title + (isTv ? " • S" + season + "E" + episode : "") + " • 1080p",
            url: embedUrl,
            quality: 1080,
            provider: "wiosinema-hdfilmcehennemi",
            format: "video",
            headers: { "User-Agent": UA, "Referer": HOST + "/" }
          }];
        });
    })
    .catch(function (error) {
      console.error("[WioSinema HDFilmCehennemi] " + (error && error.message ? error.message : String(error)));
      return [];
    });
}

module.exports = { getStreams: getStreams };
