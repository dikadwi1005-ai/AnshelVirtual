import test from 'node:test';
import assert from 'node:assert/strict';
import { AnimationClip, Bone, Box3, BoxGeometry, Group, MeshStandardMaterial, Scene, Skeleton, SkinnedMesh, Vector3 } from 'three';
import { campusTraffic, createFoodOrder, roadRoutes, vehicleRoute } from '../public/campus-traffic.js';
import { districtObstacles, foodMenu, foodStop } from '../public/layout.js';
import { navigation } from '../public/navigation.js';

test('road lanes and campus parking routes have clearance for vehicles',()=>{
  const nav=navigation(districtObstacles);
  for (const route of [...roadRoutes,vehicleRoute]) {
    for (const [index,point] of route.slice(1).entries()) {
      assert.equal(nav.clear(route[index],point,null,2.3*.56),true,JSON.stringify([route[index],point]));
    }
  }
});

test('food orders require an available employee, lunch, a valid menu and no active order',()=>{
  const employee={person:{id:'qa',employee:'Kirana'},actual:'desk'};
  const lunch={phase:'lunch',now:100,people:{}};
  const order=createFoodOrder(employee,foodMenu[0],lunch,false);
  assert.match(order.orderId,/^[a-f0-9-]{36}$/);
  assert.equal(order.id,'qa');
  assert.equal(order.created,100);
  assert.equal(createFoodOrder(employee,foodMenu[0],lunch,true),null);
  assert.equal(createFoodOrder(employee,foodMenu[0],{...lunch,phase:'work'},false),null);
  assert.equal(createFoodOrder(employee,'invalid',lunch,false),null);
  assert.equal(createFoodOrder(employee,foodMenu[0],{...lunch,people:{qa:{executing:true}}},false),null);
});

function rigFixture() {
  const scene=new Group();
  const mesh=new SkinnedMesh(new BoxGeometry(),new MeshStandardMaterial());
  const head=mesh.clone();
  head.name='head-mesh'; mesh.name='body-mesh';
  const bones=['head','leg-left','leg-right','arm-left','arm-right'].map(name=>{
    const bone=new Bone(); bone.name=name; mesh.add(bone); return bone;
  });
  const skeleton=new Skeleton(bones);
  mesh.bind(skeleton); head.bind(skeleton);
  scene.add(mesh,head);
  return {scene,size:new Vector3(1,1,1),bounds:new Box3(new Vector3(-.5,-.5,-.5),new Vector3(.5,.5,.5)),
    animations:['idle','walk','sit','drive'].map(name=>new AnimationClip(name,1,[]))};
}

test('a full simulated day with an available courier and idle employee generates no food delivery',async()=>{
  const scene=new Scene(), rig=rigFixture();
  const traffic=await campusTraffic(scene,{clear:()=>true,route:(_,to)=>[to]},()=>assert.fail('unexpected handoff'),
    name=>name.startsWith('people/')?Promise.resolve(rig):Promise.reject(new Error('fixture fallback')));
  const employee={person:{id:'qa',employee:'Kirana',index:0},actual:'desk'};
  try {
    for(let minute=0;minute<1440;minute++) {
      const phase=minute<525?'closed':minute<540?'arrival':minute<720?'work':minute<780?'lunch':minute<1020?'work':'closed';
      traffic.update(60,{phase,now:minute*60000,people:{}},[],[employee]);
      assert.equal(traffic.courierActive(),false);
    }
    assert.equal(traffic.status(),'');
    assert.equal(traffic.request('qa',foodMenu[0],{phase:'lunch'},[employee]),null);
    traffic.update(.05,{phase:'lunch'},[],[employee]);
    assert.equal(traffic.courierActive(),true);
    for(let tick=0;tick<175;tick++) traffic.update(1,{phase:'lunch'},[],[employee]);
    assert.match(traffic.status(),/Pengambilan terlewat|Rute terhambat/);
    assert.equal(traffic.courierActive(),false);
  } finally { traffic.dispose(); }
});

test('handoff waits for the named employee, then occurs once before the courier returns',async()=>{
  const rig=rigFixture(), received=[];
  const traffic=await campusTraffic(new Scene(),{clear:()=>true,route:(_,to)=>[to]},id=>received.push(id),
    name=>name.startsWith('people/')?Promise.resolve(rig):Promise.reject(new Error('fixture fallback')));
  const root=new Group();
  root.position.set(foodStop[0],0,foodStop[1]);
  const employee={person:{id:'qa',employee:'Kirana'},actual:'desk',root,stage:'arrived'};
  const lunch={phase:'lunch',now:2000,people:{}};
  const advance=seconds=>{
    for(let tick=0;tick<seconds*20;tick++) traffic.update(.05,lunch,[],[employee]);
  };
  try {
    assert.equal(traffic.request('qa',foodMenu[0],lunch,[employee]),null);
    assert.ok(traffic.request('qa',foodMenu[0],lunch,[employee]));
    advance(36);
    assert.equal(traffic.pickup(),'qa');
    assert.deepEqual(received,[]);
    employee.actual='pickup';
    advance(2);
    assert.deepEqual(received,['qa']);
    advance(45);
    assert.equal(traffic.courierActive(),false);
    assert.deepEqual(received,['qa']);
  } finally { traffic.dispose(); }
});
