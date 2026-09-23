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
  var h = Object.assign({ "Content-Type": "application/json" }, headers || {});
  return fetch(url, { method: "POST", headers: h, body: payload == null ? undefined : JSON.stringify(payload) })
    .then(function (r) { return r.ok ? r.text() : ""; });
}
function getText(url, headers) {
  return fetch(url, { headers: headers || {} }).then(function (r) { return r.ok ? r.text() : ""; });
}

function resolveVidup(tmdbId, mediaType, season, episode) {
  var isTv = mediaType === "tv" && season != null && episode != null;
  var pageUrl = isTv
    ? VIDUP + "/tv/" + encodeURIComponent(String(tmdbId)) + "/" + encodeURIComponent(String(season)) + "/" + encodeURIComponent(String(episode))
    : VIDUP + "/movie/" + encodeURIComponent(String(tmdbId));
  var h = { "User-Agent": UA, "Referer": VIDUP + "/", "X-Requested-With": "XMLHttpRequest" };

  return getText(pageUrl, h).then(function (html) {
    var m = /\\\\\\"(?:en|token)\\\\\\":\\\\\\"(.*?)\\\\\\"/.exec(html) || /[\\"](?:en|token)[\\"]\\s*:\\s*[\\"]([^\\"]+)[\\"]/.exec(html);
    if (!m) return [];
    return getText(DECRYPT + "/enc-vidup?text=" + encodeURIComponent(m[1]))
      .then(parseJson)
      .then(function (encData) {
        if (!encData || encData.status !== 200 || !encData.result) return [];
        var res = encData.result;
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

  return getText(DECRYPT + "/enc-hexa")
    .then(parseJson)
    .then(function (tokData) {
      var tok = tokData && tokData.result && tokData.result.token;
      if (!tok) return [];
      var h = { "User-Agent": UA, "Accept": "text/plain", "X-Api-Key": "4f8a1cc39e9136c41504646444", "X-Fingerprint-Lite": "e9136c41504646444", "Referer": HEXA_REF, "X-Cap-Token": tok };
      return getText(url, h)
        .then(function (enc) {
          if (!enc) return [];
          return postJson(DECRYPT + "/dec-hexa", { text: enc })
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
  var h = { "User-Agent": UA, "Referer": VIDFAST + "/", "X-Requested-With": "XMLHttpRequest" };

  return getText(page, h).then(function (body) {
    var m = /\\\\\\"(?:en|token)\\\\\\":\\\\\\"(.*?)\\\\\\"/.exec(body) || /[\\"](?:en|token)[\\"]\\s*:\\s*[\\"]([^\\"]+)[\\"]/.exec(body);
    if (!m) return [];
    return getText(DECRYPT + "/enc-vidfast?text=" + encodeURIComponent(m[1]))
      .then(parseJson)
      .then(function (enc) {
        var res = enc && enc.result;
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
  var h = { "User-Agent": UA, "Referer": VIDCORE + "/", "X-Requested-With": "XMLHttpRequest" };

  return getText(page, h).then(function (body) {
    var m = /\\\\\\"(?:en|token)\\\\\\":\\\\\\"(.*?)\\\\\\"/.exec(body) || /[\\"](?:en|token)[\\"]\\s*:\\s*[\\"]([^\\"]+)[\\"]/.exec(body);
    if (!m) return [];
    return getText(DECRYPT + "/enc-vidcore?text=" + encodeURIComponent(m[1]))
      .then(parseJson)
      .then(function (enc) {
        var res = enc && enc.result;
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
    var m = /var\\s+backups\\s*=\\s*(\\[[\\s\\S]*?\\]);/.exec(html || "");
    var arr = m ? parseJson(m[1]) : [];
    if (!Array.isArray(arr)) return [];
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

function resolveVidSrc(tmdbId, mediaType, season, episode) {
  var isTv = mediaType === "tv" && season != null && episode != null;
  var embedUrl = isTv
    ? "https://vidsrc.me/embed/tv?tmdb=" + encodeURIComponent(String(tmdbId)) + "&season=" + encodeURIComponent(String(season)) + "&episode=" + encodeURIComponent(String(episode))
    : "https://vidsrc.me/embed/movie?tmdb=" + encodeURIComponent(String(tmdbId));
  return Promise.resolve([{
    name: "WioCinema • Mapple",
    title: "Mapple • VidSrc • 1080p",
    url: embedUrl,
    quality: 1080,
    provider: "wiocinema-mapple",
    format: "video",
    headers: { "User-Agent": UA, "Referer": "https://vidsrc.me/" }
  }]);
}

function resolveVideasy(tmdbId, mediaType, season, episode) {
  var isTv = mediaType === "tv" && season != null && episode != null;
  var embedUrl = isTv
    ? "https://player.videasy.net/tv/" + encodeURIComponent(String(tmdbId)) + "/" + encodeURIComponent(String(season)) + "/" + encodeURIComponent(String(episode))
    : "https://player.videasy.net/movie/" + encodeURIComponent(String(tmdbId));
  return Promise.resolve([{
    name: "WioCinema • Mapple",
    title: "Mapple • Videasy • 1080p",
    url: embedUrl,
    quality: 1080,
    provider: "wiocinema-mapple",
    format: "video",
    headers: { "User-Agent": UA, "Referer": "https://player.videasy.net/" }
  }]);
}

function getStreams(tmdbId, mediaType, season, episode) {
  if (tmdbId == null) return Promise.resolve([]);
  return Promise.all([
    resolveVixSrc(tmdbId, mediaType, season, episode),
    resolveVidSrc(tmdbId, mediaType, season, episode),
    resolveVideasy(tmdbId, mediaType, season, episode)
  ]).then(function (results) {
    var out = [];
    results.forEach(function (list) { list.forEach(function (x) { if (x && x.url) out.push(x); }); });
    return out;
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

const providers = [
  { file: 'wiocinema-clipbox.js', code: clipboxCode },
  { file: 'wiocinema-cinestream.js', code: cinestreamCode },
  { file: 'wiocinema-mapple.js', code: mappleCode },
  { file: 'wiocinema-bingebang.js', code: bingebangCode },
  { file: 'wiocinema-cinecat.js', code: cinecatCode },
  { file: 'wiocinema-flixnetwork.js', code: flixnetworkCode },
  { file: 'wiocinema-watch2movies.js', code: watch2moviesCode }
];

for (const p of providers) {
  await fs.writeFile(new URL(`wiocinema/providers/${p.file}`, root), p.code, 'utf8');
  await fs.writeFile(new URL(`providers/${p.file}`, root), p.code, 'utf8');
}

const manifest = {
  name: "WioCinema",
  version: "1.0.0",
  scrapers: [
    {
      id: "wiocinema-clipbox",
      name: "WioCinema • ClipBox",
      description: "Global ClipBox movie and series provider (VixSrc direct TMDB route).",
      version: "1.0.0",
      author: "Wiojelt",
      supportedTypes: ["movie", "tv"],
      filename: "providers/wiocinema-clipbox.js",
      enabled: true,
      hasSettings: false,
      logo: "https://raw.githubusercontent.com/Wiojelt/TurkSinema/main/assets/providers/ClipBox.png",
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
