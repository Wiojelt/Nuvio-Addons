/* SPDX-License-Identifier: GPL-3.0-only
 * WioSinema FilmModu native HTML/JS scraper for Nuvio.
 * Direct scraper extracting HLS master playlist from FilmModu / Vidmixi.
 */
"use strict";

var HOST = "https://filmmodu.cc";
var TMDB_API = "https://api.themoviedb.org/3";
var TMDB_KEY = "4e44d9029b1270a757cddc766a1bcb63";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

function decodeBase64(str) {
  if (typeof atob === "function") {
    try { return atob(str); } catch (_) {}
  }
  if (typeof Buffer !== "undefined") {
    try { return Buffer.from(str, "base64").toString("utf8"); } catch (_) {}
  }
  return "";
}

function utf8Encode(str) {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(str);
  var bytes = [];
  for (var i = 0; i < str.length; i++) {
    var code = str.charCodeAt(i);
    if (code < 128) bytes.push(code);
    else if (code < 2048) { bytes.push(192 | (code >> 6)); bytes.push(128 | (code & 63)); }
    else { bytes.push(224 | (code >> 12)); bytes.push(128 | ((code >> 6) & 63)); bytes.push(128 | (code & 63)); }
  }
  return new Uint8Array(bytes);
}

function utf8Decode(bytes) {
  if (typeof TextDecoder !== "undefined") return new TextDecoder("utf-8").decode(bytes);
  var out = "", i = 0, c;
  while (i < bytes.length) {
    c = bytes[i++];
    if (c < 128) out += String.fromCharCode(c);
    else if (c > 191 && c < 224) out += String.fromCharCode(((c & 31) << 6) | (bytes[i++] & 63));
    else out += String.fromCharCode(((c & 15) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63));
  }
  return out;
}

