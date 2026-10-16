/* SPDX-License-Identifier: GPL-3.0-only
 * WioCinema CineStream Provider (Unified Multi-Source TMDB Route)
 */
"use strict";

var DECRYPT = "https://enc-dec.app/api";
var VIDUP = "https://vidup.to";
var HEXA_API = "https://theemoviedb.hexa.su";
var HEXA_REF = "https://hexa.su/";
var VIDFAST = "https://vidfast.vc";
var VIDCORE = "https://vidcore.io";
var XPASS = "https://play.xpass.top";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

function parseJson(text) { try { return JSON.parse(text); } catch (_) { return null; } }
function postJson(url, payload, headers) {
  var h = Object.assign({}, headers || {});
  if (payload != null) h["Content-Type"] = "application/json";
  return fetch(url, { method: "POST", headers: h, body: payload == null ? undefined : JSON.stringify(payload) })
    .then(function (r) { return r.ok ? r.text() : ""; });
}
function getText(url, headers) {
  return fetch(url, { headers: headers || {} }).then(function (r) { return r.ok ? r.text() : ""; });
}

function randomHex(bytes) {
  var out = "";
  for (var i = 0; i < bytes; i++) {
    var n = Math.floor(Math.random() * 256).toString(16);
    out += n.length === 1 ? "0" + n : n;
  }
  return out;
}

function resolveVidup(tmdbId, mediaType, season, episode) {
  var isTv = mediaType === "tv" && season != null && episode != null;
  var pageUrl = isTv
    ? VIDUP + "/tv/" + encodeURIComponent(String(tmdbId)) + "/" + encodeURIComponent(String(season)) + "/" + encodeURIComponent(String(episode))
    : VIDUP + "/movie/" + encodeURIComponent(String(tmdbId));
  var h = { "User-Agent": UA, "Referer": VIDUP + "/", "X-Requested-With": "XMLHttpRequest", "Accept": "*/*" };

  return getText(pageUrl, { "User-Agent": UA, "Referer": VIDUP + "/", "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" }).then(function (html) {
    var m = /\\\"(?:en|token)\\\":\\\"(.*?)\\\"/.exec(html) || /[\"](?:en|token)[\"]\s*:\s*[\"]([^\"]+)[\"]/.exec(html);
    if (!m) return [];
    return getText(DECRYPT + "/enc-vidup?text=" + encodeURIComponent(m[1]) + "&stage=1", h)
      .then(parseJson)
      .then(function (encData) {
        if (!encData || encData.status !== 200 || !encData.result) return null;
        var r1 = encData.result;
        if (r1.stage1) {
          var h1 = Object.assign({}, h, r1.token ? { "X-CSRF-Token": r1.token } : {});
          return postJson(r1.stage1, null, h1)
            .then(function (p1) {
              if (!p1) return null;
              return getText(DECRYPT + "/enc-vidup?text=" + encodeURIComponent(p1) + "&stage=2", h)
                .then(parseJson)
                .then(function (s2) { return s2 && s2.status === 200 && s2.result ? s2.result : null; });
            });
        }
        return r1;
      })
      .then(function (res) {
        if (!res || !res.servers || !res.stream) return [];
        var postHeaders = Object.assign({}, h, res.token ? { "X-Csrf-Token": res.token } : {});
        return postJson(res.servers, null, postHeaders)
          .then(function (encServers) { return encServers ? postJson(DECRYPT + "/dec-vidup", { text: encServers }) : ""; })
          .then(parseJson)
          .then(function (serversData) {
            if (!serversData || serversData.status !== 200 || !Array.isArray(serversData.result)) return [];
            return Promise.all(serversData.result.map(function (s) {
              if (!s || !s.data) return Promise.resolve(null);
              return postJson(res.stream.replace(/\/$/, "") + "/" + s.data, null, postHeaders)
                .then(function (encStream) { return encStream ? postJson(DECRYPT + "/dec-vidup", { text: encStream }) : ""; })
                .then(parseJson)
                .then(function (decStream) {
                  var url = decStream && decStream.status === 200 && decStream.result && decStream.result.url;
                  if (!url) return null;
                  return {
                    name: "WioCinema • CineStream",
                    title: "CineStream • Vidup (" + (s.name || "Server") + ") • 1080p",
                    url: url,
                    quality: 1080,
                    provider: "wiocinema-cinestream",
                    format: url.indexOf(".m3u8") >= 0 ? "m3u8" : "video",
                    headers: { "User-Agent": UA, "Referer": VIDUP + "/" }
                  };
                }).catch(function () { return null; });
            })).then(function (streams) { return streams.filter(Boolean); });
          });
      });
  }).catch(function () { return []; });
}

