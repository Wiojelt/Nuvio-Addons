/* SPDX-License-Identifier: GPL-3.0-only
 * WioCinema Newtane Provider (Movie, Series, Anime Multi-Server Router)
 * Copyright (c) 2026 Wiojelt.
 */
"use strict";

var HOST = "https://tv.newtane.com";
var PROXY_TMDB = "https://newtvproxy.newtane.com/api/tmdb";
var VIDFAST = "https://vidfast.vc";
var VIDCORE = "https://vidcore.io";
var DECRYPT = "https://enc-dec.app/api";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

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

function buildSubtitles(tmdbId, isTv, season, episode, extraTracks) {
  var idStr = encodeURIComponent(String(tmdbId));
  var query = isTv ? "&s=" + encodeURIComponent(String(season)) + "&e=" + encodeURIComponent(String(episode)) : "";
  var list = [];
  if (Array.isArray(extraTracks)) {
    extraTracks.forEach(function (tr, i) {
      if (tr && tr.file) {
        list.push({
          id: "newtane-emb-" + i,
          url: tr.file,
          language: (tr.label || "").toLowerCase().slice(0, 2) || "en",
          name: tr.label || "Subtitle " + (i + 1)
        });
      }
    });
  }
  var defaults = [
    { id: "newtane-sub-tr", url: "https://sub.vyper.top/vtt?tmdb=" + idStr + "&lang=tr" + query, language: "tr", name: "Turkish" },
    { id: "newtane-sub-en", url: "https://sub.vyper.top/vtt?tmdb=" + idStr + "&lang=en" + query, language: "en", name: "English" },
    { id: "newtane-sub-es", url: "https://sub.vyper.top/vtt?tmdb=" + idStr + "&lang=es" + query, language: "es", name: "Spanish" },
    { id: "newtane-sub-de", url: "https://sub.vyper.top/vtt?tmdb=" + idStr + "&lang=de" + query, language: "de", name: "German" },
    { id: "newtane-sub-fr", url: "https://sub.vyper.top/vtt?tmdb=" + idStr + "&lang=fr" + query, language: "fr", name: "French" }
  ];
  defaults.forEach(function (d) {
    if (!list.some(function (x) { return x.language === d.language; })) {
      list.push(d);
    }
  });
  return list;
}

function getImdbId(tmdbId, mediaType) {
  if (typeof tmdbId === "string" && tmdbId.startsWith("tt")) return Promise.resolve(tmdbId);
  var path = mediaType === "tv" ? "/tv/" + encodeURIComponent(String(tmdbId)) : "/movie/" + encodeURIComponent(String(tmdbId));
  return getText(PROXY_TMDB + path + "?append_to_response=external_ids", {
    "User-Agent": UA,
    "Origin": HOST,
    "Referer": HOST + "/"
  }).then(function (txt) {
    var data = parseJson(txt);
    if (data) {
      if (data.imdb_id) return data.imdb_id;
      if (data.external_ids && data.external_ids.imdb_id) return data.external_ids.imdb_id;
    }
    return String(tmdbId);
  }).catch(function () {
    return String(tmdbId);
  });
}