function md5(bytes) {
  function safeAdd(x, y) { var lsw = (x & 0xffff) + (y & 0xffff); return (((x >> 16) + (y >> 16) + (lsw >> 16)) << 16) | (lsw & 0xffff); }
  function bitRol(num, cnt) { return (num << cnt) | (num >>> (32 - cnt)); }
  function md5cmn(q, a, b, x, s, t) { return safeAdd(bitRol(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b); }
  function md5ff(a, b, c, d, x, s, t) { return md5cmn((b & c) | (~b & d), a, b, x, s, t); }
  function md5gg(a, b, c, d, x, s, t) { return md5cmn((b & d) | (c & ~d), a, b, x, s, t); }
  function md5hh(a, b, c, d, x, s, t) { return md5cmn(b ^ c ^ d, a, b, x, s, t); }
  function md5ii(a, b, c, d, x, s, t) { return md5cmn(c ^ (b | ~d), a, b, x, s, t); }

  var l = bytes.length;
  var nWords = ((l + 8) >> 6) + 1;
  var words = new Int32Array(nWords * 16);
  for (var i = 0; i < l; i++) words[i >> 2] |= (bytes[i] & 0xff) << ((i % 4) * 8);
  words[l >> 2] |= 0x80 << ((l % 4) * 8);
  words[nWords * 16 - 2] = (l * 8) & 0xffffffff;
  words[nWords * 16 - 1] = Math.floor((l * 8) / 0x100000000);

  var a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
  for (var i = 0; i < words.length; i += 16) {
    var olda = a, oldb = b, oldc = c, oldd = d;
    a = md5ff(a, b, c, d, words[i], 7, -680876936); d = md5ff(d, a, b, c, words[i + 1], 12, -389564586); c = md5ff(c, d, a, b, words[i + 2], 17, 606105819); b = md5ff(b, c, d, a, words[i + 3], 22, -1044525330);
    a = md5ff(a, b, c, d, words[i + 4], 7, -176418897); d = md5ff(d, a, b, c, words[i + 5], 12, 1200080426); c = md5ff(c, d, a, b, words[i + 6], 17, -1473231341); b = md5ff(b, c, d, a, words[i + 7], 22, -45705983);
    a = md5ff(a, b, c, d, words[i + 8], 7, 1770035416); d = md5ff(d, a, b, c, words[i + 9], 12, -1958414417); c = md5ff(c, d, a, b, words[i + 10], 17, -42063); b = md5ff(b, c, d, a, words[i + 11], 22, -1990404162);
    a = md5ff(a, b, c, d, words[i + 12], 7, 1804603682); d = md5ff(d, a, b, c, words[i + 13], 12, -40341101); c = md5ff(c, d, a, b, words[i + 14], 17, -1502002290); b = md5ff(b, c, d, a, words[i + 15], 22, 1236535329);

    a = md5gg(a, b, c, d, words[i + 1], 5, -165796510); d = md5gg(d, a, b, c, words[i + 6], 9, -1069501632); c = md5gg(c, d, a, b, words[i + 11], 14, 643717713); b = md5gg(b, c, d, a, words[i], 20, -373897302);
    a = md5gg(a, b, c, d, words[i + 5], 5, -701558691); d = md5gg(d, a, b, c, words[i + 10], 9, 38016083); c = md5gg(c, d, a, b, words[i + 15], 14, -660478335); b = md5gg(b, c, d, a, words[i + 4], 20, -405537848);
    a = md5gg(a, b, c, d, words[i + 9], 5, 568446438); d = md5gg(d, a, b, c, words[i + 14], 9, -1019803690); c = md5gg(c, d, a, b, words[i + 3], 14, -187363961); b = md5gg(b, c, d, a, words[i + 8], 20, 1163531501);
    a = md5gg(a, b, c, d, words[i + 13], 5, -1444681467); d = md5gg(d, a, b, c, words[i + 2], 9, -51403784); c = md5gg(c, d, a, b, words[i + 7], 14, 1735328473); b = md5gg(b, c, d, a, words[i + 12], 20, -1926607734);

    a = md5hh(a, b, c, d, words[i + 5], 4, -378558); d = md5hh(d, a, b, c, words[i + 8], 11, -2022574463); c = md5hh(c, d, a, b, words[i + 11], 16, 1839030562); b = md5hh(b, c, d, a, words[i + 14], 23, -35309556);
    a = md5hh(a, b, c, d, words[i + 1], 4, -1530992060); d = md5hh(d, a, b, c, words[i + 4], 11, 1272893353); c = md5hh(c, d, a, b, words[i + 7], 16, -155497632); b = md5hh(b, c, d, a, words[i + 10], 23, -1094730640);
    a = md5hh(a, b, c, d, words[i + 13], 4, 681279174); d = md5hh(d, a, b, c, words[i], 11, -358537222); c = md5hh(c, d, a, b, words[i + 3], 16, -722521979); b = md5hh(b, c, d, a, words[i + 6], 23, 76029189);
    a = md5hh(a, b, c, d, words[i + 9], 4, -640364487); d = md5hh(d, a, b, c, words[i + 12], 11, -421815835); c = md5hh(c, d, a, b, words[i + 15], 16, 530742520); b = md5hh(b, c, d, a, words[i + 2], 23, -995338651);

    a = md5ii(a, b, c, d, words[i], 6, -198630844); d = md5ii(d, a, b, c, words[i + 7], 10, 1126891415); c = md5ii(c, d, a, b, words[i + 14], 15, -1416354905); b = md5ii(b, c, d, a, words[i + 5], 21, -57434055);
    a = md5ii(a, b, c, d, words[i + 12], 6, 1700485571); d = md5ii(d, a, b, c, words[i + 3], 10, -1894986606); c = md5ii(c, d, a, b, words[i + 10], 15, -1051523); b = md5ii(b, c, d, a, words[i + 1], 21, -2054922799);
    a = md5ii(a, b, c, d, words[i + 8], 6, 1873313359); d = md5ii(d, a, b, c, words[i + 15], 10, -30611744); c = md5ii(c, d, a, b, words[i + 6], 15, -1560198380); b = md5ii(b, c, d, a, words[i + 13], 21, 1309151649);
    a = md5ii(a, b, c, d, words[i + 4], 6, -145523070); d = md5ii(d, a, b, c, words[i + 11], 10, -1120210379); c = md5ii(c, d, a, b, words[i + 2], 15, 718787259); b = md5ii(b, c, d, a, words[i + 9], 21, -343485551);

    a = safeAdd(a, olda); b = safeAdd(b, oldb); c = safeAdd(c, oldc); d = safeAdd(d, oldd);
  }
  var out = new Uint8Array(16);
  var dv = new DataView(out.buffer);
  dv.setInt32(0, a, true);
  dv.setInt32(4, b, true);
  dv.setInt32(8, c, true);
  dv.setInt32(12, d, true);
  return out;
}

var SBOX_INV = new Uint8Array([
  0x52,0x09,0x6a,0xd5,0x30,0x36,0xa5,0x38,0xbf,0x40,0xa3,0x9e,0x81,0xf3,0xd7,0xfb,
  0x7c,0xe3,0x39,0x82,0x9b,0x2f,0xff,0x87,0x34,0x8e,0x43,0x44,0xc4,0xde,0xe9,0xcb,
  0x54,0x7b,0x94,0x32,0xa6,0xc2,0x23,0x3d,0xee,0x4c,0x95,0x0b,0x42,0xfa,0xc3,0x4e,
  0x08,0x2e,0xa1,0x66,0x28,0xd9,0x24,0xb2,0x76,0x5b,0xa2,0x49,0x6d,0x8b,0xd1,0x25,
  0x72,0xf8,0xf6,0x64,0x86,0x68,0x98,0x16,0xd4,0xa4,0x5c,0xcc,0x5d,0x65,0xb6,0x92,
  0x6c,0x70,0x48,0x50,0xfd,0xed,0xb9,0xda,0x5e,0x15,0x46,0x57,0xa7,0x8d,0x9d,0x84,
  0x90,0xd8,0xab,0x00,0x8c,0xbc,0xd3,0x0a,0xf7,0xe4,0x58,0x05,0xb8,0xb3,0x45,0x06,
  0xd0,0x2c,0x1e,0x8f,0xca,0x3f,0x0f,0x02,0xc1,0xaf,0xbd,0x03,0x01,0x13,0x8a,0x6b,
  0x3a,0x91,0x11,0x41,0x4f,0x67,0xdc,0xea,0x97,0xf2,0xcf,0xce,0xf0,0xb4,0xe6,0x73,
  0x96,0xac,0x74,0x22,0xe7,0xad,0x35,0x85,0xe2,0xf9,0x37,0xe8,0x1c,0x75,0xdf,0x6e,
  0x47,0xf1,0x1a,0x71,0x1d,0x29,0xc5,0x89,0x6f,0xb7,0x62,0x0e,0xaa,0x18,0xbe,0x1b,
  0xfc,0x56,0x3e,0x4b,0xc6,0xd2,0x79,0x20,0x9a,0xdb,0xc0,0xfe,0x78,0xcd,0x5a,0xf4,
  0x1f,0xdd,0xa8,0x33,0x88,0x07,0xc7,0x31,0xb1,0x12,0x10,0x59,0x27,0x80,0xec,0x5f,
  0x60,0x51,0x7f,0xa9,0x19,0xb5,0x4a,0x0d,0x2d,0xe5,0x7a,0x9f,0x93,0xc9,0x9c,0xef,
  0xa0,0xe0,0x3b,0x4d,0xae,0x2a,0xf5,0xb0,0xc8,0xeb,0xbb,0x3c,0x83,0x53,0x99,0x61,
  0x17,0x2b,0x04,0x7e,0xba,0x77,0xd6,0x26,0xe1,0x69,0x14,0x63,0x55,0x21,0x0c,0x7d
]);

var SBOX = new Uint8Array([
  0x63,0x7c,0x77,0x7b,0xf2,0x6b,0x6f,0xc5,0x30,0x01,0x67,0x2b,0xfe,0xd7,0xab,0x76,
  0xca,0x82,0xc9,0x7d,0xfa,0x59,0x47,0xf0,0xad,0xd4,0xa2,0xaf,0x9c,0xa4,0x72,0xc0,
  0xb7,0xfd,0x93,0x26,0x36,0x3f,0xf7,0xcc,0x34,0xa5,0xe5,0xf1,0x71,0xd8,0x31,0x15,
  0x04,0xc7,0x23,0xc3,0x18,0x96,0x05,0x9a,0x07,0x12,0x80,0xe2,0xeb,0x27,0xb2,0x75,
  0x09,0x83,0x2c,0x1a,0x1b,0x6e,0x5a,0xa0,0x52,0x3b,0xd6,0xb3,0x29,0xe3,0x2f,0x84,
  0x53,0xd1,0x00,0xed,0x20,0xfc,0xb1,0x5b,0x6a,0xcb,0xbe,0x39,0x4a,0x4c,0x58,0xcf,
  0xd0,0xef,0xaa,0xfb,0x43,0x4d,0x33,0x85,0x45,0xf9,0x02,0x7f,0x50,0x3c,0x9f,0xa8,
  0x51,0xa3,0x40,0x8f,0x92,0x9d,0x38,0xf5,0xbc,0xb6,0xda,0x21,0x10,0xff,0xf3,0xd2,
  0xcd,0x0c,0x13,0xec,0x5f,0x97,0x44,0x17,0xc4,0xa7,0x7e,0x3d,0x64,0x5d,0x19,0x73,
  0x60,0x81,0x4f,0xdc,0x22,0x2a,0x90,0x88,0x46,0xee,0xb8,0x14,0xde,0x5e,0x0b,0xdb,
  0xe0,0x32,0x3a,0x0a,0x49,0x06,0x24,0x5c,0xc2,0xd3,0xac,0x62,0x91,0x95,0xe4,0x79,
  0xe7,0xc8,0x37,0x6d,0x8d,0xd5,0x4e,0xa9,0x6c,0x56,0xf4,0xea,0x65,0x7a,0xae,0x08,
  0xba,0x78,0x25,0x2e,0x1c,0xa6,0xb4,0xc6,0xe8,0xdd,0x74,0x1f,0x4b,0xbd,0x8b,0x8a,
  0x70,0x3e,0xb5,0x66,0x48,0x03,0xf6,0x0e,0x61,0x35,0x57,0xb9,0x86,0xc1,0x1d,0x9e,
  0xe1,0xf8,0x98,0x11,0x69,0xd9,0x8e,0x94,0x9b,0x1e,0x87,0xe9,0xce,0x55,0x28,0xdf,
  0x8c,0xa1,0x89,0x0d,0xbf,0xe6,0x42,0x68,0x41,0x99,0x2d,0x0f,0xb0,0x54,0xbb,0x16
]);

var RCON = [0x00,0x01,0x02,0x04,0x08,0x10,0x20,0x40,0x80,0x1b,0x36];

function gmul(a, b) {
  var p = 0;
  for (var counter = 0; counter < 8; counter++) {
    if ((b & 1) !== 0) p ^= a;
    var hi = (a & 0x80);
    a = (a << 1) & 0xff;
    if (hi !== 0) a ^= 0x1b;
    b >>= 1;
  }
  return p;
}

function keyExpansion(key) {
  var keyWords = new Uint32Array(60);
  for (var i = 0; i < 8; i++) {
    keyWords[i] = (key[4 * i] << 24) | (key[4 * i + 1] << 16) | (key[4 * i + 2] << 8) | key[4 * i + 3];
  }
  for (var i = 8; i < 60; i++) {
    var temp = keyWords[i - 1];
    if (i % 8 === 0) {
      temp = ((temp << 8) | (temp >>> 24));
      temp = (SBOX[(temp >>> 24) & 0xff] << 24) | (SBOX[(temp >>> 16) & 0xff] << 16) | (SBOX[(temp >>> 8) & 0xff] << 8) | SBOX[temp & 0xff];
      temp ^= (RCON[i / 8] << 24);
    } else if (i % 8 === 4) {
      temp = (SBOX[(temp >>> 24) & 0xff] << 24) | (SBOX[(temp >>> 16) & 0xff] << 16) | (SBOX[(temp >>> 8) & 0xff] << 8) | SBOX[temp & 0xff];
    }
    keyWords[i] = keyWords[i - 8] ^ temp;
  }
  return keyWords;
}

function decryptBlock(block, roundKeys) {
  var state = new Uint8Array(16);
  for (var i = 0; i < 16; i++) state[i] = block[i] ^ ((roundKeys[56 + (i >> 2)] >>> (24 - 8 * (i % 4))) & 0xff);

  for (var round = 13; round > 0; round--) {
    var t1 = state[1];
    state[1] = state[13]; state[13] = state[9]; state[9] = state[5]; state[5] = t1;
    var t = state[2]; state[2] = state[10]; state[10] = t; t = state[6]; state[6] = state[14]; state[14] = t;
    t = state[15]; state[15] = state[3]; state[3] = state[7]; state[7] = state[11]; state[11] = t;

    for (var i = 0; i < 16; i++) state[i] = SBOX_INV[state[i]];

    for (var i = 0; i < 16; i++) state[i] ^= ((roundKeys[4 * round + (i >> 2)] >>> (24 - 8 * (i % 4))) & 0xff);

    for (var c = 0; c < 4; c++) {
      var s0 = state[4 * c], s1 = state[4 * c + 1], s2 = state[4 * c + 2], s3 = state[4 * c + 3];
      state[4 * c] = gmul(s0, 0x0e) ^ gmul(s1, 0x0b) ^ gmul(s2, 0x0d) ^ gmul(s3, 0x09);
      state[4 * c + 1] = gmul(s0, 0x09) ^ gmul(s1, 0x0e) ^ gmul(s2, 0x0b) ^ gmul(s3, 0x0d);
      state[4 * c + 2] = gmul(s0, 0x0d) ^ gmul(s1, 0x09) ^ gmul(s2, 0x0e) ^ gmul(s3, 0x0b);
      state[4 * c + 3] = gmul(s0, 0x0b) ^ gmul(s1, 0x0d) ^ gmul(s2, 0x09) ^ gmul(s3, 0x0e);
    }
  }

  var t1 = state[1];
  state[1] = state[13]; state[13] = state[9]; state[9] = state[5]; state[5] = t1;
  var t = state[2]; state[2] = state[10]; state[10] = t; t = state[6]; state[6] = state[14]; state[14] = t;
  t = state[15]; state[15] = state[3]; state[3] = state[7]; state[7] = state[11]; state[11] = t;
  for (var i = 0; i < 16; i++) state[i] = SBOX_INV[state[i]];
  for (var i = 0; i < 16; i++) state[i] ^= ((roundKeys[i >> 2] >>> (24 - 8 * (i % 4))) & 0xff);

  return state;
}

function aesCbcDecrypt(ciphertext, key, iv) {
  var roundKeys = keyExpansion(key);
  var plaintext = new Uint8Array(ciphertext.length);
  var prev = iv;
  for (var offset = 0; offset < ciphertext.length; offset += 16) {
    var block = ciphertext.subarray(offset, offset + 16);
    var dec = decryptBlock(block, roundKeys);
    for (var i = 0; i < 16; i++) plaintext[offset + i] = dec[i] ^ prev[i];
    prev = block;
  }
  var pad = plaintext[plaintext.length - 1];
  if (pad > 0 && pad <= 16) return plaintext.subarray(0, plaintext.length - pad);
  return plaintext;
}

function evpKdfPure(passwordBytes, saltBytes, keyLen, ivLen) {
  var d = new Uint8Array(0);
  var dI = new Uint8Array(0);
  while (d.length < keyLen + ivLen) {
    var toHash = new Uint8Array(dI.length + passwordBytes.length + saltBytes.length);
    toHash.set(dI, 0);
    toHash.set(passwordBytes, dI.length);
    toHash.set(saltBytes, dI.length + passwordBytes.length);
    dI = md5(toHash);
    var nextD = new Uint8Array(d.length + dI.length);
    nextD.set(d, 0);
    nextD.set(dI, d.length);
    d = nextD;
  }
  return { key: d.subarray(0, keyLen), iv: d.subarray(keyLen, keyLen + ivLen) };
}

function hexToBytes(hex) {
  var b = new Uint8Array(hex.length / 2);
  for (var i = 0; i < b.length; i++) b[i] = parseInt(hex.substr(i * 2, 2), 16);
  return b;
}

var B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
var B64_LOOKUP = new Uint8Array(256);
for (var _bi = 0; _bi < B64_CHARS.length; _bi++) B64_LOOKUP[B64_CHARS.charCodeAt(_bi)] = _bi;

function base64ToBytes(b64) {
  var clean = b64.replace(/[^A-Za-z0-9+/=]/g, "");
  var len = clean.length;
  var placeHolders = clean.charAt(len - 1) === "=" ? (clean.charAt(len - 2) === "=" ? 2 : 1) : 0;
  var arr = new Uint8Array(Math.max(0, Math.floor((len * 3) / 4) - placeHolders));
  var cur = 0;
  for (var i = 0; i < len; i += 4) {
    var b1 = B64_LOOKUP[clean.charCodeAt(i)];
    var b2 = B64_LOOKUP[clean.charCodeAt(i + 1)];
    var b3 = B64_LOOKUP[clean.charCodeAt(i + 2)];
    var b4 = B64_LOOKUP[clean.charCodeAt(i + 3)];
    arr[cur++] = (b1 << 2) | (b2 >> 4);
    if (cur < arr.length) arr[cur++] = ((b2 & 15) << 4) | (b3 >> 2);
    if (cur < arr.length) arr[cur++] = ((b3 & 3) << 6) | (b4 & 63);
  }
  return arr;
}

function decryptAes(setStr, hashStr) {
  try {
    var obj = typeof setStr === "string" ? JSON.parse(setStr) : setStr;
    var ciphertext = base64ToBytes(obj.ct);
    var salt = obj.s ? hexToBytes(obj.s) : new Uint8Array(0);
    var password = utf8Encode(hashStr);

    var key, iv;
    if (salt.length > 0) {
      var derived = evpKdfPure(password, salt, 32, 16);
      key = derived.key;
      iv = obj.iv ? hexToBytes(obj.iv) : derived.iv;
    } else {
      key = md5(password);
      iv = obj.iv ? hexToBytes(obj.iv) : new Uint8Array(16);
    }

    var decryptedBytes = aesCbcDecrypt(ciphertext, key, iv);
    var str = utf8Decode(decryptedBytes);
    return JSON.parse(str);
  } catch (_) {
    return null;
  }
}

function getMovieInfo(tmdbId) {
  var url = TMDB_API + "/movie/" + encodeURIComponent(String(tmdbId)) + "?api_key=" + TMDB_KEY + "&language=tr-TR";
  return fetch(url, { headers: { "User-Agent": UA, "Accept": "application/json" } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .catch(function () { return null; });
}

function searchFilmModu(query) {
  var body = "action=ajax_search&arama_kelime=" + encodeURIComponent(query);
  return fetch(HOST + "/arama/", {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "Referer": HOST + "/",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
    },
    body: body
  })
    .then(function (r) { return r.ok ? r.text() : ""; })
    .catch(function () { return ""; });
}

function getStreams(tmdbId, mediaType, season, episode) {
  if (tmdbId == null || mediaType === "tv") return Promise.resolve([]);

  return getMovieInfo(tmdbId)
    .then(function (info) {
      var imdbId = info && info.imdb_id ? info.imdb_id : null;
      var title = info && (info.title || info.original_title) ? (info.title || info.original_title) : null;
      var query = imdbId || title || String(tmdbId);

      return searchFilmModu(query).then(function (html) {
        if (!html && title && query !== title) {
          return searchFilmModu(title).then(function (h2) { return { html: h2, info: info }; });
        }
        return { html: html, info: info };
      });
    })
    .then(function (ctx) {
      if (!ctx || !ctx.html) return [];
      var linkMatch = /href=["'](https?:\/\/filmmodu\.cc\/film\/[^"']+)["']/i.exec(ctx.html);
      if (!linkMatch) return [];
      var movieUrl = linkMatch[1];

      return fetch(movieUrl, { headers: { "User-Agent": UA, "Referer": HOST + "/" } })
        .then(function (r) { return r.ok ? r.text() : ""; })
        .then(function (pageHtml) {
          var partMatch = /(?:var|let|const)\s+ilkpartkod\s*=\s*['"]([^'"]+)['"]/i.exec(pageHtml);
          if (!partMatch) return [];
          var decodedIframe = decodeBase64(partMatch[1]);
          var embedMatch = /src=["']([^"']+)["']/i.exec(decodedIframe);
          if (!embedMatch) return [];
          var embedUrl = embedMatch[1].replace(/[\r\n]+/g, "").trim();

          return fetch(embedUrl, { headers: { "User-Agent": UA, "Referer": movieUrl } })
            .then(function (r) { return r.ok ? r.text() : ""; })
            .then(function (embedHtml) {
              var playerMatch = /bePlayer\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"](\{[\s\S]*?\})['"]/i.exec(embedHtml);
              if (!playerMatch) return [];
              var hash = playerMatch[1];
              var setRaw = playerMatch[2].replace(/\\"/g, '"').replace(/\\\//g, "/");
              var playerParams = decryptAes(setRaw, hash);
              if (!playerParams || !playerParams.video_location) return [];

              var movieTitle = (ctx.info && ctx.info.title) || playerParams.title || "Film";
              return [{
                name: "WioSinema • FilmModu",
                title: "FilmModu • " + movieTitle + " • HLS 1080p",
                url: playerParams.video_location,
                quality: 1080,
                provider: "wiosinema-filmmodu",
                format: "m3u8",
                headers: { "User-Agent": UA, "Referer": embedUrl }
              }];
            });
        });
    })
    .catch(function (error) {
      console.error("[WioSinema FilmModu] " + (error && error.message ? error.message : String(error)));
      return [];
    });
}

module.exports = { getStreams: getStreams };
