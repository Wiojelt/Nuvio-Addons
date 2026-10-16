/* SPDX-License-Identifier: GPL-3.0-only
 * WioSinema SetFilmIzle native HTML/JS scraper for Nuvio.
 * Direct scraper extracting streams from SetFilmIzle.
 */
"use strict";

var HOST = "https://www.setfilmizle.ltd";
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

function searchSetFilm(query) {
  var url = HOST + "/?s=" + encodeURIComponent(query);
  return fetch(url, { headers: { "User-Agent": UA, "Referer": HOST + "/" } })
    .then(function (r) { return r.ok ? r.text() : ""; })
    .catch(function () { return ""; });
}

function parseJson(str) {
  try { return JSON.parse(str); } catch (_) { return null; }
}

function getStreams(tmdbId, mediaType, season, episode) {
  if (tmdbId == null) return Promise.resolve([]);
  var isTv = mediaType === "tv" && season != null && episode != null;

  return getMediaInfo(tmdbId, isTv)
    .then(function (info) {
      var title = info ? (info.title || info.name || info.original_title || info.original_name) : null;
      var query = title || String(tmdbId);
      return searchSetFilm(query).then(function (html) {
        return { html: html, title: title || "Media" };
      });
    })
    .then(function (ctx) {
      if (!ctx || !ctx.html) return [];
      var cardMatch = /href=["'](https?:\/\/www\.setfilmizle\.ltd\/(?:film|dizi)\/[^"']+)["']/i.exec(ctx.html);
      if (!cardMatch) return [];
      var itemUrl = cardMatch[1];
      if (isTv) {
        itemUrl = itemUrl.replace(/\/$/, "") + "/sezon-" + season + "-bolum-" + episode + "/";
      }

      return fetch(itemUrl, { headers: { "User-Agent": UA, "Referer": HOST + "/" } })
        .then(function (r) { return r.ok ? r.text() : ""; })
        .then(function (pageHtml) {
          var nonceMatch = /nonces:\s*\{[^}]*video:\s*["']([^"']+)["']/i.exec(pageHtml);
          var postIdMatch = /(?:post_id["':\s]+|data-post-id=["']|post-)(\d+)/i.exec(pageHtml);
          var playerMatch = /data-player-name=["']([^"']+)["']/i.exec(pageHtml);

          if (!nonceMatch || !postIdMatch) return [];
          var nonce = nonceMatch[1];
          var postId = postIdMatch[1];
          var playerName = playerMatch ? playerMatch[1] : "SetPlay";

          var body = "action=get_video_url&nonce=" + encodeURIComponent(nonce) +
            "&post_id=" + encodeURIComponent(postId) +
            "&player_name=" + encodeURIComponent(playerName) +
            "&part_key=";

          return fetch(HOST + "/wp-admin/admin-ajax.php", {
            method: "POST",
            headers: {
              "User-Agent": UA,
              "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
              "Referer": itemUrl,
              "X-Requested-With": "XMLHttpRequest"
            },
            body: body
          })
            .then(function (r) { return r.ok ? r.text() : ""; })
            .then(function (ajaxText) {
              var payload = parseJson(ajaxText);
              if (!payload || !payload.success || !payload.data || !payload.data.stream || !payload.data.stream.url) {
                return [];
              }
              var stream = payload.data.stream;
              return [{
                name: "WioSinema • SetFilmIzle",
                title: "SetFilmIzle • " + ctx.title + " • " + (stream.provider || "SetPlay"),
                url: stream.url,
                quality: 1080,
                provider: "wiosinema-setfilmizle",
                format: "video",
                headers: { "User-Agent": UA, "Referer": HOST + "/" }
              }];
            });
        });
    })
    .catch(function (error) {
      console.error("[WioSinema SetFilmIzle] " + (error && error.message ? error.message : String(error)));
      return [];
    });
}

module.exports = { getStreams: getStreams };
