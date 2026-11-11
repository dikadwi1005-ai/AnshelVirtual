import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { divisions } from '../public/catalog.js';
import { employeeProfile, employeeProfiles } from '../public/employee-profiles.js';

const readJson = async file => JSON.parse(await readFile(file,'utf8'));

test('aset lokal sesuai manifest dan seluruh rig memiliki klip perilaku dasar',async()=>{
  const {assets}=await readJson('ASSETS.json');
  assert.equal(assets.filter(asset=>asset.path.startsWith('public/models/people/') && asset.format==='GLB').length,12);
  for (const asset of assets) {
    assert.equal(asset.license,'CC0-1.0');
    const bytes=await readFile(asset.path);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256);
    if (asset.format !== 'GLB') continue;
    assert.equal(bytes.toString('ascii',0,4),'glTF');
    assert.equal(bytes.readUInt32LE(4),2);
    assert.equal(bytes.readUInt32LE(8),bytes.length);
    const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8'));
    for (const image of gltf.images??[]) if (image.uri) await readFile(join(dirname(asset.path),image.uri));
    if (asset.path.startsWith('public/models/people/')) {
      const names=gltf.animations.map(clip=>clip.name);
      for (const clip of ['walk','idle','sit','interact-right','emote-yes']) assert.ok(names.includes(clip));
    }
  }
});

test('setiap divisi mempunyai ID pegawai stabil dan varian aset yang disetujui',async()=>{
  const {assets}=await readJson('ASSETS.json');
  const catalog=new Set(assets.map(asset=>asset.path));
  assert.deepEqual(Object.keys(employeeProfiles).sort(),divisions.map(division=>division.id).sort());
  const profiles=divisions.map(division=>employeeProfile(division.id));
  assert.equal(new Set(profiles.map(profile=>profile.id)).size,12);
  assert.equal(new Set(profiles.map(profile=>[profile.asset,profile.dye].join(':'))).size,12);
  for (const profile of profiles) {
    assert.match(profile.id,/^avt-\d{3}$/);
    assert.equal(profile.rig,'kenney-mini');
    assert.ok(catalog.has('public/models/people/character-'+profile.asset+'.glb'));
    assert.ok(!['female-a','male-c','male-d'].includes(profile.asset));
  }
  assert.equal(employeeProfile('qa').presentation,'perempuan');
  assert.equal(employeeProfile('finance').presentation,'perempuan');
});

test('workflow memakai rute integrasi terbatas, koneksi node valid, dan zona WIB',async()=>{
  for (const file of ['office_telegram_intake.json','office_daily_report.json']) {
    const workflow=await readJson('workflows/'+file);
    assert.equal(workflow.active,false);
    assert.equal(workflow.settings.timezone,'Asia/Jakarta');
    const names=new Set(workflow.nodes.map(node=>node.name));
    for (const [source,edges] of Object.entries(workflow.connections)) {
      assert.ok(names.has(source));
      for (const destination of edges.main.flat()) assert.ok(names.has(destination.node));
    }
    const http=workflow.nodes.find(node=>node.type==='n8n-nodes-base.httpRequest');
    assert.equal(http.parameters.method,'POST');
    assert.equal(http.parameters.genericAuthType,'httpHeaderAuth');
    assert.match(http.parameters.url,/^https:\/\/[^/]+\/api\/integrations\/(telegram|report)$/);
  }
});