function resolveHexa(tmdbId, mediaType, season, episode) {
  var isTv = mediaType === "tv" && season != null && episode != null;
  var url = isTv
    ? HEXA_API + "/api/tmdb/tv/" + encodeURIComponent(String(tmdbId)) + "/season/" + encodeURIComponent(String(season)) + "/episode/" + encodeURIComponent(String(episode)) + "/images"
    : HEXA_API + "/api/tmdb/movie/" + encodeURIComponent(String(tmdbId)) + "/images";

  var key = randomHex(32);
  return getText(DECRYPT + "/enc-hexa")
    .then(parseJson)
    .then(function (tokData) {
      var tok = tokData && tokData.result && tokData.result.token;
      if (!tok) return [];
      var h = { "User-Agent": UA, "Accept": "text/plain", "X-Api-Key": key, "X-Fingerprint-Lite": "e9136c41504646444", "Referer": HEXA_REF, "X-Cap-Token": tok };
      return getText(url, h)
        .then(function (enc) {
          if (!enc) return [];
          return postJson(DECRYPT + "/dec-hexa", { text: enc, key: key })
            .then(parseJson)
            .then(function (data) {
              var sources = data && data.result && data.result.sources;
              if (!Array.isArray(sources)) return [];
              return sources.filter(function (s) { return s && s.url; }).map(function (s) {
                return {
                  name: "WioCinema • CineStream",
                  title: "CineStream • Hexa (" + (s.server || "Stream") + ") • 1080p",
                  url: s.url,
                  quality: 1080,
                  provider: "wiocinema-cinestream",
                  format: s.url.indexOf(".m3u8") >= 0 ? "m3u8" : "video",
                  headers: { "User-Agent": UA, "Referer": HEXA_REF }
                };
              });
            });
        });
    }).catch(function () { return []; });
}

function resolveVidFastPro(tmdbId, mediaType, season, episode) {
  var isTv = mediaType === "tv" && season != null && episode != null;
  var page = isTv
    ? VIDFAST + "/tv/" + encodeURIComponent(String(tmdbId)) + "/" + encodeURIComponent(String(season)) + "/" + encodeURIComponent(String(episode)) + "/"
    : VIDFAST + "/movie/" + encodeURIComponent(String(tmdbId)) + "/";
  var h = { "User-Agent": UA, "Referer": VIDFAST + "/", "X-Requested-With": "XMLHttpRequest", "Accept": "*/*" };

  return getText(page, { "User-Agent": UA, "Referer": VIDFAST + "/", "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" }).then(function (body) {
    var m = /\\\"(?:en|token)\\\":\\\"(.*?)\\\"/.exec(body) || /[\"](?:en|token)[\"]\s*:\s*[\"]([^\"]+)[\"]/.exec(body);
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
              return postJson(res.stream.replace(/\/$/, "") + "/" + s.data, null, reqHeaders)
                .then(function (enc) { return enc ? postJson(DECRYPT + "/dec-vidfast", { text: enc }) : ""; })
                .then(parseJson)
                .then(function (dec) {
                  var data = dec && dec.result;
                  if (!data || !data.url) return null;
                  return {
                    name: "WioCinema • CineStream",
                    title: "CineStream • VidFastPro (" + (s.name || "Server") + ") • " + (data.is4kAvailable ? "4K" : "1080p"),
                    url: data.url,
                    quality: data.is4kAvailable ? 2160 : 1080,
                    provider: "wiocinema-cinestream",
                    format: data.url.indexOf(".m3u8") >= 0 ? "m3u8" : "video",
                    headers: { "User-Agent": UA, "Referer": VIDFAST + "/" }
                  };
                }).catch(function () { return null; });
            })).then(function (list) { return list.filter(Boolean); });
          });
      });
  }).catch(function () { return []; });
}

