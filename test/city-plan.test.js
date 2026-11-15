import assert from 'node:assert/strict';
import test from 'node:test';
import { avenueOffset, chunkSize, cityBlock, cityChunks, cityDistricts, cityEdge, cityRoadRoute, zoneAt } from '../public/city-plan.js';

test('city parcels are stable, face road access, and fit in their own block',()=>{
  assert.ok(cityEdge*2>=2000);
  const ids=new Set();
  for (const block of cityChunks(0,0,8)) {
    assert.deepEqual(block,cityBlock(block.ix,block.iz));
    for (const [index,plot] of block.plots.entries()) {
      assert.ok(!ids.has(plot.id));
      ids.add(plot.id);
      assert.ok(Math.abs(plot.x-block.x)+plot.width/2<chunkSize/2);
      assert.ok(Math.abs(plot.z-block.z)+plot.depth/2<chunkSize/2);
      assert.ok(Math.abs(plot.roadZ-plot.z)-plot.depth/2>4.5);
      assert.equal(Math.sign(Math.cos(plot.angle)),Math.sign(plot.roadZ-plot.z));
      for (const other of block.plots.slice(0,index)) {
        assert.ok(Math.abs(plot.x-other.x)>=(plot.width+other.width)/2 ||
          Math.abs(plot.z-other.z)>=(plot.depth+other.depth)/2,plot.id+' overlaps '+other.id);
      }
    }
  }
  for (const [district,point] of Object.entries(cityDistricts)) {
    assert.equal(zoneAt(Math.round(point.x/chunkSize),Math.round(point.z/chunkSize)),district);
  }
});

test('visible chunks are bounded and road routes connect neighboring intersections',()=>{
  assert.equal(cityChunks(0,0,2).length,25);
  assert.equal(cityChunks(cityEdge-1,cityEdge-1,2).length,9);
  const route=cityRoadRoute([-2,-1],[4,3]);
  assert.deepEqual(route[0],[-2*chunkSize,-chunkSize+avenueOffset]);
  assert.deepEqual(route.at(-1),[4*chunkSize,3*chunkSize+avenueOffset]);
  assert.equal(route.length,11);
  for (const [index,point] of route.slice(1).entries()) {
    assert.equal(Math.abs(route[index][0]-point[0])+Math.abs(route[index][1]-point[1]),chunkSize);
  }
});
