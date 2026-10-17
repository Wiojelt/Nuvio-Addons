import fs from 'node:fs/promises';

const root = new URL('../', import.meta.url);

await fs.mkdir(new URL('providers', root), { recursive: true });
await fs.mkdir(new URL('wiocinema/providers', root), { recursive: true });
await fs.mkdir(new URL('generated/wiocinema', root), { recursive: true });

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";
const LOGO = "https://raw.githubusercontent.com/Wiojelt/WioCinema/main/assets/logo.png";

// 1. ClipBox Provider
const clipboxCode = `/* SPDX-License-Identifier: GPL-3.0-only
 * WioCinema ClipBox Provider
 */
"use strict";

var HOST = "https://vixsrc.to";
var UA = "${UA}";

function headers() {
  return {
    "User-Agent": UA,
    "Referer": HOST + "/",
    "Accept": "application/json, text/javascript, */*; q=0.01"
  };
}

function getStreams(tmdbId, mediaType, season, episode) {
  var isTv = mediaType === "tv" && season != null && episode != null;
  var path = isTv
    ? "/api/tv/" + encodeURIComponent(String(tmdbId)) + "/" + encodeURIComponent(String(season)) + "/" + encodeURIComponent(String(episode))
    : "/api/movie/" + encodeURIComponent(String(tmdbId));

  return fetch(HOST + path, { headers: headers() })
    .then(function (response) {
      if (!response.ok) return null;
      return response.json();
    })
    .then(function (payload) {
      if (!payload || !payload.src) return [];
      var pageUrl = /^https?:/i.test(payload.src) ? payload.src : HOST + payload.src;
      return fetch(pageUrl, { headers: headers() })
        .then(function (response) { return response.ok ? response.text() : ""; });
    })
    .then(function (html) {
      if (!html || Array.isArray(html)) return [];
      var streamMatch = /(?:url|file)\\s*:\\s*['\"]([^'\"]+)['\"]/.exec(html);
      var tokenMatch = /['\"]?token['\"]?\\s*:\\s*['\"]([^'\"]+)['\"]/.exec(html);
      var expiresMatch = /['\"]?expires['\"]?\\s*:\\s*['\"]([^'\"]+)['\"]/.exec(html);
      if (!streamMatch || !tokenMatch || !expiresMatch) return [];
      var stream = streamMatch[1];
      var url = stream + (stream.indexOf("?") >= 0 ? "&" : "?") +
        "token=" + encodeURIComponent(tokenMatch[1]) +
        "&expires=" + encodeURIComponent(expiresMatch[1]) + "&h=1";
      return [{
        name: "WioCinema • ClipBox",
        title: "ClipBox • VixSrc • 1080p",
        url: url,
        quality: 1080,
        provider: "wiocinema-clipbox",
        format: "m3u8",
        headers: { "User-Agent": UA, "Referer": HOST + "/" }
      }];
    })
    .catch(function (error) {
      console.error("[WioCinema ClipBox] " + (error && error.message ? error.message : String(error)));
      return [];
    });
}

module.exports = { getStreams: getStreams };
`;

// 2. CineStream Provider (Multi-source TMDB route consolidating Vidup, Hexa, VidFastPro, Vidcore, Xpass)
const cinestreamCode = `/* SPDX-License-Identifier: GPL-3.0-only
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
var UA = "${UA}";

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
    var m = /\\\\\\"(?:en|token)\\\\\\":\\\\\\"(.*?)\\\\\\"/.exec(html) || /[\\"](?:en|token)[\\"]\\s*:\\s*[\\"]([^\\"]+)[\\"]/.exec(html);
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
              return postJson(res.stream.replace(/\\/$/, "") + "/" + s.data, null, postHeaders)
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
    var m = /\\\\\\"(?:en|token)\\\\\\":\\\\\\"(.*?)\\\\\\"/.exec(body) || /[\\"](?:en|token)[\\"]\\s*:\\s*[\\"]([^\\"]+)[\\"]/.exec(body);
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
              return postJson(res.stream.replace(/\\/$/, "") + "/" + s.data, null, reqHeaders)
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
    var m = /\\\\\\"(?:en|token)\\\\\\":\\\\\\"(.*?)\\\\\\"/.exec(body) || /[\\"](?:en|token)[\\"]\\s*:\\s*[\\"]([^\\"]+)[\\"]/.exec(body);
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
              return postJson(res.stream.replace(/\\/$/, "") + "/" + s.data, null, reqHeaders)
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
    var m = /var\\s+backups\\s*=\\s*(\\[[\\s\\S]*?\\]);/.exec(html || "");
    var arr = m ? parseJson(m[1]) : [];
    if (!Array.isArray(arr) || !arr.length) {
      var tm = /<title>([^<]+)<\\/title>/i.exec(html);
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
      var serverUrl = /^https?:\\/\\//i.test(server.url) ? server.url : XPASS.replace(/\\/$/, "") + "/" + server.url.replace(/^\\//, "");
      return getText(serverUrl, { "User-Agent": UA, "Referer": embed })
        .then(function (body) {
          var root = parseJson(body);
          var sources = root && root.playlist && root.playlist[0] && root.playlist[0].sources;
          if (!Array.isArray(sources)) return [];
          return sources.filter(function (s) { return s && /^https?:\\/\\//i.test(s.file || ""); }).map(function (s) {
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
`;