function resolveVidcore(tmdbId, mediaType, season, episode) {
  var isTv = mediaType === "tv" && season != null && episode != null;
  var page = isTv
    ? VIDCORE + "/tv/" + encodeURIComponent(String(tmdbId)) + "/" + encodeURIComponent(String(season)) + "/" + encodeURIComponent(String(episode))
    : VIDCORE + "/movie/" + encodeURIComponent(String(tmdbId));
  var h = { "User-Agent": UA, "Referer": VIDCORE + "/", "X-Requested-With": "XMLHttpRequest", "Accept": "*/*" };

  return getText(page, { "User-Agent": UA, "Referer": VIDCORE + "/", "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" }).then(function (body) {
    var m = /\\\"(?:en|token)\\\":\\\"(.*?)\\\"/.exec(body) || /[\"](?:en|token)[\"]\s*:\s*[\"]([^\"]+)[\"]/.exec(body);
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
              return postJson(res.stream.replace(/\/$/, "") + "/" + s.data, null, reqHeaders)
                .then(function (enc) { return enc ? postJson(DECRYPT + "/dec-vidcore", { text: enc }) : ""; })
                .then(parseJson)
                .then(function (dec) {
                  var data = dec && dec.result;
                  if (!data || !data.url) return null;
                  return {
                    name: "WioCinema • CineStream",
                    title: "CineStream • Vidcore (" + (s.name || "Server") + ") • 1080p",
                    url: data.url,
                    quality: 1080,
                    provider: "wiocinema-cinestream",
                    format: data.url.indexOf(".m3u8") >= 0 ? "m3u8" : "video",
                    headers: { "User-Agent": UA, "Referer": VIDCORE + "/" }
                  };
                }).catch(function () { return null; });
            })).then(function (list) { return list.filter(Boolean); });
          });
      });
  }).catch(function () { return []; });
}

function resolveXpass(tmdbId, mediaType, season, episode) {
  var isTv = mediaType === "tv" && season != null && episode != null;
  var embed = isTv
    ? XPASS + "/e/tv/" + encodeURIComponent(String(tmdbId)) + "/" + encodeURIComponent(String(season)) + "/" + encodeURIComponent(String(episode))
    : XPASS + "/e/movie/" + encodeURIComponent(String(tmdbId));

  return getText(embed, { "User-Agent": UA, "Referer": XPASS + "/" }).then(function (html) {
    if (!html) return [];
    var m = /var\s+backups\s*=\s*(\[[\s\S]*?\]);/.exec(html || "");
    var arr = m ? parseJson(m[1]) : [];
    if (!Array.isArray(arr) || !arr.length) {
      var tm = /<title>([^<]+)<\/title>/i.exec(html);
      return [{
        name: "WioCinema • CineStream",
        title: "CineStream • Xpass (" + (tm && tm[1] ? tm[1].trim() : "Player") + ") • 1080p",
        url: embed,
        quality: 1080,
        provider: "wiocinema-cinestream",
        format: "video",
        headers: { "User-Agent": UA, "Referer": XPASS + "/" }
      }];
    }
    return Promise.all(arr.filter(function (x) { return x && x.url; }).map(function (server) {
      var serverUrl = /^https?:\/\//i.test(server.url) ? server.url : XPASS.replace(/\/$/, "") + "/" + server.url.replace(/^\//, "");
      return getText(serverUrl, { "User-Agent": UA, "Referer": embed })
        .then(function (body) {
          var root = parseJson(body);
          var sources = root && root.playlist && root.playlist[0] && root.playlist[0].sources;
          if (!Array.isArray(sources)) return [];
          return sources.filter(function (s) { return s && /^https?:\/\//i.test(s.file || ""); }).map(function (s) {
            return {
              name: "WioCinema • CineStream",
              title: "CineStream • Xpass (" + (server.name || "Server") + ") • 1080p",
              url: s.file,
              quality: 1080,
              provider: "wiocinema-cinestream",
              format: /hls/i.test(s.type || "") || s.file.indexOf(".m3u8") >= 0 ? "m3u8" : "video",
              headers: { "User-Agent": UA, "Referer": XPASS + "/" }
            };
          });
        }).catch(function () { return []; });
    })).then(function (groups) {
      var out = [];
      groups.forEach(function (g) { g.forEach(function (x) { if (x && x.url) out.push(x); }); });
      return out;
    });
  }).catch(function () { return []; });
}

function getStreams(tmdbId, mediaType, season, episode) {
  if (tmdbId == null) return Promise.resolve([]);
  return Promise.all([
    resolveVidup(tmdbId, mediaType, season, episode),
    resolveHexa(tmdbId, mediaType, season, episode),
    resolveVidFastPro(tmdbId, mediaType, season, episode),
    resolveVidcore(tmdbId, mediaType, season, episode),
    resolveXpass(tmdbId, mediaType, season, episode)
  ]).then(function (results) {
    var out = [], seen = {};
    results.forEach(function (list) {
      list.forEach(function (item) {
        if (item && item.url && !seen[item.url]) {
          seen[item.url] = true;
          out.push(item);
        }
      });
    });
    return out;
  }).catch(function (error) {
    console.error("[WioCinema CineStream] " + (error && error.message ? error.message : String(error)));
    return [];
  });
}

module.exports = { getStreams: getStreams };
