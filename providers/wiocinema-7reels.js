/* SPDX-License-Identifier: GPL-3.0-only
 * WioCinema 7Reels Provider (4K & Multi-Subtitle Stream Router)
 * Copyright (c) 2026 Wiojelt.
 */
"use strict";

var HOST = "https://7reels.cc";
var EMBED_KEY = "key_c90081fa77254eb5";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

function buildSubtitles(tmdbId, isTv, season, episode) {
  var idStr = encodeURIComponent(String(tmdbId));
  var query = isTv ? "&s=" + encodeURIComponent(String(season)) + "&e=" + encodeURIComponent(String(episode)) : "";
  return [
    { id: "7reels-sub-tr", url: "https://sub.vyper.top/vtt?tmdb=" + idStr + "&lang=tr" + query, language: "tr", name: "Turkish" },
    { id: "7reels-sub-en", url: "https://sub.vyper.top/vtt?tmdb=" + idStr + "&lang=en" + query, language: "en", name: "English" },
    { id: "7reels-sub-es", url: "https://sub.vyper.top/vtt?tmdb=" + idStr + "&lang=es" + query, language: "es", name: "Spanish" },
    { id: "7reels-sub-de", url: "https://sub.vyper.top/vtt?tmdb=" + idStr + "&lang=de" + query, language: "de", name: "German" },
    { id: "7reels-sub-fr", url: "https://sub.vyper.top/vtt?tmdb=" + idStr + "&lang=fr" + query, language: "fr", name: "French" }
  ];
}

function getStreams(tmdbId, mediaType, season, episode) {
  if (tmdbId == null) return Promise.resolve([]);
  var isTv = mediaType === "tv" && season != null && episode != null;
  var idStr = encodeURIComponent(String(tmdbId));
  var sStr = isTv ? encodeURIComponent(String(season)) : "1";
  var eStr = isTv ? encodeURIComponent(String(episode)) : "1";
  var subs = buildSubtitles(tmdbId, isTv, season, episode);

  var checkUrl = isTv
    ? HOST + "/tv/" + idStr + "/" + sStr + "/" + eStr
    : HOST + "/movie/" + idStr;

  return fetch(checkUrl, { headers: { "User-Agent": UA, "Referer": HOST + "/" } })
    .catch(function () { return null; })
    .then(function () {
      return [
        {
          name: "WioCinema • 7Reels",
          title: "7Reels • VidFast • 4K [Multi-Sub]",
          url: isTv
            ? "https://vidfast.vc/tv/" + idStr + "/" + sStr + "/" + eStr + "?autoPlay=true&theme=16A085&nextButton=true&autoNext=true&sub=en"
            : "https://vidfast.vc/movie/" + idStr + "?autoPlay=true&theme=16A085&sub=en",
          quality: 2160,
          provider: "wiocinema-7reels",
          format: "video",
          headers: { "User-Agent": UA, "Referer": HOST + "/" },
          subtitles: subs
        },
        {
          name: "WioCinema • 7Reels",
          title: "7Reels • Strigil • 4K [Ultra HD]",
          url: isTv
            ? "https://strigil.cc/embed/tv/" + idStr + "/" + sStr + "/" + eStr + "?embedKey=" + EMBED_KEY + "&autoPlay=true&theme=16A085&sub=en"
            : "https://strigil.cc/embed/movie/" + idStr + "?embedKey=" + EMBED_KEY + "&autoPlay=true&theme=16A085&sub=en",
          quality: 2160,
          provider: "wiocinema-7reels",
          format: "video",
          headers: { "User-Agent": UA, "Referer": HOST + "/" },
          subtitles: subs
        },
        {
          name: "WioCinema • 7Reels",
          title: "7Reels • VidEasy • 4K [Multi-Sub & Audio]",
          url: isTv
            ? "https://vidy.st/tv/" + idStr + "/" + sStr + "/" + eStr + "?autoplay=true&nextEpisode=true&autoplayNextEpisode=true&episodeSelector=true&overlay=true&color=16A085"
            : "https://vidy.st/movie/" + idStr + "?autoplay=true&overlay=true&color=16A085",
          quality: 2160,
          provider: "wiocinema-7reels",
          format: "video",
          headers: { "User-Agent": UA, "Referer": HOST + "/" },
          subtitles: subs
        },
        {
          name: "WioCinema • 7Reels",
          title: "7Reels • VidLink • 1080p [Multi-Sub]",
          url: isTv
            ? "https://vidlink.pro/tv/" + idStr + "/" + sStr + "/" + eStr
            : "https://vidlink.pro/movie/" + idStr,
          quality: 1080,
          provider: "wiocinema-7reels",
          format: "video",
          headers: { "User-Agent": UA, "Referer": HOST + "/" },
          subtitles: subs
        },
        {
          name: "WioCinema • 7Reels",
          title: "7Reels • VidCore • 1080p",
          url: isTv
            ? "https://vidcore.net/tv/" + idStr + "/" + sStr + "/" + eStr + "?autoPlay=true&sub=en"
            : "https://vidcore.net/movie/" + idStr + "?autoPlay=true&sub=en",
          quality: 1080,
          provider: "wiocinema-7reels",
          format: "video",
          headers: { "User-Agent": UA, "Referer": HOST + "/" },
          subtitles: subs
        },
        {
          name: "WioCinema • 7Reels",
          title: "7Reels • VidBolt • 1080p",
          url: isTv
            ? "https://vidbolt.xyz/embed/tv/" + idStr + "/" + sStr + "/" + eStr + "?autoPlay=true&color=16A085"
            : "https://vidbolt.xyz/embed/movie/" + idStr + "?autoPlay=true&color=16A085",
          quality: 1080,
          provider: "wiocinema-7reels",
          format: "video",
          headers: { "User-Agent": UA, "Referer": HOST + "/" },
          subtitles: subs
        }
      ];
    })
    .catch(function (error) {
      console.error("[WioCinema 7Reels] " + (error && error.message ? error.message : String(error)));
      return [];
    });
}

module.exports = { getStreams: getStreams };