// 3. Mapple Provider (VidSrc, Videasy, SmashyStream, RiveStream multi-extractor)
const mappleCode = `/* SPDX-License-Identifier: GPL-3.0-only
 * WioCinema Mapple Provider (Multi-source Global Route)
 */
"use strict";

var UA = "${UA}";

function parseJson(text) { try { return JSON.parse(text); } catch (_) { return null; } }
function getText(url, headers) {
  return fetch(url, { headers: headers || { "User-Agent": UA } }).then(function (r) { return r.ok ? r.text() : ""; });
}

function resolveVixSrc(tmdbId, mediaType, season, episode) {
  var isTv = mediaType === "tv" && season != null && episode != null;
  var path = isTv
    ? "https://vixsrc.to/api/tv/" + encodeURIComponent(String(tmdbId)) + "/" + encodeURIComponent(String(season)) + "/" + encodeURIComponent(String(episode))
    : "https://vixsrc.to/api/movie/" + encodeURIComponent(String(tmdbId));
  var h = { "User-Agent": UA, "Referer": "https://vixsrc.to/", "Accept": "application/json" };

  return getText(path, h)
    .then(parseJson)
    .then(function (payload) {
      if (!payload || !payload.src) return [];
      var pageUrl = /^https?:/i.test(payload.src) ? payload.src : "https://vixsrc.to" + payload.src;
      return getText(pageUrl, h);
    })
    .then(function (html) {
      if (!html) return [];
      var s = /(?:url|file)\\s*:\\s*['\"]([^'\"]+)['\"]/.exec(html);
      var t = /['\"]?token['\"]?\\s*:\\s*['\"]([^'\"]+)['\"]/.exec(html);
      var e = /['\"]?expires['\"]?\\s*:\\s*['\"]([^'\"]+)['\"]/.exec(html);
      if (!s || !t || !e) return [];
      var url = s[1] + (s[1].indexOf("?") >= 0 ? "&" : "?") + "token=" + encodeURIComponent(t[1]) + "&expires=" + encodeURIComponent(e[1]) + "&h=1";
      return [{
        name: "WioCinema • Mapple",
        title: "Mapple • VixSrc • 1080p",
        url: url,
        quality: 1080,
        provider: "wiocinema-mapple",
        format: "m3u8",
        headers: { "User-Agent": UA, "Referer": "https://vixsrc.to/" }
      }];
    }).catch(function () { return []; });
}

function resolveVidSrcMe(tmdbId, mediaType, season, episode) {
  var isTv = mediaType === "tv" && season != null && episode != null;
  var url = isTv
    ? "https://vidsrc.me/embed/tv?tmdb=" + encodeURIComponent(String(tmdbId)) + "&season=" + encodeURIComponent(String(season)) + "&episode=" + encodeURIComponent(String(episode))
    : "https://vidsrc.me/embed/movie?tmdb=" + encodeURIComponent(String(tmdbId));
  return [{ name: "WioCinema • Mapple", title: "Mapple • VidSrc Me • 1080p", url: url, quality: 1080, provider: "wiocinema-mapple", format: "video", headers: { "User-Agent": UA, "Referer": "https://vidsrc.me/" } }];
}

function resolveVidSrcTo(tmdbId, mediaType, season, episode) {
  var isTv = mediaType === "tv" && season != null && episode != null;
  var url = isTv
    ? "https://vidsrc.to/embed/tv/" + encodeURIComponent(String(tmdbId)) + "/" + encodeURIComponent(String(season)) + "/" + encodeURIComponent(String(episode))
    : "https://vidsrc.to/embed/movie/" + encodeURIComponent(String(tmdbId));
  return [{ name: "WioCinema • Mapple", title: "Mapple • VidSrc To • 1080p", url: url, quality: 1080, provider: "wiocinema-mapple", format: "video", headers: { "User-Agent": UA, "Referer": "https://vidsrc.to/" } }];
}

function resolveVidSrcCc(tmdbId, mediaType, season, episode) {
  var isTv = mediaType === "tv" && season != null && episode != null;
  var url = isTv
    ? "https://vidsrc.cc/v3/embed/tv/" + encodeURIComponent(String(tmdbId)) + "/" + encodeURIComponent(String(season)) + "/" + encodeURIComponent(String(episode))
    : "https://vidsrc.cc/v3/embed/movie/" + encodeURIComponent(String(tmdbId));
  return [{ name: "WioCinema • Mapple", title: "Mapple • VidSrc CC • 1080p", url: url, quality: 1080, provider: "wiocinema-mapple", format: "video", headers: { "User-Agent": UA, "Referer": "https://vidsrc.cc/" } }];
}

function resolveVidLink(tmdbId, mediaType, season, episode) {
  var isTv = mediaType === "tv" && season != null && episode != null;
  var url = isTv
    ? "https://vidlink.pro/tv/" + encodeURIComponent(String(tmdbId)) + "/" + encodeURIComponent(String(season)) + "/" + encodeURIComponent(String(episode))
    : "https://vidlink.pro/movie/" + encodeURIComponent(String(tmdbId));
  return [{ name: "WioCinema • Mapple", title: "Mapple • VidLink • 1080p", url: url, quality: 1080, provider: "wiocinema-mapple", format: "video", headers: { "User-Agent": UA, "Referer": "https://vidlink.pro/" } }];
}

function resolveVidFast(tmdbId, mediaType, season, episode) {
  var isTv = mediaType === "tv" && season != null && episode != null;
  var url = isTv
    ? "https://www.vidfast.pro/tv/" + encodeURIComponent(String(tmdbId)) + "/" + encodeURIComponent(String(season)) + "/" + encodeURIComponent(String(episode))
    : "https://www.vidfast.pro/movie/" + encodeURIComponent(String(tmdbId));
  return [{ name: "WioCinema • Mapple", title: "Mapple • VidFast • 1080p", url: url, quality: 1080, provider: "wiocinema-mapple", format: "video", headers: { "User-Agent": UA, "Referer": "https://www.vidfast.pro/" } }];
}

function resolveVideasy(tmdbId, mediaType, season, episode) {
  var isTv = mediaType === "tv" && season != null && episode != null;
  var url = isTv
    ? "https://player.videasy.net/tv/" + encodeURIComponent(String(tmdbId)) + "/" + encodeURIComponent(String(season)) + "/" + encodeURIComponent(String(episode))
    : "https://player.videasy.net/movie/" + encodeURIComponent(String(tmdbId));
  return [{ name: "WioCinema • Mapple", title: "Mapple • Videasy • 1080p", url: url, quality: 1080, provider: "wiocinema-mapple", format: "video", headers: { "User-Agent": UA, "Referer": "https://player.videasy.net/" } }];
}

function resolveSmashy(tmdbId, mediaType, season, episode) {
  var isTv = mediaType === "tv" && season != null && episode != null;
  var url = isTv
    ? "https://embed.smashystream.com/playere.php?tmdb=" + encodeURIComponent(String(tmdbId)) + "&season=" + encodeURIComponent(String(season)) + "&episode=" + encodeURIComponent(String(episode))
    : "https://embed.smashystream.com/playere.php?tmdb=" + encodeURIComponent(String(tmdbId));
  return [{ name: "WioCinema • Mapple", title: "Mapple • SmashyStream • 1080p", url: url, quality: 1080, provider: "wiocinema-mapple", format: "video", headers: { "User-Agent": UA, "Referer": "https://embed.smashystream.com/" } }];
}

function resolveRive(tmdbId, mediaType, season, episode) {
  var isTv = mediaType === "tv" && season != null && episode != null;
  var url = isTv
    ? "https://rivestream.live/embed?type=tv&id=" + encodeURIComponent(String(tmdbId)) + "&season=" + encodeURIComponent(String(season)) + "&episode=" + encodeURIComponent(String(episode))
    : "https://rivestream.live/embed?type=movie&id=" + encodeURIComponent(String(tmdbId));
  return [{ name: "WioCinema • Mapple", title: "Mapple • RiveStream • 1080p", url: url, quality: 1080, provider: "wiocinema-mapple", format: "video", headers: { "User-Agent": UA, "Referer": "https://rivestream.live/" } }];
}

function resolveSuperEmbed(tmdbId, mediaType, season, episode) {
  var isTv = mediaType === "tv" && season != null && episode != null;
  var url = isTv
    ? "https://multiembed.mov/?video_id=" + encodeURIComponent(String(tmdbId)) + "&tmdb=1&s=" + encodeURIComponent(String(season)) + "&e=" + encodeURIComponent(String(episode))
    : "https://multiembed.mov/?video_id=" + encodeURIComponent(String(tmdbId)) + "&tmdb=1";
  return [{ name: "WioCinema • Mapple", title: "Mapple • SuperEmbed • 1080p", url: url, quality: 1080, provider: "wiocinema-mapple", format: "video", headers: { "User-Agent": UA, "Referer": "https://multiembed.mov/" } }];
}

function getStreams(tmdbId, mediaType, season, episode) {
  if (tmdbId == null) return Promise.resolve([]);
  return resolveVixSrc(tmdbId, mediaType, season, episode).then(function (vixList) {
    var staticServers = []
      .concat(resolveVidSrcMe(tmdbId, mediaType, season, episode))
      .concat(resolveVidSrcTo(tmdbId, mediaType, season, episode))
      .concat(resolveVidSrcCc(tmdbId, mediaType, season, episode))
      .concat(resolveVidLink(tmdbId, mediaType, season, episode))
      .concat(resolveVidFast(tmdbId, mediaType, season, episode))
      .concat(resolveVideasy(tmdbId, mediaType, season, episode))
      .concat(resolveSmashy(tmdbId, mediaType, season, episode))
      .concat(resolveRive(tmdbId, mediaType, season, episode))
      .concat(resolveSuperEmbed(tmdbId, mediaType, season, episode));
    var out = vixList.concat(staticServers);
    var seen = {}, filtered = [];
    out.forEach(function (x) {
      if (x && x.url && !seen[x.url]) {
        seen[x.url] = true;
        filtered.push(x);
      }
    });
    return filtered;
  }).catch(function (error) {
    console.error("[WioCinema Mapple] " + (error && error.message ? error.message : String(error)));
    return [];
  });
}

module.exports = { getStreams: getStreams };
`;

