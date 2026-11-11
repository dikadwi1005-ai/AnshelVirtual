import assert from 'node:assert/strict';
import { test } from 'node:test';
import { divisions } from '../public/catalog.js';
import { chooseConversationAnchor, createConversations, createMonologues } from '../public/conversations.js';
import { conversationAnchors, obstaclesFor } from '../public/furnishings.js';
import { rooms } from '../public/layout.js';
import { navigation } from '../public/navigation.js';

test('slot percakapan dapat dicapai, terpisah dan menghadap pusat',()=>{
  const nav=navigation(rooms.flatMap(room=>obstaclesFor(room)));
  const reservations=new Map();
  for (const person of divisions) {
    const actor={person,anchor:null};
    const anchor=chooseConversationAnchor(actor,reservations,slot=>!!nav.route([0,0],slot.point));
    assert.ok(anchor,person.id);
    assert.equal(reservations.has(anchor.id),false);
    reservations.set(anchor.id,actor);
    const [dx,dz]=anchor.center.map((value,index)=>value-anchor.point[index]);
    assert.ok(Math.abs(Math.sin(anchor.angle)-dx/1.16)<.001);
    assert.ok(Math.abs(Math.cos(anchor.angle)-dz/1.16)<.001);
    actor.anchor=anchor;
    assert.equal(chooseConversationAnchor(actor,reservations,()=>true),anchor);
  }
  for (const group of conversationAnchors) {
    for (const [i,a] of group.entries()) for (const b of group.slice(i+1)) {
      assert.ok(Math.hypot(a.point[0]-b.point[0],a.point[1]-b.point[1])>1.6);
    }
  }
  const [west,east]=conversationAnchors[0];
  const pair=new Map([[east.id,{person:divisions[0]}]]);
  assert.equal(chooseConversationAnchor({},pair,()=>true),west);
  assert.equal(chooseConversationAnchor({},reservations,()=>true),null);
});

test('monolog singkat dapat muncul di meja sendirian, dengan jeda dan tanpa mengganggu tugas',()=>{
  const person=divisions[0];
  const actor={person,stage:'seated',actual:'desk',anchor:{},root:{position:{x:0,z:0}}};
  const plan={activity:'desk',task:null};
  const office={people:{[person.id]:plan}};
  const monologues=createMonologues();
  const groups=new Map();
  const focus={x:0,z:0};
  assert.equal(monologues.update(4,[actor],groups,office,focus),null);
  const first=monologues.update(1,[actor],groups,office,focus);
  assert.equal(first?.speaker,actor);
  assert.equal(first?.solo,true);
  assert.equal(monologues.update(3,[actor],groups,office,focus),null);
  assert.equal(monologues.update(10,[actor],groups,office,focus),null);
  assert.notEqual(monologues.update(5,[actor],groups,office,focus)?.text,first?.text);
  plan.task={status:'queued'};
  assert.equal(monologues.update(.05,[actor],groups,office,focus),null);
  assert.equal(monologues.update(30,[actor],groups,office,focus),null);
});

test('percakapan bergiliran dan bubar saat peserta terakhir mendapat tugas',()=>{
  const participants=divisions.slice(0,3).map(person=>({person}));
  const groups=new Map([['hub',participants]]);
  const office={people:{finance:{task:{status:'queued'}}}};
  const conversation=createConversations();
  const turns=[];
  for (let step=0;step<240;step++) {
    conversation.update(.05,groups,office);
    const turn=conversation.turns.get('hub');
    if (turn && turns.at(-1)!==turn) turns.push(turn);
  }
  assert.deepEqual(turns.slice(0,3).map(turn=>turn.speaker),participants);
  assert.match(turns[1].text,/tugas di antrean/);
  groups.set('hub',[participants[0]]);
  conversation.update(.05,groups,office);
  assert.equal(conversation.turns.size,0);
  groups.set('hub',participants.slice(0,2));
  conversation.update(.5,groups,{people:{}});
  assert.equal(conversation.turns.get('hub').speaker,participants[0]);
  conversation.update(4,groups,{people:{}});
  conversation.update(.4,groups,{people:{}});
  assert.equal(conversation.turns.get('hub').speaker,participants[1]);
  assert.doesNotMatch(conversation.turns.get('hub').text,/tugas di antrean/);
});
