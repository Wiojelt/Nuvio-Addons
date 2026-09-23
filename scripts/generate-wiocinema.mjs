import fs from 'node:fs/promises';

const root = new URL('../', import.meta.url);

await fs.mkdir(new URL('providers', root), { recursive: true });
await fs.mkdir(new URL('wiocinema/providers', root), { recursive: true });
await fs.mkdir(new URL('generated/wiocinema', root), { recursive: true });

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";
const LOGO = "https://raw.githubusercontent.com/Wiojelt/WioCinema/main/assets/logo.png";

const clipboxCode = `/* SPDX-License-Identifier: GPL-3.0-only
 * WioCinema ClipBox/VixSrc direct TMDB route.
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

const vidupCode = `/* SPDX-License-Identifier: GPL-3.0-only
 * WioCinema Vidup direct TMDB route.
 */
"use strict";

var VIDUP = "https://vidup.to";
var DECRYPT = "https://enc-dec.app/api";
var UA = "${UA}";

function baseHeaders() {
  return {
    "User-Agent": UA,
    "Referer": VIDUP + "/",
    "X-Requested-With": "XMLHttpRequest"
  };
}

function jsonPost(url, payload, headers) {
  var h = Object.assign({ "Content-Type": "application/json" }, headers || {});
  return fetch(url, { method: "POST", headers: h, body: JSON.stringify(payload) })
    .then(function (r) { return r.ok ? r.text() : ""; });
}

function emptyPost(url, headers) {
  return fetch(url, { method: "POST", headers: headers || {} })
    .then(function (r) { return r.ok ? r.text() : ""; });
}

function parseJson(text) {
  try { return JSON.parse(text); } catch (_) { return null; }
}

function extractEncryptedToken(text) {
  var escaped = /\\\\\\"(?:en|token)\\\\\\":\\\\\\"(.*?)\\\\\\"/.exec(text || "");
  if (escaped) return escaped[1];
  var normal = /[\\"](?:en|token)[\\"]\\s*:\\s*[\\"]([^\\"]+)[\\"]/.exec(text || "");
  return normal ? normal[1] : null;
}

function decrypt(text) {
  return jsonPost(DECRYPT + "/dec-vidup", { text: text }, null)
    .then(parseJson);
}

function resolveServer(server, streamBase, postHeaders) {
  if (!server || !server.data) return Promise.resolve([]);
  var name = server.name || "Vidup";
  var streamUrl = streamBase.replace(/\\/$/, "") + "/" + server.data;
  return emptyPost(streamUrl, postHeaders)
    .then(function (encrypted) { return encrypted ? decrypt(encrypted) : null; })
    .then(function (decoded) {
      if (!decoded || decoded.status !== 200 || !decoded.result || !decoded.result.url) return [];
      var finalUrl = decoded.result.url;
      return [{
        name: "WioCinema • Vidup",
        title: "Vidup • " + name + " • 1080p",
        url: finalUrl,
        quality: 1080,
        provider: "wiocinema-vidup",
        format: finalUrl.indexOf(".m3u8") >= 0 ? "m3u8" : "video",
        headers: { "User-Agent": UA, "Referer": VIDUP + "/" }
      }];
    })
    .catch(function () { return []; });
}