// 4. BingeBang Provider
const bingebangCode = `/* SPDX-License-Identifier: GPL-3.0-only
 * WioCinema BingeBang Provider
 */
"use strict";

var HOST = "https://bingebang.tv";
var UA = "${UA}";

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
      var streamMatch = /(?:url|file|src)\\s*[:=]\\s*['\"]([^'\"]+\\.(?:m3u8|mp4)[^'\"]*)['\"]/i.exec(html);
      if (streamMatch) {
        return [{
          name: "WioCinema • BingeBang",
          title: "BingeBang • Stream • 1080p",
          url: streamMatch[1],
          quality: 1080,
          provider: "wiocinema-bingebang",
          format: streamMatch[1].indexOf(".m3u8") >= 0 ? "m3u8" : "video",
          headers: { "User-Agent": UA, "Referer": HOST + "/" }
        }];
      }
      return [{
        name: "WioCinema • BingeBang",
        title: "BingeBang • Player • 1080p",
        url: pageUrl,
        quality: 1080,
        provider: "wiocinema-bingebang",
        format: "video",
        headers: { "User-Agent": UA, "Referer": HOST + "/" }
      }];
    }).catch(function (error) {
      console.error("[WioCinema BingeBang] " + (error && error.message ? error.message : String(error)));
      return [];
    });
}

module.exports = { getStreams: getStreams };
`;