function resolveVidFast(tmdbId, mediaType, season, episode) {
  var isTv = mediaType === "tv" && season != null && episode != null;
  var page = isTv
    ? VIDFAST + "/tv/" + encodeURIComponent(String(tmdbId)) + "/" + encodeURIComponent(String(season)) + "/" + encodeURIComponent(String(episode)) + "/"
    : VIDFAST + "/movie/" + encodeURIComponent(String(tmdbId)) + "/";
  var h = { "User-Agent": UA, "Referer": VIDFAST + "/", "X-Requested-With": "XMLHttpRequest", "Accept": "*/*" };

  return getText(page, { "User-Agent": UA, "Referer": VIDFAST + "/", "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" }).then(function (body) {
    var m = /\"(?:en|token)\":\"(.*?)\"/.exec(body) || /["](?:en|token)["]s*:s*["]([^"]+)["]/.exec(body);
    if (!m) return [];
    return getText(DECRYPT + "/enc-vidfast?text=" + encodeURIComponent(m[1]) + "&stage=1", h)
      .then(parseJson)
      .then(function (enc) {
        if (!enc || enc.status !== 200 || !enc.result) return null;
        var r1 = enc.result;
        if (r1.stage1) {
          var h1 = Object.assign({}, h, r1.token ? { "X-CSRF-Token": r1.token } : {});
          return postJson(r1.stage1, null, h1)
            .then(function (p1) {
              if (!p1) return null;
              return getText(DECRYPT + "/enc-vidfast?text=" + encodeURIComponent(p1) + "&stage=2", h)
                .then(parseJson)
                .then(function (s2) { return s2 && s2.status === 200 && s2.result ? s2.result : null; });
            });
        }
        return r1;
      })
      .then(function (res) {
        if (!res || !res.servers || !res.stream) return [];
        var reqHeaders = Object.assign({}, h, res.token ? { "X-Csrf-Token": res.token } : {});
        return postJson(res.servers, null, reqHeaders)
          .then(function (txt) { return txt ? postJson(DECRYPT + "/dec-vidfast", { text: txt }) : ""; })
          .then(parseJson)
          .then(function (serversPayload) {
            var servers = serversPayload && serversPayload.result;
            if (!Array.isArray(servers)) return [];
            return Promise.all(servers.map(function (s) {
              if (!s || !s.data) return Promise.resolve(null);
              var baseStream = res.stream.endsWith("/") ? res.stream.slice(0, -1) : res.stream;
              return postJson(baseStream + "/" + s.data, null, reqHeaders)
                .then(function (enc) { return enc ? postJson(DECRYPT + "/dec-vidfast", { text: enc }) : ""; })
                .then(parseJson)
                .then(function (dec) {
                  var data = dec && dec.result;
                  if (!data || !data.url) return null;
                  var is4k = s.name === "vRapid" || s.name === "vBlaze" || data.is4kAvailable || data["4kAvailable"];
                  var subs = buildSubtitles(tmdbId, isTv, season, episode, data.tracks);
                  return {
                    name: "WioCinema • Newtane",
                    title: "Newtane • " + (s.name || "VidFast") + (is4k ? " • 4K [Multi-Sub]" : " • 1080p [Multi-Sub]"),
                    url: data.url,
                    quality: is4k ? 2160 : 1080,
                    provider: "wiocinema-newtane",
                    format: "m3u8",
                    headers: { "User-Agent": UA, "Referer": VIDFAST + "/" },
                    subtitles: subs
                  };
                }).catch(function () { return null; });
            })).then(function (list) { return list.filter(Boolean); });
          });
      });
  }).catch(function () { return []; });
}

function resolveVidCore(tmdbId, mediaType, season, episode) {
  var isTv = mediaType === "tv" && season != null && episode != null;
  var page = isTv
    ? VIDCORE + "/tv/" + encodeURIComponent(String(tmdbId)) + "/" + encodeURIComponent(String(season)) + "/" + encodeURIComponent(String(episode))
    : VIDCORE + "/movie/" + encodeURIComponent(String(tmdbId));
  var h = { "User-Agent": UA, "Referer": VIDCORE + "/", "X-Requested-With": "XMLHttpRequest", "Accept": "*/*" };

  return getText(page, { "User-Agent": UA, "Referer": VIDCORE + "/", "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" }).then(function (body) {
    var m = /\"(?:en|token)\":\"(.*?)\"/.exec(body) || /["](?:en|token)["]s*:s*["]([^"]+)["]/.exec(body);
    if (!m) return [];
    return getText(DECRYPT + "/enc-vidcore?text=" + encodeURIComponent(m[1]) + "&stage=1", h)
      .then(parseJson)
      .then(function (enc) {
        if (!enc || enc.status !== 200 || !enc.result) return null;
        var r1 = enc.result;
        if (r1.stage1) {
          var h1 = Object.assign({}, h, r1.token ? { "X-CSRF-Token": r1.token } : {});
          return postJson(r1.stage1, null, h1)
            .then(function (p1) {
              if (!p1) return null;
              return getText(DECRYPT + "/enc-vidcore?text=" + encodeURIComponent(p1) + "&stage=2", h)
                .then(parseJson)
                .then(function (s2) { return s2 && s2.status === 200 && s2.result ? s2.result : null; });
            });
        }
        return r1;
      })
      .then(function (res) {
        if (!res || !res.servers || !res.stream) return [];
        var reqHeaders = Object.assign({}, h, res.token ? { "X-Csrf-Token": res.token } : {});
        return postJson(res.servers, null, reqHeaders)
          .then(function (txt) { return txt ? postJson(DECRYPT + "/dec-vidcore", { text: txt }) : ""; })
          .then(parseJson)
          .then(function (serversPayload) {
            var servers = serversPayload && serversPayload.result;
            if (!Array.isArray(servers)) return [];
            return Promise.all(servers.map(function (s) {
              if (!s || !s.data) return Promise.resolve(null);
              var baseStream = res.stream.endsWith("/") ? res.stream.slice(0, -1) : res.stream;
              return postJson(baseStream + "/" + s.data, null, reqHeaders)
                .then(function (enc) { return enc ? postJson(DECRYPT + "/dec-vidcore", { text: enc }) : ""; })
                .then(parseJson)
                .then(function (dec) {
                  var data = dec && dec.result;
                  if (!data || !data.url) return null;
                  var subs = buildSubtitles(tmdbId, isTv, season, episode, data.tracks);
                  return {
                    name: "WioCinema • Newtane",
                    title: "Newtane • VidCore (" + (s.name || "Server") + ") • 1080p [Multi-Sub]",
                    url: data.url,
                    quality: 1080,
                    provider: "wiocinema-newtane",
                    format: "m3u8",
                    headers: { "User-Agent": UA, "Referer": VIDCORE + "/" },
                    subtitles: subs
                  };
                }).catch(function () { return null; });
            })).then(function (list) { return list.filter(Boolean); });
          });
      });
  }).catch(function () { return []; });
}