function getStreams(tmdbId, mediaType, season, episode) {
  if (tmdbId == null) return Promise.resolve([]);
  var isTv = mediaType === "tv" && season != null && episode != null;
  var pageUrl = isTv
    ? VIDUP + "/tv/" + encodeURIComponent(String(tmdbId)) + "/" + encodeURIComponent(String(season)) + "/" + encodeURIComponent(String(episode))
    : VIDUP + "/movie/" + encodeURIComponent(String(tmdbId));

  return fetch(pageUrl, { headers: baseHeaders() })
    .then(function (r) { return r.ok ? r.text() : ""; })
    .then(function (html) {
      var token = extractEncryptedToken(html);
      if (!token) return [];
      var encUrl = DECRYPT + "/enc-vidup?text=" + encodeURIComponent(token);
      return fetch(encUrl)
        .then(function (r) { return r.ok ? r.text() : ""; })
        .then(parseJson)
        .then(function (encData) {
          if (!encData || encData.status !== 200 || !encData.result) return [];
          var res = encData.result;
          var serversUrl = res.servers;
          var streamBase = res.stream;
          var csrf = res.token;
          if (!serversUrl || !streamBase) return [];
          var postHeaders = Object.assign(baseHeaders(), csrf ? { "X-Csrf-Token": csrf } : {});
          return emptyPost(serversUrl, postHeaders)
            .then(function (encServers) { return encServers ? decrypt(encServers) : null; })
            .then(function (serversData) {
              if (!serversData || serversData.status !== 200 || !Array.isArray(serversData.result)) return [];
              return Promise.all(serversData.result.map(function (server) {
                return resolveServer(server, streamBase, postHeaders);
              })).then(function (nested) {
                var out = [], seen = {};
                nested.forEach(function (group) {
                  group.forEach(function (stream) {
                    if (stream && stream.url && !seen[stream.url]) {
                      seen[stream.url] = true;
                      out.push(stream);
                    }
                  });
                });
                return out;
              });
            });
        });
    })
    .catch(function (error) {
      console.error("[WioCinema Vidup] " + (error && error.message ? error.message : String(error)));
      return [];
    });
}

module.exports = { getStreams: getStreams };
`;

const hexaCode = `/* SPDX-License-Identifier: GPL-3.0-only
 * WioCinema Hexa direct TMDB route.
 */
"use strict";

var HEXA_API = "https://theemoviedb.hexa.su";
var DECRYPT_API = "https://enc-dec.app/api";
var HEXA_REFERER = "https://hexa.su/";
var UA = "${UA}";

function randomHex(bytes) {
  var out = "";
  for (var i = 0; i < bytes; i++) {
    var n = Math.floor(Math.random() * 256).toString(16);
    out += n.length === 1 ? "0" + n : n;
  }
  return out;
}

function parseJson(text) {
  try { return JSON.parse(text); } catch (_) { return null; }
}

function getText(url, headers) {
  return fetch(url, { headers: headers || {} }).then(function (r) { return r.ok ? r.text() : ""; });
}

function postJson(url, payload) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }).then(function (r) { return r.ok ? r.text() : ""; });
}

function getStreams(tmdbId, mediaType, season, episode) {
  if (tmdbId == null) return Promise.resolve([]);
  var isTv = mediaType === "tv" && season != null && episode != null;
  var url = isTv
    ? HEXA_API + "/api/tmdb/tv/" + encodeURIComponent(String(tmdbId)) + "/season/" + encodeURIComponent(String(season)) + "/episode/" + encodeURIComponent(String(episode)) + "/images"
    : HEXA_API + "/api/tmdb/movie/" + encodeURIComponent(String(tmdbId)) + "/images";

  var key = randomHex(32);
  return getText(DECRYPT_API + "/enc-hexa")
    .then(function (tokenText) {
      var tokenJson = parseJson(tokenText);
      var token = tokenJson && tokenJson.result && tokenJson.result.token;
      if (!token) return null;
      var headers = {
        "User-Agent": UA,
        "Accept": "text/plain",
        "X-Api-Key": key,
        "X-Fingerprint-Lite": "e9136c41504646444",
        "Referer": HEXA_REFERER,
        "X-Cap-Token": token
      };
      return getText(url, headers);
    })
    .then(function (encrypted) {
      if (!encrypted) return [];
      return postJson(DECRYPT_API + "/dec-hexa", { text: encrypted })
        .then(parseJson)
        .then(function (data) {
          var sources = data && data.result && data.result.sources;
          if (!Array.isArray(sources)) return [];
          var out = [], seen = {};
          for (var i = 0; i < sources.length; i++) {
            var item = sources[i];
            var streamUrl = item && item.url;
            if (!streamUrl || seen[streamUrl]) continue;
            seen[streamUrl] = true;
            out.push({
              name: "WioCinema • Hexa",
              title: "Hexa • " + (item.server || "Stream") + " • 1080p",
              url: streamUrl,
              quality: 1080,
              provider: "wiocinema-hexa",
              format: streamUrl.indexOf(".m3u8") >= 0 ? "m3u8" : "video",
              headers: { "User-Agent": UA, "Referer": HEXA_REFERER }
            });
          }
          return out;
        });
    })
    .catch(function (error) {
      console.error("[WioCinema Hexa] " + (error && error.message ? error.message : String(error)));
      return [];
    });
}