// 5. CineCat Provider
const cinecatCode = `/* SPDX-License-Identifier: GPL-3.0-only
 * WioCinema CineCat Provider
 */
"use strict";

var HOST = "https://cinecat.eu";
var UA = "${UA}";

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
      var streamMatch = /(?:url|file|src)\\s*[:=]\\s*['\"]([^'\"]+\\.(?:m3u8|mp4)[^'\"]*)['\"]/i.exec(html);
      if (streamMatch) {
        return [{
          name: "WioCinema • CineCat",
          title: "CineCat • Stream • 1080p",
          url: streamMatch[1],
          quality: 1080,
          provider: "wiocinema-cinecat",
          format: streamMatch[1].indexOf(".m3u8") >= 0 ? "m3u8" : "video",
          headers: { "User-Agent": UA, "Referer": HOST + "/" }
        }];
      }
      return [{
        name: "WioCinema • CineCat",
        title: "CineCat • Player • 1080p",
        url: pageUrl,
        quality: 1080,
        provider: "wiocinema-cinecat",
        format: "video",
        headers: { "User-Agent": UA, "Referer": HOST + "/" }
      }];
    }).catch(function (error) {
      console.error("[WioCinema CineCat] " + (error && error.message ? error.message : String(error)));
      return [];
    });
}

module.exports = { getStreams: getStreams };
`;

// 6. FlixNetwork Provider
const flixnetworkCode = `/* SPDX-License-Identifier: GPL-3.0-only
 * WioCinema FlixNetwork Provider
 */
"use strict";

var HOST = "https://flixnetwork.is";
var UA = "${UA}";

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
      var streamMatch = /(?:url|file|src)\\s*[:=]\\s*['\"]([^'\"]+\\.(?:m3u8|mp4)[^'\"]*)['\"]/i.exec(html);
      if (streamMatch) {
        return [{
          name: "WioCinema • FlixNetwork",
          title: "FlixNetwork • Stream • 1080p",
          url: streamMatch[1],
          quality: 1080,
          provider: "wiocinema-flixnetwork",
          format: streamMatch[1].indexOf(".m3u8") >= 0 ? "m3u8" : "video",
          headers: { "User-Agent": UA, "Referer": HOST + "/" }
        }];
      }
      return [{
        name: "WioCinema • FlixNetwork",
        title: "FlixNetwork • Player • 1080p",
        url: pageUrl,
        quality: 1080,
        provider: "wiocinema-flixnetwork",
        format: "video",
        headers: { "User-Agent": UA, "Referer": HOST + "/" }
      }];
    }).catch(function (error) {
      console.error("[WioCinema FlixNetwork] " + (error && error.message ? error.message : String(error)));
      return [];
    });
}

module.exports = { getStreams: getStreams };
`;

// 7. Watch2Movies Provider
const watch2moviesCode = `/* SPDX-License-Identifier: GPL-3.0-only
 * WioCinema Watch2Movies Provider
 */
"use strict";

var HOST = "https://movies2watch.watch";
var UA = "${UA}";

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
      var streamMatch = /(?:url|file|src)\\s*[:=]\\s*['\"]([^'\"]+\\.(?:m3u8|mp4)[^'\"]*)['\"]/i.exec(html);
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
`;

