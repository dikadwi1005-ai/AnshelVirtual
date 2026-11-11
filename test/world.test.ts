import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStore } from '../server/store.ts';
import { activities, divisions } from '../public/catalog.js';
import { activityAnchors, furniture, lobbyProps, obstaclesFor, partitions, propBounds, propsFor, station } from '../public/furnishings.js';
import { doorway, entrance, roomById, rooms, site } from '../public/layout.js';
import { agentRadius, navigation, segmentHits } from '../public/navigation.js';

const obstacles=rooms.flatMap(room=>obstaclesFor(room)).concat(lobbyProps.map(prop=>({box:propBounds(prop),id:prop.id})));
const nav=navigation(obstacles);
const lobby=[0,0];
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);

test('satu tapak kantor berisi 12 ruang divisi dan 8 ruang bersama dengan pintu yang terhubung',()=>{
  assert.equal(rooms.length,20);
  assert.deepEqual(rooms.filter(room=>room.person).map(room=>room.id).sort(),divisions.map(item=>item.id).sort());
  assert.equal(new Set(rooms.map(room=>room.id)).size,20);
  assert.ok(doorway>2*agentRadius);
  for (const room of rooms) {
    assert.ok(Math.abs(room.x)+room.width/2<site.width/2);
    assert.ok(Math.abs(room.z)+room.depth/2<site.depth/2);
    assert.equal(partitions(room).filter(wall=>wall.type!=='stall').length,5);
    assert.ok(nav.route(lobby,entrance(room)),room.id+' terputus dari lobi');
    assert.ok(propsFor(room).length>=5);
    if (room.person) assert.ok(nav.route(entrance(room),station(room).approach));
  }
});

test('rute dari arkade, pantri, ruang rapat, resepsionis, dan divisi lain bebas dari geometri penghalang',()=>{
  const origins=['arcade','coffee','meeting','talk','visit'];
  for (const person of [divisions[0],divisions[1],divisions[5],divisions[8],divisions[11]]) {
    const target=station(roomById[person.id]);
    for (const activity of origins) {
      for (const origin of activityAnchors(person,activity)) {
        const route=nav.route(origin.approach,target.approach);
        assert.ok(route,origin.id+' → '+person.id);
        assert.deepEqual(route.at(-1),target.approach);
        let previous=origin.approach;
        for (const waypoint of route) {
          for (const {box} of obstacles) assert.equal(segmentHits(previous,waypoint,box,agentRadius),false);
          previous=waypoint;
        }
      }
    }
  }
  assert.equal(nav.route(lobby,station(roomById.development).point),null);
});

test('semua titik aktivitas dapat dicapai dan gerak duduk hanya mengecualikan kursi tujuan',()=>{
  for (const person of divisions) {
    for (const name of Object.keys(activities)) {
      for (const anchor of activityAnchors(person,name)) {
        assert.ok(nav.route(lobby,anchor.approach),anchor.id);
        assert.ok(nav.clear(anchor.approach,anchor.point,anchor.support,.075),anchor.id);
        if (!anchor.support) continue;
        assert.ok(obstacles.find(item=>item.id===anchor.support),anchor.id);
        assert.ok(distance(anchor.point,anchor.approach)<1.15);
        assert.ok(anchor.height>=.38 && anchor.height<=.49);
      }
    }
  }
  assert.equal(furniture.desk[3],.77);
  assert.ok(furniture.chair[3]>furniture.desk[3]);
});

test('jejak furnitur utama tidak bertumpuk dan tetap di dalam ruang',()=>{
  for (const room of rooms) {
    const grounded=propsFor(room).filter(prop=>prop.y===0 && prop.type!=='rug');
    for (const [index,prop] of grounded.entries()) {
      const [left,near,right,far]=propBounds(prop);
      assert.ok(left>=room.x-room.width/2 && right<=room.x+room.width/2,room.id+' '+prop.type);
      assert.ok(near>=room.z-room.depth/2 && far<=room.z+room.depth/2,room.id+' '+prop.type);
      for (const other of grounded.slice(0,index)) {
        const [x0,z0,x1,z1]=propBounds(other);
        const overlapX=Math.min(right,x1)-Math.max(left,x0);
        const overlapZ=Math.min(far,z1)-Math.max(near,z0);
        assert.ok(overlapX<.035 || overlapZ<.035,room.id+' '+prop.type+' / '+other.type);
      }
    }
  }
});

test('SQLite menentukan antrean offline, eksekusi, dan pelepasan tugas untuk rencana karakter',()=>{
  const now=Date.parse('2026-11-11T03:00:00Z');
  const store=createStore(':memory:',()=>now);
  try {
    const task=store.create({division:'operations',kind:'diagnostic',description:'Cek transisi',urgent:true});
    const offline=store.state();
    assert.equal(offline.worker,false);
    assert.equal(offline.people.operations.task.id,task.id);
    assert.equal(offline.people.operations.activity,'desk');
    assert.equal(offline.people.operations.executing,false);
    const claimed=store.claim(['diagnostic']);
    const working=store.state();
    assert.equal(working.people.operations.task.id,task.id);
    assert.equal(working.people.operations.activity,'work');
    assert.equal(working.people.operations.executing,true);
    store.finish(claimed.id,claimed.token,{output:'Hasil uji'});
    assert.equal(store.state().people.operations.task,null);
    assert.ok(store.state().audit.some(event=>event.task===task.id && event.action==='completed'));
  } finally { store.close(); }
});