var MOVIE_SERVERS = [
  {
    name: "VidFast (4K • Multi-Server)",
    quality: 2160,
    preferredId: "imdb",
    movieUrl: function(id) { return "https://vidfast.vc/movie/" + id + "?title=false&theme=4285F4&server=vrapid&autoplay=true&autoNext=false&nextButton=false"; },
    tvUrl: function(id, s, e) { return "https://vidfast.vc/tv/" + id + "/" + s + "/" + e + "?title=false&theme=4285F4&server=vrapid&autoplay=true&autoNext=false&nextButton=false"; }
  },
  {
    name: "Videasy (4K • Multi-Audio)",
    quality: 2160,
    preferredId: "tmdb",
    movieUrl: function(id) { return "https://player.videasy.net/movie/" + id + "?color=4285F4&autoplay=true"; },
    tvUrl: function(id, s, e) { return "https://player.videasy.net/tv/" + id + "/" + s + "/" + e + "?color=4285F4&autoplay=true"; }
  },
  {
    name: "Vidcore (4K • Elite)",
    quality: 2160,
    preferredId: "imdb",
    movieUrl: function(id) { return "https://vidcore.io/movie/" + id + "?title=false&theme=4285F4&server=elite&autoplay=true&autoNext=false&nextButton=false"; },
    tvUrl: function(id, s, e) { return "https://vidcore.io/tv/" + id + "/" + s + "/" + e + "?title=false&theme=4285F4&server=elite&autoplay=true&autoNext=false&nextButton=false"; }
  },
  {
    name: "VidPro (CinemaOS • FHD)",
    quality: 1080,
    preferredId: "tmdb",
    movieUrl: function(id) { return "https://cinemaos.tech/player/" + id + "/?title=false&autoNext=false&nextButton=false&theme=4285F4&autoplay=true"; },
    tvUrl: function(id, s, e) { return "https://cinemaos.tech/player/" + id + "/" + s + "/" + e + "?title=false&autoNext=false&nextButton=false&theme=4285F4&autoplay=true"; }
  },
  {
    name: "VidLink (FHD • Fast)",
    quality: 1080,
    preferredId: "tmdb",
    movieUrl: function(id) { return "https://vidlink.pro/movie/" + id + "?primaryColor=4285F4&iconColor=eefdec&icons=default&player=default&title=false&poster=true&autoplay=true&nextbutton=false"; },
    tvUrl: function(id, s, e) { return "https://vidlink.pro/tv/" + id + "/" + s + "/" + e + "?primaryColor=4285F4&iconColor=eefdec&icons=default&player=default&title=false&poster=true&autoplay=true&nextbutton=false"; }
  },
  {
    name: "VidNest (FHD • Multi-Audio)",
    quality: 1080,
    preferredId: "tmdb",
    movieUrl: function(id) { return "https://vidnest.fun/movie/" + id; },
    tvUrl: function(id, s, e) { return "https://vidnest.fun/tv/" + id + "/" + s + "/" + e; }
  },
  {
    name: "VidSrc2 (FHD • Fast)",
    quality: 1080,
    preferredId: "tmdb",
    movieUrl: function(id) { return "https://vidsrc.party/embed/movie/" + id + "?autoplay=1&accent=4285F4"; },
    tvUrl: function(id, s, e) { return "https://vidsrc.party/embed/tv/" + id + "/" + s + "/" + e + "?autoplay=1&accent=4285F4"; }
  }
];

