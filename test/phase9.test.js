import assert from 'node:assert/strict';
import test from 'node:test';
import { activityAnchors, obstaclesFor, station } from '../public/furnishings.js';
import { commuteWaypoints, districtObstacles, districtRoute, foodStop, homes, roomById, rooms, staysHome,
  structureView, vestibule } from '../public/layout.js';
import { navigation } from '../public/navigation.js';
import { guestStops, vehicleRoute } from '../public/campus-traffic.js';
import { createLivingOffice } from '../public/living-office.js';
import { validPresence } from '../server/office-presence.ts';

const nav=navigation([...districtObstacles,...rooms.flatMap(room=>obstaclesFor(room))]);

test('all homes have distinct points and routes through both pedestrian doors in either direction',()=>{
  assert.equal(homes.length,12);
  assert.equal(new Set(homes.map(home=>String(home.sofa))).size,12);
  for (const home of homes) {
    const bedroom=activityAnchors(home.person,'home')[0].approach;
    const workstation=station(roomById[home.person.id]).approach;
    for (const [from,to] of [[bedroom,workstation],[workstation,bedroom]]) {
      const route=districtRoute(nav,from,to,home);
      assert.ok(route,home.id);
      for (const waypoint of commuteWaypoints(home).slice(-2)) assert.ok(route.some(point=>
        point[0]===waypoint[0] && point[1]===waypoint[1]),home.id);
      assert.deepEqual(route.at(-1),to);
    }
    assert.equal(nav.clear(home.point(-2,home.depth/2-.8),home.point(-2,home.depth/2+.8)),false);
  }
  assert.ok(nav.clear([-1.8,20.7],[-1.8,22.5]));
  assert.equal(nav.clear([6,20.7],[6,22.5]),false);
});

test('cutaway honors manual modes and opens automatically near homes and the office',()=>{
  assert.equal(structureView('exterior',{x:0,z:0},8,true),'exterior');
  assert.equal(structureView('interior',{x:57,z:52},.4,false),'interior');
  assert.equal(structureView('auto',{x:0,z:0},.4,false),'exterior');
  assert.equal(structureView('auto',homes[0],3,false),'interior');
  assert.equal(structureView('auto',{x:0,z:0},1,true),'interior');
});

test('arrival and departure are staggered and executing employees stay at work',()=>{
  assert.equal(homes.filter(home=>staysHome('arrival',0,home.person.index)).length,12);
  assert.ok(homes.filter(home=>staysHome('arrival',19,home.person.index)).length<12);
  assert.equal(homes.filter(home=>staysHome('closed',31,home.person.index)).length,12);
  const office=createLivingOffice({random:()=>.7});
  const state={phase:'closed',people:{management:{executing:true}}};
  office.step(.5,state,[]);
  const plans=office.step(32,state,[]);
  assert.equal(plans.management.activity,'work');
  assert.equal(plans.operations.activity,'home');
});

test('driveway and delivery use separately navigable points, and presence accepts outer homes',()=>{
  for(let n=1;n<vehicleRoute.length;n++) assert.ok(nav.clear(vehicleRoute[n-1],vehicleRoute[n],null,1.28));
  assert.ok(nav.route(guestStops.delivery,foodStop));
  const actors=homes.map(home=>({id:home.person.id,position:home.sofa,y:.44,angle:home.angle,stage:'seated',
    activity:'home',actual:'home',anchor:home.id,animation:'sit',seat:1,path:[]}));
  assert.ok(validPresence({client:'12345678-1234-4321-abcd-0123456789ab',snapshot:{actors}}));
});

test('needs remain bounded through an accelerated day with twelve employees',()=>{
  const office=createLivingOffice({random:()=>.42});
  const actors=homes.map(home=>({person:home.person,actual:'home',stage:'seated'}));
  for (const phase of ['closed','arrival','work','lunch','work','review','closed']) {
    const state={phase,people:{}};
    for (let i=0;i<900;i++) {
      const plans=office.step(.5,state,actors);
      for(const actor of actors) actor.actual=plans[actor.person.id].activity;
    }
  }
  for(const actor of actors) {
    const life=office.snapshot(actor.person.id);
    assert.ok(Object.values(life.needs).every(value=>value>=0 && value<=100));
  }
});
