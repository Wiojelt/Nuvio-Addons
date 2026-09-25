import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../src/addons/wiospor/app.mjs';

test('WioSpor addon exposes a Stremio-compatible manifest', async () => {
  const res = await handleRequest('/manifest.json');
  assert.equal(res.status, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.id, 'community.wiojelt.wiospor');
  assert.ok(body.resources.includes('catalog'));
  assert.ok(body.resources.includes('meta'));
  assert.ok(body.resources.includes('stream'));
  assert.equal(body.catalogs[0].id, 'wiospor-live');
});

test('WioSpor catalog is generated from upstream channels', async () => {
  const res = await handleRequest('/catalog/tv/wiospor-live.json');
  assert.equal(res.status, 200);
  const body = JSON.parse(res.body);
  assert.ok(Array.isArray(body.metas));
  assert.ok(body.metas.length >= 20);
  assert.ok(body.metas.every(item => item.id.startsWith('wiospor:')));
});

test('known WioSpor channel has meta endpoint', async () => {
  const catalog = JSON.parse((await handleRequest('/catalog/tv/wiospor-live.json')).body);
  const first = catalog.metas[0];
  assert.ok(first);
  const res = await handleRequest(`/meta/tv/${encodeURIComponent(first.id)}.json`);
  assert.equal(res.status, 200);
  assert.equal(JSON.parse(res.body).meta.id, first.id);
});


test('Birdirbir catalog is exposed inside the same WioSpor addon', async () => {
  const manifest = JSON.parse((await handleRequest('/manifest.json')).body);
  assert.ok(manifest.catalogs.some(item => item.id === 'birdirbir-live'));

  const res = await handleRequest('/catalog/tv/birdirbir-live.json');
  assert.equal(res.status, 200);
  const body = JSON.parse(res.body);
  assert.ok(Array.isArray(body.metas));
  assert.ok(body.metas.length >= 50);
  assert.ok(body.metas.every(item => item.id.startsWith('birdirbir:')));
});
