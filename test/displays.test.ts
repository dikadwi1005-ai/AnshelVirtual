import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { screenGeometry } from '../public/displays.js';
import { displayState, workstationTask } from '../public/display-state.js';

test('UV monitor, laptop, dan TV memakai empat vertex permukaan asli',async()=>{
  const loader=new GLTFLoader();
  for (const name of ['computerscreen','laptop','televisionmodern']) {
    const bytes=await readFile('public/models/furniture/'+name+'.glb');
    const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
    const screens=[];
    gltf.scene.traverse(object=>{if(object.isMesh && object.material.name==='metal') screens.push(object);});
    assert.equal(screens.length,1,name);
    const original=screens[0].geometry;
    const screen=screenGeometry(original);
    assert.equal(screenGeometry(original),screen);
    assert.deepEqual(screen.attributes.position.array,original.attributes.position.array);
    assert.deepEqual(screen.index.array,original.index.array);
    const used=new Set([...screen.index.array]);
    assert.deepEqual([...used].map(i=>[
      screen.attributes.uv.getX(i),screen.attributes.uv.getY(i),
    ].join(',')).sort(),['0,0','0,1','1,0','1,1']);
    assert.equal(screen.index.count,6);
  }
});

test('layar membedakan idle, antrean, worker tidak tersedia, terhambat, dan eksekusi aktual',()=>{
  const task={id:'a',division:'development',status:'queued',kind:'diagnostic',description:'jangan tampilkan ini'};
  const office={worker:false,capabilities:[],people:{development:{executing:false,task}},tasks:[task]};
  assert.deepEqual(displayState(office,'management'),{mode:'idle',kind:null});
  assert.deepEqual(displayState(office,'development'),{mode:'offline',kind:'diagnostic'});
  office.worker=true;
  assert.equal(displayState(office,'development').mode,'offline');
  office.capabilities=['diagnostic'];
  assert.equal(displayState(office,'development').mode,'waiting');
  task.status='blocked';
  assert.equal(displayState(office,'development').mode,'blocked');
  task.status='running';
  assert.equal(displayState(office,'development').mode,'waiting');
  office.people.development.executing=true;
  assert.deepEqual(displayState(office,'development'),{mode:'running',kind:'diagnostic'});
  office.people.development.task=null;
  assert.equal(displayState(office,'development').mode,'idle');
});

test('panel memprioritaskan pekerjaan yang sedang ditugaskan di atas riwayat terbaru',()=>{
  const assigned={id:'a',division:'development',status:'running'};
  const newer={id:'b',division:'development',status:'queued'};
  const office={people:{development:{task:assigned}},tasks:[newer,{...assigned,started:100}]};
  assert.equal(workstationTask(office,'development').started,100);
  office.tasks=[newer];
  assert.equal(workstationTask(office,'development'),assigned);
  office.people.development.task=null;
  assert.equal(workstationTask(office,'development'),newer);
});