// 8. 7Reels Provider
const sevenReelsCode = `/* SPDX-License-Identifier: GPL-3.0-only
 * WioCinema 7Reels Provider (4K Direct Master Stream Router)
 * Copyright (c) 2026 Wiojelt.
 */
"use strict";

var DECRYPT = "https://enc-dec.app/api";
var VIDFAST = "https://vidfast.vc";
var VIDCORE = "https://vidcore.io";
var VIXSRC = "https://vixsrc.to";
var HOST = "https://7reels.cc";
var UA = "${UA}";

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
          id: "7reels-emb-" + i,
          url: tr.file,
          language: (tr.label || "").toLowerCase().slice(0, 2) || "en",
          name: tr.label || "Subtitle " + (i + 1)
        });
      }
    });
  }
  var defaults = [
    { id: "7reels-sub-tr", url: "https://sub.vyper.top/vtt?tmdb=" + idStr + "&lang=tr" + query, language: "tr", name: "Turkish" },
    { id: "7reels-sub-en", url: "https://sub.vyper.top/vtt?tmdb=" + idStr + "&lang=en" + query, language: "en", name: "English" },
    { id: "7reels-sub-es", url: "https://sub.vyper.top/vtt?tmdb=" + idStr + "&lang=es" + query, language: "es", name: "Spanish" },
    { id: "7reels-sub-de", url: "https://sub.vyper.top/vtt?tmdb=" + idStr + "&lang=de" + query, language: "de", name: "German" }
  ];
  defaults.forEach(function (d) {
    if (!list.some(function (x) { return x.language === d.language; })) {
      list.push(d);
    }
  });
  return list;
}

function resolveVidFast(tmdbId, mediaType, season, episode) {
  var isTv = mediaType === "tv" && season != null && episode != null;
  var page = isTv
    ? VIDFAST + "/tv/" + encodeURIComponent(String(tmdbId)) + "/" + encodeURIComponent(String(season)) + "/" + encodeURIComponent(String(episode)) + "/"
    : VIDFAST + "/movie/" + encodeURIComponent(String(tmdbId)) + "/";
  var h = { "User-Agent": UA, "Referer": VIDFAST + "/", "X-Requested-With": "XMLHttpRequest", "Accept": "*/*" };

  return getText(page, { "User-Agent": UA, "Referer": VIDFAST + "/", "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" }).then(function (body) {
    var m = /\\\\\\"(?:en|token)\\\\\\":\\\\\\"(.*?)\\\\\\"/.exec(body) || /[\\"](?:en|token)[\\"]\\s*:\\s*[\\"]([^\\"]+)[\\"]/.exec(body);
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
                    name: "WioCinema • 7Reels",
                    title: "7Reels • " + (s.name || "VidFast") + (is4k ? " • 4K [Multi-Sub]" : " • 1080p [Multi-Sub]"),
                    url: data.url,
                    quality: is4k ? 2160 : 1080,
                    provider: "wiocinema-7reels",
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
    var m = /\\\\\\"(?:en|token)\\\\\\":\\\\\\"(.*?)\\\\\\"/.exec(body) || /[\\"](?:en|token)[\\"]\\s*:\\s*[\\"]([^\\"]+)[\\"]/.exec(body);
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
                    name: "WioCinema • 7Reels",
                    title: "7Reels • VidCore (" + (s.name || "Server") + ") • 1080p [Multi-Sub]",
                    url: data.url,
                    quality: 1080,
                    provider: "wiocinema-7reels",
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

function resolveVix(tmdbId, mediaType, season, episode) {
  var isTv = mediaType === "tv" && season != null && episode != null;
  var path = isTv
    ? VIXSRC + "/api/tv/" + encodeURIComponent(String(tmdbId)) + "/" + encodeURIComponent(String(season)) + "/" + encodeURIComponent(String(episode))
    : VIXSRC + "/api/movie/" + encodeURIComponent(String(tmdbId));
  var h = { "User-Agent": UA, "Referer": VIXSRC + "/", "Accept": "application/json" };

  return getText(path, h)
    .then(parseJson)
    .then(function (payload) {
      if (!payload || !payload.src) return [];
      var pageUrl = /^https?:/i.test(payload.src) ? payload.src : VIXSRC + payload.src;
      return getText(pageUrl, h);
    })
    .then(function (html) {
      if (!html) return [];
      var s = /(?:url|file)\\s*:\\s*['\"]([^'\"]+)['\"]/.exec(html);
      var t = /['\"]?token['\"]?\\s*:\\s*['\"]([^'\"]+)['\"]/.exec(html);
      var e = /['\"]?expires['\"]?\\s*:\\s*['\"]([^'\"]+)['\"]/.exec(html);
      if (!s || !t || !e) return [];
      var url = s[1] + (s[1].indexOf("?") >= 0 ? "&" : "?") + "token=" + encodeURIComponent(t[1]) + "&expires=" + encodeURIComponent(e[1]) + "&h=1";
      var subs = buildSubtitles(tmdbId, isTv, season, episode, []);
      return [{
        name: "WioCinema • 7Reels",
        title: "7Reels • VixDirect • 1080p [Multi-Sub]",
        url: url,
        quality: 1080,
        provider: "wiocinema-7reels",
        format: "m3u8",
        headers: { "User-Agent": UA, "Referer": VIXSRC + "/" },
        subtitles: subs
      }];
    }).catch(function () { return []; });
}

function getStreams(tmdbId, mediaType, season, episode) {
  if (tmdbId == null) return Promise.resolve([]);
  var isTv = mediaType === "tv" && season != null && episode != null;
  var idStr = encodeURIComponent(String(tmdbId));
  var sStr = isTv ? encodeURIComponent(String(season)) : "1";
  var eStr = isTv ? encodeURIComponent(String(episode)) : "1";

  return Promise.all([
    resolveVidFast(tmdbId, mediaType, season, episode),
    resolveVidCore(tmdbId, mediaType, season, episode),
    resolveVix(tmdbId, mediaType, season, episode)
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

    if (out.length === 0) {
      var subs = buildSubtitles(tmdbId, isTv, season, episode, []);
      return [
        {
          name: "WioCinema • 7Reels",
          title: "7Reels • VidFast • 4K [Multi-Sub]",
          url: isTv
            ? VIDFAST + "/tv/" + idStr + "/" + sStr + "/" + eStr + "?autoPlay=true&theme=16A085&nextButton=true&autoNext=true&sub=en"
            : VIDFAST + "/movie/" + idStr + "?autoPlay=true&theme=16A085&sub=en",
          quality: 2160,
          provider: "wiocinema-7reels",
          format: "m3u8",
          headers: { "User-Agent": UA, "Referer": HOST + "/" },
          subtitles: subs
        },
        {
          name: "WioCinema • 7Reels",
          title: "7Reels • VidCore • 1080p [Multi-Sub]",
          url: isTv
            ? VIDCORE + "/tv/" + idStr + "/" + sStr + "/" + eStr + "?autoPlay=true&sub=en"
            : VIDCORE + "/movie/" + idStr + "?autoPlay=true&sub=en",
          quality: 1080,
          provider: "wiocinema-7reels",
          format: "m3u8",
          headers: { "User-Agent": UA, "Referer": HOST + "/" },
          subtitles: subs
        }
      ];
    }
    return out;
  }).catch(function (error) {
    console.error("[WioCinema 7Reels] " + (error && error.message ? error.message : String(error)));
    return [];
  });
}

module.exports = { getStreams: getStreams };
`;