module.exports = { getStreams: getStreams };
`;

const vidfastproCode = `/* SPDX-License-Identifier: GPL-3.0-only
 * WioCinema VidFastPro direct TMDB route.
 */
"use strict";

var VIDFAST = "https://vidfast.vc";
var DECRYPT = "https://enc-dec.app/api";
var UA = "${UA}";

function headers() {
  return { "User-Agent": UA, "Referer": VIDFAST + "/", "X-Requested-With": "XMLHttpRequest" };
}
function parseJson(text) { try { return JSON.parse(text); } catch (_) { return null; } }
function post(url, payload, h) {
  var hdr = Object.assign({ "Content-Type": "application/json" }, h || {});
  return fetch(url, { method: "POST", headers: hdr, body: payload == null ? undefined : JSON.stringify(payload) })
    .then(function (r) { return r.ok ? r.text() : ""; });
}
function encryptedToken(text) {
  var a = /\\\\\\"(?:en|token)\\\\\\":\\\\\\"(.*?)\\\\\\"/.exec(text || "");
  if (a) return a[1];
  var b = /[\\"](?:en|token)[\\"]\\s*:\\s*[\\"]([^\\"]+)[\\"]/.exec(text || "");
  return b ? b[1] : null;
}
function dec(text) {
  return post(DECRYPT + "/dec-vidfast", { text: text }).then(parseJson);
}
function resultOf(obj) { return obj && obj.result != null ? obj.result : null; }

function resolveServer(server, streamBase, requestHeaders) {
  if (!server || !server.data) return Promise.resolve([]);
  var endpoint = streamBase.replace(/\\/$/, "") + "/" + server.data;
  return post(endpoint, null, requestHeaders)
    .then(function (encrypted) { return encrypted ? dec(encrypted) : null; })
    .then(function (decoded) {
      var data = resultOf(decoded);
      if (!data || !data.url) return [];
      var q = data.is4kAvailable === true || /4k/i.test(server.description || "") ? 2160 : 1080;
      var url = data.url;
      return [{
        name: "WioCinema • VidFastPro",
        title: "VidFastPro • " + (server.name || "Server") + (server.description ? " • " + server.description : ""),
        url: url,
        quality: q,
        provider: "wiocinema-vidfastpro",
        format: url.indexOf(".m3u8") >= 0 ? "m3u8" : "video",
        headers: { "User-Agent": UA, "Referer": VIDFAST + "/", "X-Requested-With": "XMLHttpRequest" }
      }];
    }).catch(function () { return []; });
}

