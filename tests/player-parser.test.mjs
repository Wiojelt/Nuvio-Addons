import test from 'node:test';
import assert from 'node:assert/strict';
import { wordpressEmbed, wordpressStream, domainEndpoint, royalStream, nextStreams, unpackNumeric, embeddedHls } from '../src/addons/wiospor/player-parser.mjs';

test('wordpress parser uses requested id and public session', () => {
  const domain = Buffer.from('.cdn.example').toString('base64');
  const html = `window.streamradardomil=[atob("${domain}")];window.mainSource=5063;window.config={source:"https://"+window.streamradardomi.substring(1)+"/live/-/"+window.mainSource+"/playlist.m3u8",ads:"https://ads.example/ad.m3u8"};`;
  assert.equal(wordpressStream(html, 'https://www.mackeyfi559.sbs/player?id=5062', '[0,0,0,0,0,"?verify=sample"]'), 'https://cdn.example/live/-/5062/playlist.m3u8?verify=sample');
  assert.equal(wordpressStream(html, 'https://www.mackeyfi559.sbs/player?id=../a', '[]'), null);
  assert.equal(wordpressEmbed('<iframe src="https://ads.example/"></iframe><div data-player-url="/player?id=5062#ads=true"></div>', 'https://www.mackeyfi559.sbs/'), 'https://www.mackeyfi559.sbs/player?id=5062');
});

test('royal parser validates endpoint and id', () => {
  assert.equal(domainEndpoint("const CONFIG={domainUrl:'https://data.example/domain.php',adUrl:'https://ads.example'}"), 'https://data.example/domain.php');
  assert.equal(royalStream('{"baseurl":"https://cdn.example/"}', 'https://zbahistv65.com/channel.html?id=zirve'), 'https://cdn.example/zirve/mono.m3u8');
  assert.equal(royalStream('{"baseurl":"https://cdn.example/"}', 'https://zbahistv65.com/channel.html?id=..%2Fsecret'), null);
});

test('Next server data is decoded without executing scripts', () => {
  const payload = '7:["component",{"streamUrl":"/api/embed?u=opaque%2Bvalue","streamUrl2":"https://cdn.example/second.m3u8","ad":"https://ads.example/"}]';
  const html = `<script>self.__next_f.push(${JSON.stringify([1, payload])})</script><script>throw Error('do not execute')</script>`;
  assert.deepEqual(nextStreams(html, 'https://beyazelma78.com/kanal/example'), ['https://beyazelma78.com/api/embed?u=opaque%2Bvalue', 'https://cdn.example/second.m3u8']);
});

function embeddedScript() {
  const key = 'abcTVxyz';
  const token = 'token=sample&expires=1';
  const encrypted = Buffer.from([...token].map((c, i) => c.charCodeAt(0) ^ key.charCodeAt(i % key.length))).toString('base64');
  return `let EMBD_STREAMID="test-channel";let EMBD_PLAYERURL="live.php";let EMBD_STREAMTYPE="hls";let EMBD_DRMTYPE="";let EMBD_AUTHTOKEN=decode("decrypt","${encrypted}");function decode(){const c=function(){let s="abc";return s+=String.fromCharCode(84,86),s+"xyz"}();} `;
}

function pack(script) {
  const alphabet = 'fCXnuWOli';
  const body = Buffer.from(script).toString('latin1').split('').map(c => (c.charCodeAt(0) + 2).toString(3).split('').map(d => alphabet[Number(d)]).join('') + alphabet[3]).join('');
  return `eval(function(h,u,n,t,e,r){}("${body}",93,"${alphabet}",2,3,53))`;
}

test('numeric embedded player data decodes', () => {
  const script = embeddedScript();
  assert.equal(unpackNumeric(pack(script)), script);
  assert.equal(embeddedHls(`<base href="https://player.example/">${pack(script)}`, 'https://beyazelma78.com/api/embed?u=sample'), 'https://player.example/live.php?id=test-channel&token=sample&expires=1&format=.m3u8');
  assert.equal(embeddedHls(script.replace('EMBD_DRMTYPE=""', 'EMBD_DRMTYPE="widevine"'), 'https://player.example/'), null);
});
