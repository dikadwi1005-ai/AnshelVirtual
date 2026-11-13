import { test } from 'node:test';
import assert from 'node:assert/strict';
import { divisions } from '../public/catalog.js';
import { createStore } from '../server/store.ts';
import { validPresence } from '../server/office-presence.ts';

test('office presence preserves a snapshot through refresh and rejects an old leader',()=>{
  let now=1000;
  const store=createStore(':memory:',()=>now);
  const client='11111111-1111-4111-8111-111111111111';
  const next='22222222-2222-4222-8222-222222222222';
  const snapshot={actors:divisions.map(({id})=>({id,position:[1,2],y:.02,angle:0,stage:'walking',
    activity:'coffee',actual:'coffee',anchor:'coffee-0',animation:'walk',seat:0,path:[[2,3]]})),turn:null};
  try {
    assert.equal(validPresence({client,snapshot}),true);
    assert.equal(validPresence({client,snapshot:{...snapshot,actors:snapshot.actors.slice(1)}}),false);
    assert.equal(store.officePresence({client}).leader,true);
    assert.deepEqual(store.officePresence({client,snapshot}).snapshot,snapshot);
    assert.deepEqual(store.officePresence({client:next,snapshot}),{leader:false,snapshot});
    now+=5600;
    assert.deepEqual(store.officePresence({client:next}),{leader:true,snapshot,resume:true});
    assert.deepEqual(store.officePresence({client,snapshot}),{leader:false,snapshot});
    assert.equal(store.officePresence({client,takeOver:true}).leader,true);
    assert.deepEqual(store.officePresence({client:next}),{leader:false,snapshot});
  } finally { store.close(); }
});