function getStreams(tmdbId, mediaType, season, episode) {
  if (tmdbId == null) return Promise.resolve([]);
  var isTv = mediaType === "tv" && season != null && episode != null;
  var page = isTv
    ? VIDFAST + "/tv/" + encodeURIComponent(String(tmdbId)) + "/" + encodeURIComponent(String(season)) + "/" + encodeURIComponent(String(episode)) + "/"
    : VIDFAST + "/movie/" + encodeURIComponent(String(tmdbId)) + "/";
  return fetch(page, { headers: headers() })
    .then(function (r) { return r.ok ? r.text() : ""; })
    .then(function (body) {
      var token = encryptedToken(body);
      if (!token) return [];
      return fetch(DECRYPT + "/enc-vidfast?text=" + encodeURIComponent(token))
        .then(function (r) { return r.ok ? r.text() : ""; })
        .then(parseJson)
        .then(function (enc) {
          var res = resultOf(enc);
          if (!res || !res.servers || !res.stream) return [];
          var reqHeaders = Object.assign(headers(), res.token ? { "X-Csrf-Token": res.token } : {});
          return post(res.servers, null, reqHeaders)
            .then(function (txt) { return txt ? dec(txt) : null; })
            .then(function (serversPayload) {
              var servers = resultOf(serversPayload);
              if (!Array.isArray(servers)) return [];
              return Promise.all(servers.map(function (s) {
                return resolveServer(s, res.stream, reqHeaders);
              })).then(function (nested) {
                var out = [], seen = {};
                nested.forEach(function (list) {
                  list.forEach(function (item) {
                    if (item.url && !seen[item.url]) {
                      seen[item.url] = true;
                      out.push(item);
                    }
                  });
                });
                return out;
              });
            });
        });
    }).catch(function (error) {
      console.error("[WioCinema VidFastPro] " + (error && error.message ? error.message : String(error)));
      return [];
    });
}

module.exports = { getStreams: getStreams };
`;

const vidcoreCode = `/* SPDX-License-Identifier: GPL-3.0-only
 * WioCinema Vidcore direct TMDB route.
 */
"use strict";

var VIDCORE = "https://vidcore.io";
var DECRYPT = "https://enc-dec.app/api";
var UA = "${UA}";

function headers() {
  return { "User-Agent": UA, "Referer": VIDCORE + "/", "X-Requested-With": "XMLHttpRequest" };
}
function parseJson(text) { try { return JSON.parse(text); } catch (_) { return null; } }
function post(url, payload, h) {
  var hdr = Object.assign({ "Content-Type": "application/json" }, h || {});
  return fetch(url, { method: "POST", headers: hdr, body: payload == null ? undefined : JSON.stringify(payload) })
    .then(function (r) { return r.ok ? r.text() : ""; });
}
function encryptedToken(text) {
  var a = /\\\\\\"(?:en|token)\\\\\\":\\\\\\"(.*?)\\\\\\"/.exec(text || "");
  if (a) return a[1];
  var b = /[\\"](?:en|token)[\\"]\\s*:\\s*[\\"]([^\\"]+)[\\"]/.exec(text || "");
  return b ? b[1] : null;
}
function dec(text) {
  return post(DECRYPT + "/dec-vidcore", { text: text }).then(parseJson);
}
function resultOf(obj) { return obj && obj.result != null ? obj.result : null; }

function resolveServer(server, streamBase, requestHeaders) {
  if (!server || !server.data) return Promise.resolve([]);
  var endpoint = streamBase.replace(/\\/$/, "") + "/" + server.data;
  return post(endpoint, null, requestHeaders)
    .then(function (encrypted) { return encrypted ? dec(encrypted) : null; })
    .then(function (decoded) {
      var data = resultOf(decoded);
      if (!data || !data.url) return [];
      var url = data.url;
      return [{
        name: "WioCinema • Vidcore",
        title: "Vidcore • " + (server.name || "Server") + (server.description ? " • " + server.description : ""),
        url: url,
        quality: 1080,
        provider: "wiocinema-vidcore",
        format: url.indexOf(".m3u8") >= 0 ? "m3u8" : "video",
        headers: { "User-Agent": UA, "Referer": VIDCORE + "/", "X-Requested-With": "XMLHttpRequest" }
      }];
    }).catch(function () { return []; });
}