// 9. Velarium / Lightflix Provider
const velariumCode = `/* SPDX-License-Identifier: GPL-3.0-only
 * WioCinema Velarium / Lightflix Provider (Direct 4K Master Playlist Router)
 * Copyright (c) 2026 Wiojelt.
 */
"use strict";

var HOST = "https://velarium.cc";
var LIGHTFLIX_HOST = "https://lightflix.app";
var UA = "${UA}";

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
      var tokenMatch = /window\\.__REQUEST_TOKEN__\\s*=\\s*["']([^"']+)["']/.exec(html);
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
`;

// 10. Newtane Provider
const newtaneCode = `/* SPDX-License-Identifier: GPL-3.0-only
 * WioCinema Newtane Provider (Movie, Series, Anime Multi-Server Router)
 * Copyright (c) 2026 Wiojelt.
 */
"use strict";

var HOST = "https://tv.newtane.com";
var PROXY_TMDB = "https://newtvproxy.newtane.com/api/tmdb";
var VIDFAST = "https://vidfast.vc";
var VIDCORE = "https://vidcore.io";
var DECRYPT = "https://enc-dec.app/api";
var UA = "${UA}";

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

function resolveVixDirect(tmdbId, mediaType, season, episode) {
  var isTv = mediaType === "tv" && season != null && episode != null;
  var path = isTv
    ? "https://vixsrc.to/api/tv/" + encodeURIComponent(String(tmdbId)) + "/" + encodeURIComponent(String(season)) + "/" + encodeURIComponent(String(episode))
    : "https://vixsrc.to/api/movie/" + encodeURIComponent(String(tmdbId));
  var h = { "User-Agent": UA, "Referer": "https://vixsrc.to/", "Accept": "application/json" };

  return getText(path, h)
    .then(parseJson)
    .then(function (payload) {
      if (!payload || !payload.src) return [];
      var pageUrl = /^https?:/i.test(payload.src) ? payload.src : "https://vixsrc.to" + payload.src;
      return getText(pageUrl, h);
    })
    .then(function (html) {
      if (!html) return [];
      var s = /(?:url|file)\\s*:\\s*['"]([^'"]+)['"]/.exec(html);
      var t = /['"]?token['"]?\\s*:\\s*['"]([^'"]+)['"]/.exec(html);
      var e = /['"]?expires['"]?\\s*:\\s*['"]([^'"]+)['"]/.exec(html);
      if (!s || !t || !e) return [];
      var url = s[1] + (s[1].indexOf("?") >= 0 ? "&" : "?") + "token=" + encodeURIComponent(t[1]) + "&expires=" + encodeURIComponent(e[1]) + "&h=1";
      var subs = buildSubtitles(tmdbId, isTv, season, episode, []);
      return [{
        name: "WioCinema • Newtane",
        title: "Newtane • VixSrc • 1080p [Multi-Sub]",
        url: url,
        quality: 1080,
        provider: "wiocinema-newtane",
        format: "m3u8",
        headers: { "User-Agent": UA, "Referer": "https://vixsrc.to/" },
        subtitles: subs
      }];
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
    resolveVidCore(tmdbId, mediaType, season, episode),
    resolveVixDirect(tmdbId, mediaType, season, episode)
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
          var isM3u8 = /\\.m3u8(\\?|$)/i.test(srvUrl);
          streams.push({
            name: "WioCinema • Newtane",
            title: "Newtane • " + srv.name + " [Multi-Sub]",
            url: srvUrl,
            quality: srv.quality,
            provider: "wiocinema-newtane",
            format: isM3u8 ? "m3u8" : "video",
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
        var isM3u8 = /\\.m3u8(\\?|$)/i.test(animeUrl);
        streams.push({
          name: "WioCinema • Newtane",
          title: "Newtane • " + asrv.name + " [Multi-Sub]",
          url: animeUrl,
          quality: asrv.quality,
          provider: "wiocinema-newtane",
          format: isM3u8 ? "m3u8" : "video",
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

if (typeof module !== "undefined" && module.exports) module.exports = { getStreams: getStreams };
if (typeof exports !== "undefined") exports.getStreams = getStreams;
if (typeof globalThis !== "undefined") globalThis.getStreams = getStreams;
`;

