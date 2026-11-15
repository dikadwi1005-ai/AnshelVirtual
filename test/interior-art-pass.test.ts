import test from 'node:test';
import assert from 'node:assert/strict';
import {rooms,homes,houseDoor} from '../public/layout.js';
import {officeInteriorAccents} from '../public/office-interior-accents.js';
import {homeInteriorArt,homeVisualStyle} from '../public/home-styles.js';

test('all 21 office rooms have deterministic, bounded floor and wall art accents',()=>{
  assert.equal(rooms.length,21);
  const roomIds=new Set();
  for(const room of rooms) {
    assert.ok(!roomIds.has(room.id));
    roomIds.add(room.id);
    const accents=officeInteriorAccents(room);
    assert.deepEqual(officeInteriorAccents(room),accents);
    assert.ok(accents.length>=2);
    assert.equal(accents.filter(d=>d.kind==='floor').length,2);
    for(const detail of accents) {
      for(const key of ['x','y','z','w','h','d'])
        assert.ok(Number.isFinite(detail[key]),room.id+' '+key);
      assert.ok(detail.w>0 && detail.h>0 && detail.d>0);
      assert.match(detail.color,/^#[0-9a-f]{6}$/i);
      assert.ok(Math.abs(detail.x-room.x)+detail.w/2<=room.width/2+.01,room.id+' horizontal fit');
      assert.ok(Math.abs(detail.z-room.z)+detail.d/2<=room.depth/2+.01,room.id+' depth fit');
      if(detail.kind==='wall') {
        assert.ok(detail.y-detail.h/2>1.90,room.id+' decor above character reach');
        assert.ok(detail.y+detail.h/2<2.53,room.id+' below ceiling housing');
      } else {
        assert.ok(detail.y-detail.h/2>0,room.id+' finish above floor');
        assert.ok(detail.y+detail.h/2<.05,room.id+' no standing obstruction');
      }
    }
    if(room.style==='open' && room.daylight!==true || room.style==='hub') {
      assert.equal(accents.filter(d=>d.kind==='wall').length,0,
        room.id+' no floating back-wall panel');
    } else {
      assert.equal(accents.filter(d=>d.kind==='wall').length,4,
        room.id+' rear wall-mounted accents');
    }
  }
});

test('staff-home framed art fits each interior and does not occupy doorway or floor',()=>{
  assert.equal(homes.length,12);
  const identities=new Set();
  for(const home of homes) {
    const style=homeVisualStyle(home.person.id);
    const art=homeInteriorArt(home);
    assert.deepEqual(homeInteriorArt(home),art);
    assert.equal(art.length,2+style.mark);
    identities.add(art[1].color+':'+style.mark);
    for(const detail of art) {
      assert.ok(Number.isFinite(detail.u)&&Number.isFinite(detail.y)&&Number.isFinite(detail.v));
      assert.ok(Math.abs(detail.u)+detail.w/2<home.width/2,'inside side walls');
      assert.ok(Math.abs(detail.v)+detail.d/2<home.depth/2,'inside rear wall');
      assert.ok(detail.y-detail.h/2>1.5,'above walking height');
      assert.ok(detail.y+detail.h/2<2.4,'below lowest house ceiling');
      assert.ok(detail.v<0,'not at doorway/front wall');
      assert.ok(Math.abs(detail.u-home.doorOffset)+detail.w/2<home.width+houseDoor.width);
    }
  }
  assert.equal(identities.size,12);
});