function getStreams(tmdbId, mediaType, season, episode) {
  if (tmdbId == null) return Promise.resolve([]);
  var isTv = mediaType === "tv" && season != null && episode != null;
  var page = isTv
    ? VIDCORE + "/tv/" + encodeURIComponent(String(tmdbId)) + "/" + encodeURIComponent(String(season)) + "/" + encodeURIComponent(String(episode))
    : VIDCORE + "/movie/" + encodeURIComponent(String(tmdbId));
  return fetch(page, { headers: headers() })
    .then(function (r) { return r.ok ? r.text() : ""; })
    .then(function (body) {
      var token = encryptedToken(body);
      if (!token) return [];
      return fetch(DECRYPT + "/enc-vidcore?text=" + encodeURIComponent(token))
        .then(function (r) { return r.ok ? r.text() : ""; })
        .then(parseJson)
        .then(function (enc) {
          var res = resultOf(enc);
          if (!res || !res.servers || !res.stream) return [];
          var reqHeaders = Object.assign(headers(), res.token ? { "X-Csrf-Token": res.token } : {});
          return post(res.servers, null, reqHeaders)
            .then(function (txt) { return txt ? dec(txt) : null; })
            .then(function (serversPayload) {
              var servers = resultOf(serversPayload);
              if (!Array.isArray(servers)) return [];
              return Promise.all(servers.map(function (s) {
                return resolveServer(s, res.stream, reqHeaders);
              })).then(function (nested) {
                var out = [], seen = {};
                nested.forEach(function (list) {
                  list.forEach(function (item) {
                    if (item.url && !seen[item.url]) {
                      seen[item.url] = true;
                      out.push(item);
                    }
                  });
                });
                return out;
              });
            });
        });
    }).catch(function (error) {
      console.error("[WioCinema Vidcore] " + (error && error.message ? error.message : String(error)));
      return [];
    });
}

module.exports = { getStreams: getStreams };
`;

const xpassCode = `/* SPDX-License-Identifier: GPL-3.0-only
 * WioCinema Xpass direct TMDB route.
 */
"use strict";

var XPASS = "https://play.xpass.top";
var UA = "${UA}";