const providers = [
  { file: 'wiocinema-clipbox.js', code: clipboxCode },
  { file: 'wiocinema-cinestream.js', code: cinestreamCode },
  { file: 'wiocinema-mapple.js', code: mappleCode },
  { file: 'wiocinema-bingebang.js', code: bingebangCode },
  { file: 'wiocinema-cinecat.js', code: cinecatCode },
  { file: 'wiocinema-flixnetwork.js', code: flixnetworkCode },
  { file: 'wiocinema-watch2movies.js', code: watch2moviesCode },
  { file: 'wiocinema-7reels.js', code: sevenReelsCode },
  { file: 'wiocinema-velarium.js', code: velariumCode },
  { file: 'wiocinema-newtane.js', code: newtaneCode }
];

for (const p of providers) {
  await fs.writeFile(new URL(`wiocinema/providers/${p.file}`, root), p.code, 'utf8');
  await fs.writeFile(new URL(`providers/${p.file}`, root), p.code, 'utf8');
}

const manifest = {
  id: "wioCinema",
  name: "WioCinema",
  version: "1.0.0",
  scrapers: [
    {
      id: "wiocinema-clipbox",
      name: "WioCinema • ClipBox",
      description: "Global ClipBox VixSrc direct TMDB provider.",
      version: "1.0.0",
      author: "Wiojelt",
      supportedTypes: ["movie", "tv"],
      filename: "providers/wiocinema-clipbox.js",
      enabled: true,
      hasSettings: false,
      logo: "https://raw.githubusercontent.com/Wiojelt/WioSinema/main/assets/logo-20261004.png?rev=2",
      contentLanguage: ["en"],
      formats: ["m3u8"],
      limited: false,
      disabledPlatforms: [],
      supportsExternalPlayer: true
    },
    {
      id: "wiocinema-cinestream",
      name: "WioCinema • CineStream",
      description: "Global multi-source movie and series provider (Vidup, Hexa, VidFast, Vidcore, Xpass).",
      version: "1.0.0",
      author: "Wiojelt",
      supportedTypes: ["movie", "tv"],
      filename: "providers/wiocinema-cinestream.js",
      enabled: true,
      hasSettings: false,
      logo: "https://raw.githubusercontent.com/SaurabhKaperwan/CSX/master/CineStream/icon.png",
      contentLanguage: ["en"],
      formats: ["m3u8", "mp4"],
      limited: false,
      disabledPlatforms: [],
      supportsExternalPlayer: true
    },
    {
      id: "wiocinema-mapple",
      name: "WioCinema • Mapple",
      description: "Global Mapple movie and series provider (VixSrc, VidSrc, Videasy).",
      version: "1.0.0",
      author: "Wiojelt",
      supportedTypes: ["movie", "tv"],
      filename: "providers/wiocinema-mapple.js",
      enabled: true,
      hasSettings: false,
      logo: "https://raw.githubusercontent.com/Wiojelt/test/builds/logos/mapple.png",
      contentLanguage: ["en"],
      formats: ["m3u8", "mp4"],
      limited: false,
      disabledPlatforms: [],
      supportsExternalPlayer: true
    },
    {
      id: "wiocinema-bingebang",
      name: "WioCinema • BingeBang",
      description: "Global BingeBang movie and series provider.",
      version: "1.0.0",
      author: "Wiojelt",
      supportedTypes: ["movie", "tv"],
      filename: "providers/wiocinema-bingebang.js",
      enabled: true,
      hasSettings: false,
      logo: "https://bingebang.tv/icon-512.png",
      contentLanguage: ["en"],
      formats: ["m3u8", "mp4"],
      limited: false,
      disabledPlatforms: [],
      supportsExternalPlayer: true
    },
    {
      id: "wiocinema-cinecat",
      name: "WioCinema • CineCat",
      description: "Global CineCat movie and series provider.",
      version: "1.0.0",
      author: "Wiojelt",
      supportedTypes: ["movie", "tv"],
      filename: "providers/wiocinema-cinecat.js",
      enabled: true,
      hasSettings: false,
      logo: "https://cinecat.eu/android-chrome-192x192.png?v=3",
      contentLanguage: ["en"],
      formats: ["m3u8", "mp4"],
      limited: false,
      disabledPlatforms: [],
      supportsExternalPlayer: true
    },
    {
      id: "wiocinema-flixnetwork",
      name: "WioCinema • FlixNetwork",
      description: "Global FlixNetwork movie and series provider.",
      version: "1.0.0",
      author: "Wiojelt",
      supportedTypes: ["movie", "tv"],
      filename: "providers/wiocinema-flixnetwork.js",
      enabled: true,
      hasSettings: false,
      logo: "https://www.google.com/s2/favicons?domain=flixnetwork.is&sz=128",
      contentLanguage: ["en"],
      formats: ["m3u8", "mp4"],
      limited: false,
      disabledPlatforms: [],
      supportsExternalPlayer: true
    },
    {
      id: "wiocinema-watch2movies",
      name: "WioCinema • Watch2Movies",
      description: "Global Watch2Movies provider.",
      version: "1.0.0",
      author: "Wiojelt",
      supportedTypes: ["movie", "tv"],
      filename: "providers/wiocinema-watch2movies.js",
      enabled: true,
      hasSettings: false,
      logo: "https://www.google.com/s2/favicons?domain=movies2watch.watch&sz=128",
      contentLanguage: ["en"],
      formats: ["m3u8", "mp4"],
      limited: false,
      disabledPlatforms: [],
      supportsExternalPlayer: true
    },
    {
      id: "wiocinema-7reels",
      name: "WioCinema • 7Reels",
      description: "Global 7Reels multi-server provider (VidFast 4K, Strigil 4K, VidEasy 4K, VidLink, VidCore, Multi-Sub).",
      version: "1.0.0",
      author: "Wiojelt",
      supportedTypes: ["movie", "tv"],
      filename: "providers/wiocinema-7reels.js",
      enabled: true,
      hasSettings: false,
      logo: "https://7reels.cc/7R.ico",
      contentLanguage: ["en"],
      formats: ["m3u8", "mp4"],
      limited: false,
      disabledPlatforms: [],
      supportsExternalPlayer: true
    },
    {
      id: "wiocinema-velarium",
      name: "WioCinema • Velarium",
      description: "Global Velarium / Lightflix multi-source 4K provider with multi-language subtitles.",
      version: "1.0.0",
      author: "Wiojelt",
      supportedTypes: ["movie", "tv"],
      filename: "providers/wiocinema-velarium.js",
      enabled: true,
      hasSettings: false,
      logo: "https://www.google.com/s2/favicons?domain=velarium.cc&sz=128",
      contentLanguage: ["en"],
      formats: ["m3u8"],
      limited: false,
      disabledPlatforms: [],
      supportsExternalPlayer: true
    },
    {
      id: "wiocinema-newtane",
      name: "WioCinema • Newtane",
      description: "Global Newtane multi-server provider (Movie, Series & Anime: VidFast 4K, Videasy 4K, VidCore, VidPro, VidLink, TryEmbed, MegaPlay, AnimePahe).",
      version: "1.0.0",
      author: "Wiojelt",
      supportedTypes: ["movie", "tv", "anime"],
      filename: "providers/wiocinema-newtane.js",
      enabled: true,
      hasSettings: false,
      logo: "https://tv.newtane.com/newtv-logo.png",
      contentLanguage: ["en"],
      formats: ["m3u8", "mp4"],
      limited: false,
      disabledPlatforms: [],
      supportsExternalPlayer: true
    }
  ]
};

const manifestJson = JSON.stringify(manifest, null, 2) + '\n';
await fs.writeFile(new URL('wiocinema/manifest.json', root), manifestJson, 'utf8');

await fs.writeFile(new URL('generated/wiocinema/provider-registry.json', root), JSON.stringify({
  generatedAt: new Date().toISOString(),
  manifestName: "WioCinema",
  version: "1.0.0",
  providers: manifest.scrapers.map(s => ({ id: s.id, name: s.name, filename: s.filename }))
}, null, 2) + '\n');

console.log(`Generated WioCinema Nuvio plugin with ${manifest.scrapers.length} native WioCinema providers.`);
