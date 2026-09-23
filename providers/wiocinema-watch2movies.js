/* SPDX-License-Identifier: GPL-3.0-only
 * WioCinema Watch2Movies Provider
 */
"use strict";

var HOST = "https://movies2watch.watch";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

function getStreams(tmdbId, mediaType, season, episode) {
  if (tmdbId == null) return Promise.resolve([]);
  var isTv = mediaType === "tv" && season != null && episode != null;
  var pageUrl = isTv
    ? HOST + "/tv/" + encodeURIComponent(String(tmdbId)) + "/" + encodeURIComponent(String(season)) + "/" + encodeURIComponent(String(episode))
    : HOST + "/movie/" + encodeURIComponent(String(tmdbId));

  return fetch(pageUrl, { headers: { "User-Agent": UA, "Referer": HOST + "/" } })
    .then(function (r) { return r.ok ? r.text() : ""; })
    .then(function (html) {
      if (!html) return [];
      var streamMatch = /(?:url|file|src)\s*[:=]\s*['"]([^'"]+\.(?:m3u8|mp4)[^'"]*)['"]/i.exec(html);
      if (streamMatch) {
        return [{
          name: "WioCinema • Watch2Movies",
          title: "Watch2Movies • Stream • 1080p",
          url: streamMatch[1],
          quality: 1080,
          provider: "wiocinema-watch2movies",
          format: streamMatch[1].indexOf(".m3u8") >= 0 ? "m3u8" : "video",
          headers: { "User-Agent": UA, "Referer": HOST + "/" }
        }];
      }
      return [{
        name: "WioCinema • Watch2Movies",
        title: "Watch2Movies • Player • 1080p",
        url: pageUrl,
        quality: 1080,
        provider: "wiocinema-watch2movies",
        format: "video",
        headers: { "User-Agent": UA, "Referer": HOST + "/" }
      }];
    }).catch(function (error) {
      console.error("[WioCinema Watch2Movies] " + (error && error.message ? error.message : String(error)));
      return [];
    });
}

module.exports = { getStreams: getStreams };