function parse(text) { try { return JSON.parse(text); } catch (_) { return null; } }
function backups(html) {
  var m = /var\\s+backups\\s*=\\s*(\\[[\\s\\S]*?\\]);/.exec(html || ""); if (!m) return [];
  var arr = parse(m[1]); if (!Array.isArray(arr)) return [];
  return arr.filter(function (x) { return x && x.name && x.url; });
}
function full(url) { if (/^https?:\\/\\//i.test(url)) return url; return XPASS.replace(/\\/$/, "") + (url.charAt(0) === "/" ? url : "/" + url); }

function getStreams(tmdbId, mediaType, season, episode) {
  if (tmdbId == null) return Promise.resolve([]);
  var isTv = mediaType === "tv" && season != null && episode != null;
  var embed = isTv
    ? XPASS + "/e/tv/" + encodeURIComponent(String(tmdbId)) + "/" + encodeURIComponent(String(season)) + "/" + encodeURIComponent(String(episode))
    : XPASS + "/e/movie/" + encodeURIComponent(String(tmdbId));
  return fetch(embed, { headers: { "User-Agent": UA, "Referer": XPASS + "/" } })
    .then(function (r) { return r.ok ? r.text() : ""; })
    .then(function (html) {
      var list = backups(html);
      return Promise.all(list.map(function (server) {
        return fetch(full(server.url), { headers: { "User-Agent": UA, "Referer": embed } })
          .then(function (r) { return r.ok ? r.text() : ""; })
          .then(function (body) {
            var root = parse(body); var sources = root && root.playlist && root.playlist[0] && root.playlist[0].sources;
            if (!Array.isArray(sources)) return [];
            return sources.filter(function (s) { return s && /^https?:\\/\\//i.test(s.file || ""); }).map(function (s) {
              var url = s.file;
              return {
                name: "WioCinema • Xpass",
                title: "Xpass • " + server.name,
                url: url,
                quality: 1080,
                provider: "wiocinema-xpass",
                format: /hls/i.test(s.type || "") || url.indexOf(".m3u8") >= 0 ? "m3u8" : "video",
                headers: { "User-Agent": UA, "Referer": XPASS + "/" }
              };
            });
          }).catch(function () { return []; });
      })).then(function (groups) {
        var out = [], seen = {};
        groups.forEach(function (g) { g.forEach(function (x) { if (x.url && !seen[x.url]) { seen[x.url] = true; out.push(x); } }); });
        return out;
      });
    })
    .catch(function (e) { console.error("[WioCinema Xpass] " + (e && e.message ? e.message : String(e))); return []; });
}

module.exports = { getStreams: getStreams };
`;

const providers = [
  { file: 'wiocinema-clipbox.js', code: clipboxCode },
  { file: 'wiocinema-vidup.js', code: vidupCode },
  { file: 'wiocinema-hexa.js', code: hexaCode },
  { file: 'wiocinema-vidfastpro.js', code: vidfastproCode },
  { file: 'wiocinema-vidcore.js', code: vidcoreCode },
  { file: 'wiocinema-xpass.js', code: xpassCode }
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
      description: "WioCinema TMDB tabanlı ClipBox/VixSrc sağlayıcısı (Global/Multi).",
      version: "1.0.0",
      author: "Wiojelt",
      supportedTypes: ["movie", "tv"],
      filename: "providers/wiocinema-clipbox.js",
      enabled: true,
      hasSettings: false,
      logo: LOGO,
      contentLanguage: ["en"],
      formats: ["m3u8"],
      limited: false,
      disabledPlatforms: [],
      supportsExternalPlayer: true
    },
    {
      id: "wiocinema-vidup",
      name: "WioCinema • Vidup",
      description: "CineStream Vidup doğrudan TMDB sağlayıcısı.",
      version: "1.0.0",
      author: "Wiojelt",
      supportedTypes: ["movie", "tv"],
      filename: "providers/wiocinema-vidup.js",
      enabled: true,
      hasSettings: false,
      logo: LOGO,
      contentLanguage: ["en"],
      formats: ["m3u8", "mp4"],
      limited: false,
      disabledPlatforms: [],
      supportsExternalPlayer: true
    },
    {
      id: "wiocinema-hexa",
      name: "WioCinema • Hexa",
      description: "CineStream Hexa doğrudan TMDB sağlayıcısı.",
      version: "1.0.0",
      author: "Wiojelt",
      supportedTypes: ["movie", "tv"],
      filename: "providers/wiocinema-hexa.js",
      enabled: true,
      hasSettings: false,
      logo: LOGO,
      contentLanguage: ["en"],
      formats: ["m3u8", "mp4"],
      limited: false,
      disabledPlatforms: [],
      supportsExternalPlayer: true
    },
    {
      id: "wiocinema-vidfastpro",
      name: "WioCinema • VidFastPro",
      description: "CineStream VidFastPro doğrudan TMDB sağlayıcısı.",
      version: "1.0.0",
      author: "Wiojelt",
      supportedTypes: ["movie", "tv"],
      filename: "providers/wiocinema-vidfastpro.js",
      enabled: true,
      hasSettings: false,
      logo: LOGO,
      contentLanguage: ["en"],
      formats: ["m3u8", "mp4"],
      limited: false,
      disabledPlatforms: [],
      supportsExternalPlayer: true
    },
    {
      id: "wiocinema-vidcore",
      name: "WioCinema • Vidcore",
      description: "CineStream Vidcore doğrudan TMDB sağlayıcısı.",
      version: "1.0.0",
      author: "Wiojelt",
      supportedTypes: ["movie", "tv"],
      filename: "providers/wiocinema-vidcore.js",
      enabled: true,
      hasSettings: false,
      logo: LOGO,
      contentLanguage: ["en"],
      formats: ["m3u8", "mp4"],
      limited: false,
      disabledPlatforms: [],
      supportsExternalPlayer: true
    },
    {
      id: "wiocinema-xpass",
      name: "WioCinema • Xpass",
      description: "CineStream Xpass doğrudan TMDB sağlayıcısı.",
      version: "1.0.0",
      author: "Wiojelt",
      supportedTypes: ["movie", "tv"],
      filename: "providers/wiocinema-xpass.js",
      enabled: true,
      hasSettings: false,
      logo: LOGO,
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

console.log(`Generated WioCinema Nuvio plugin with ${manifest.scrapers.length} direct providers.`);