var ANIME_SERVERS = [
  {
    name: "TryEmbed [SUB]",
    quality: 1080,
    url: function(id, ep) { return "https://tryembed.us.cc/embed/anime/" + id + "/" + ep + "/sub?autoplay=true"; }
  },
  {
    name: "TryEmbed [DUB]",
    quality: 1080,
    url: function(id, ep) { return "https://tryembed.us.cc/embed/anime/" + id + "/" + ep + "/dub?autoplay=true"; }
  },
  {
    name: "MegaPlay [SUB]",
    quality: 1080,
    url: function(id, ep) { return "https://megaplay.buzz/stream/ani/" + id + "/" + ep + "/sub"; }
  },
  {
    name: "MegaPlay [DUB]",
    quality: 1080,
    url: function(id, ep) { return "https://megaplay.buzz/stream/ani/" + id + "/" + ep + "/dub"; }
  },
  {
    name: "AnimePahe [SUB]",
    quality: 1080,
    url: function(id, ep) { return "https://vidnest.fun/animepahe/" + id + "/" + ep + "/sub"; }
  },
  {
    name: "AnimePahe [DUB]",
    quality: 1080,
    url: function(id, ep) { return "https://vidnest.fun/animepahe/" + id + "/" + ep + "/dub"; }
  }
];

function getStreams(tmdbId, mediaType, season, episode) {
  if (tmdbId == null) return Promise.resolve([]);
  var isTv = mediaType === "tv" && season != null && episode != null;
  var isAnime = mediaType === "anime";
  var idStr = encodeURIComponent(String(tmdbId));
  var sStr = isTv ? encodeURIComponent(String(season)) : "1";
  var eStr = isTv ? encodeURIComponent(String(episode)) : (isAnime && episode != null ? encodeURIComponent(String(episode)) : "1");

  var subs = buildSubtitles(tmdbId, isTv, season, episode, []);

  var directTasks = isAnime ? Promise.resolve([]) : Promise.all([
    resolveVidFast(tmdbId, mediaType, season, episode),
    resolveVidCore(tmdbId, mediaType, season, episode)
  ]).then(function (results) {
    var out = [], seen = {};
    results.forEach(function (list) {
      if (Array.isArray(list)) {
        list.forEach(function (item) {
          if (item && item.url && !seen[item.url]) {
            seen[item.url] = true;
            out.push(item);
          }
        });
      }
    });
    return out;
  }).catch(function () { return []; });

  return Promise.all([
    directTasks,
    getImdbId(tmdbId, mediaType)
  ]).then(function (resolved) {
    var directStreams = resolved[0] || [];
    var imdbId = resolved[1] || idStr;
    var streams = [].concat(directStreams);
    var seenUrls = {};
    streams.forEach(function (s) { if (s && s.url) seenUrls[s.url] = true; });

    if (!isAnime) {
      MOVIE_SERVERS.forEach(function (srv) {
        var activeId = srv.preferredId === "imdb" && imdbId ? imdbId : idStr;
        var srvUrl = isTv ? srv.tvUrl(activeId, sStr, eStr) : srv.movieUrl(activeId);
        if (srvUrl && !seenUrls[srvUrl]) {
          seenUrls[srvUrl] = true;
          streams.push({
            name: "WioCinema • Newtane",
            title: "Newtane • " + srv.name + " [Multi-Sub]",
            url: srvUrl,
            quality: srv.quality,
            provider: "wiocinema-newtane",
            format: "m3u8",
            headers: { "User-Agent": UA, "Referer": HOST + "/" },
            subtitles: subs
          });
        }
      });
    }

    ANIME_SERVERS.forEach(function (asrv) {
      var animeUrl = asrv.url(idStr, eStr);
      if (animeUrl && !seenUrls[animeUrl]) {
        seenUrls[animeUrl] = true;
        streams.push({
          name: "WioCinema • Newtane",
          title: "Newtane • " + asrv.name + " [Multi-Sub]",
          url: animeUrl,
          quality: asrv.quality,
          provider: "wiocinema-newtane",
          format: "m3u8",
          headers: { "User-Agent": UA, "Referer": HOST + "/" },
          subtitles: subs
        });
      }
    });

    return streams;
  }).catch(function (error) {
    console.error("[WioCinema Newtane] " + (error && error.message ? error.message : String(error)));
    return [];
  });
}

module.exports = { getStreams: getStreams };
