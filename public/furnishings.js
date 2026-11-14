import { doorway, entrance, gate, outdoorSeats, point, roomById, wallThickness } from './layout.js';

// Width, depth and height in meters. Ground props share these dimensions with navigation.
export const furniture = {
  desk:['desk',1.82,.76,.77], corner:['deskcorner',2.05,1.42,.77],
  chair:['chairdesk',.65,.62,.91], seat:['chairmoderncushion',.62,.64,.88],
  monitor:['computerscreen',.54,.19,.40], keyboard:['computerkeyboard',.44,.15,.035],
  laptop:['laptop',.36,.28,.24], tv:['televisionmodern',1.38,.28,.82],
  cabinet:['cabinettelevision',1.66,.52,.55], shelf:['bookcaseopen',1.27,.44,1.75],
  books:['books',.30,.22,.24], plant:['pottedplant',.51,.51,1.24], succulent:['plantsmall2',.22,.22,.30],
  largePlant:['pottedplant',.79,.79,1.65],
  couch:['loungesofa',2.34,.94,.88], lounge:['loungechair',.93,.85,.86],
  coffeeTable:['tablecoffee',1.23,.64,.45], round:['tableround',1.20,1.20,.75],
  long:['table',2.63,1.15,.75], counter:['kitchenbar',1.18,.63,.96],
  coffee:['kitchencoffeemachine',.39,.40,.48], fridge:['kitchenfridgesmall',.72,.67,1.18],
  stool:['stoolbar',.43,.43,.66], rug:['rugrectangle',3.3,2.45,.016],
  lamp:['lamproundfloor',.42,.45,1.67], bench:['benchcushion',1.4,.63,.48],
  toilet:['toilet',.68,.80,.77], sink:['bathroomsink',.67,.49,.86],
  rack:['technology/server-rack',.80,.87,1.92],
  tree:['nature/tree-default',1.8,1.8,2.65], smallTree:['nature/tree-small',1.15,1.15,1.82],
};

const themes = {
  management:'warm', executive:'warm', creative:'warm', research:'dark', finance:'dark',
  development:'dark', video:'dark', operations:'dark', qa:'dark',
};

const stationDepth = 1.38;
const seatDepth = .57;
const chairHeight = .42;
export const station = room => ({
  point:point(room,0,seatDepth), approach:point(room,.74,seatDepth-.18),
  angle:room.front===1 ? Math.PI : 0, height:chairHeight, clip:'sit', id:room.id+'-desk',
  support:room.id+'-chair',
});

export function propsFor(room) {
  const items = [];
  const front = room.front===1 ? 0 : Math.PI;
  const put = (type,x,depth,{y=0,turn=0,key,tone,size} = {}) => items.push({
    type, at:point(room,x,depth), y, angle:front+turn, id:key ? room.id+'-'+key : null,
    accent:tone ?? room.accent, wood:themes[room.id] ?? 'medium',size,
  });
  const desk = (x,depth,configuration) => {
    put('desk',x,depth);
    put('monitor',x-.24,depth+.18,{y:.77});
    if (configuration==='dual') put('monitor',x+.34,depth+.18,{y:.77,turn:-.13});
    else put('succulent',x+.63,depth+.14,{y:.77});
    put('keyboard',x-.04,depth-.285,{y:.77});
  };
  const media = (x,depth) => {
    put('cabinet',x,depth);
    put('tv',x,depth+.04,{y:.55});
  };
  const set = (type,placements) => placements.forEach(([x,depth])=>put(type,x,depth));

  if (room.person || room.id==='executive') {
    desk(0,stationDepth,['development','operations','video','qa'].includes(room.id)?'dual':'single');
    put('chair',0,seatDepth,{turn:Math.PI,key:'chair'});
    put('plant',3.1,room.id==='video'?1.08:2.45);
    switch (room.id) {
      case 'development':
        desk(-2.3,1.38,'dual');
        put('chair',-2.3,.38,{turn:Math.PI});
        desk(2.44,1.38,'dual');
        put('chair',2.44,.38,{turn:Math.PI});
        set('shelf',[[2.2,2.55]]);
        media(-4.31,2.91);
        put('round',-4.02,-.86);
        put('seat',-4.02,-1.85,{turn:Math.PI});
        break;
      case 'qa':
        desk(2.38,1.45,'dual');
        put('chair',2.38,.44,{turn:Math.PI});
        put('cabinet',-2.55,2.45);
        put('books',-2.6,2.49,{y:.55});
        break;
      case 'operations':
        for (const x of [-2.72,-1.68]) put('rack',x,2.46,{turn:-Math.PI/2});
        put('shelf',2.03,2.6);
        put('monitor',2.55,.42,{y:.77,turn:-Math.PI/2});
        put('desk',2.58,.42,{turn:-Math.PI/2});
        break;
      case 'video':
        media(2.43,2.47);
        put('couch',-2.67,-.16,{turn:Math.PI/2});
        put('lamp',-2.76,2.29);
        break;
      case 'creative':
        put('long',-2.25,1.42,{turn:Math.PI/2});
        put('laptop',-2.24,1.56,{y:.75,turn:Math.PI/2});
        put('books',-2.29,.68,{y:.75});
        put('seat',-3.28,1.13,{turn:Math.PI/2});
        put('seat',-3.28,2.23,{turn:Math.PI/2});
        put('lounge',2.54,-1.37,{turn:-.7});
        break;
      case 'social':
        put('round',-2.36,1.05);
        put('laptop',-2.36,1.05,{y:.75});
        set('seat',[[-2.36,.07],[-3.25,1.05]]);
        put('lounge',2.44,-1.28,{turn:-.46});
        break;
      case 'research':
        set('shelf',[[-2.58,2.61],[-1.09,2.61]]);
        put('lounge',-2.43,.86,{turn:.34});
        put('lamp',-3.12,1.66);
        break;
      case 'marketing':
        media(-2.3,2.56);
        put('round',2.25,-.31);
        put('seat',2.22,-1.24);
        break;
      case 'finance':
        set('shelf',[[-2.61,2.57],[-1.16,2.57]]);
        put('desk',2.45,1.00,{turn:-Math.PI/2});
        put('laptop',2.45,1.00,{y:.77,turn:-Math.PI/2});
        put('seat',2.39,-.40);
        break;
      case 'hr':
        put('round',-2.33,.65);
        set('seat',[[-2.33,-.29],[-3.24,.65]]);
        put('shelf',2.23,2.57);
        break;
      case 'administration':
        set('shelf',[[-2.62,2.56],[2.55,1.22]]);
        put('coffeeTable',-2.47,-.43);
        put('books',-2.47,-.43,{y:.45});
        break;
      case 'management':
        put('round',-2.46,.49);
        put('seat',-2.48,-.51,{turn:Math.PI});
        put('seat',-2.48,1.48);
        media(1.75,2.38);
        put('lamp',-3.12,2.42);
        break;
      default:
        put('couch',-2.84,.73,{turn:Math.PI/2});
        put('coffeeTable',-1.85,.73,{turn:Math.PI/2});
        put('shelf',2.1,2.56);
        put('lamp',-2.68,2.36);
    }
    return items;
  }

  switch(room.id) {
    case 'hub':
      put('rug',-2.8,1.2,{turn:Math.PI/2,tone:'#517e76'});
      put('couch',-3.65,1.2,{turn:Math.PI/2});
      put('lounge',-1.9,2.95,{turn:-Math.PI*.73});
      put('coffeeTable',-2.55,1.68,{turn:Math.PI/2});
      put('round',2.8,-1.4);
      put('seat',2.8,-2.5,{turn:Math.PI});
      put('seat',3.8,-1.36,{turn:-Math.PI/2});
      put('largePlant',3.15,2.25);
      put('largePlant',-2.9,-2.1);
      break;
    case 'gaming':
      put('couch',2.83,-.56,{turn:-Math.PI/2,key:'sofa'});
      put('rug',2.15,-.62,{turn:Math.PI/2,tone:'#625189'});
      put('cabinet',.83,-.62,{turn:Math.PI/2});
      put('tv',.80,-.62,{y:.55,turn:Math.PI/2,size:[1.60,.28,.96]});
      put('coffeeTable',1.0,-2.21);
      put('shelf',-2.58,2.38);
      put('books',-2.69,2.36,{y:1.24});
      put('lamp',2.5,1.55);
      put('plant',-2.83,-1.68);
      break;
    case 'pantry':
      for (const x of [-1.45,0,1.45]) {
        put('counter',x,2.08);
        put('coffee',x,2.09,{y:.96});
      }
      put('fridge',-2.95,2.13);
      put('round',2.29,-.35);
      set('stool',[[2.28,-1.23],[2.27,.54],[3.22,-.35]]);
      break;
    case 'relaxation':
      put('couch',0,1.94,{key:'sofa',size:[3.15,.94,.88]});
      put('rug',0,1.26);
      put('lounge',-2.55,.76,{turn:Math.PI/3});
      put('lounge',2.55,.76,{turn:-Math.PI/3});
      put('lamp',2.73,2.51);
      put('shelf',-2.32,2.54);
      break;
    case 'meeting':
      put('long',0,1.23);
      for (const x of [-.78,.78]) {
        put('seat',x,.22,{turn:Math.PI,key:x<0?'seat-left':'seat-right'});
        put('seat',x,2.25,{key:x<0?'seat-rear-left':'seat-rear-right'});
      }
      put('laptop',-.77,1.12,{y:.75});
      media(2.59,2.53);
      put('plant',-2.88,2.44);
      break;
    case 'reception':
      put('desk',0,1.5);
      put('laptop',.32,1.51,{y:.77,turn:Math.PI});
      put('chair',0,2.25);
      put('couch',-2.76,.31,{turn:Math.PI/2});
      put('plant',2.79,2.35);
      put('bench',2.4,-.62,{turn:-Math.PI/2});
      break;
    case 'restroom':
      set('toilet',[[-2.5,2.25],[-.9,2.25]]);
      set('sink',[[1.2,2.47],[2.55,2.47]]);
      put('cabinet',2.60,-1.35,{turn:-Math.PI/2});
      break;
    case 'garden':
      put('tree',-2.55,1.88);
      put('smallTree',2.47,2.33);
      put('bench',0,2.12);
      put('round',2.3,.26);
      put('plant',-2.66,-1.63);
      break;
  }
  return items;
}

export function partitions(room) {
  const h = wallThickness/2;
  const [doorX,doorZ] = entrance(room);
  const x0 = room.x-room.width/2, x1 = room.x+room.width/2;
  const z0 = room.z-room.depth/2, z1 = room.z+room.depth/2;
  const back = room.front===1 ? z0 : z1;
  const gap = doorway/2;
  const rear={box:[x0,back-h,x1,back+h],type:'back'};
  if (room.style==='hub') return [];
  if (room.style==='open') return room.daylight ? [rear] : [];
  if (room.style==='nook' || room.style==='garden') {
    const reach=room.depth*.54;
    const [start,end]=room.front===1 ? [z0,z0+reach] : [z1-reach,z1];
    return [rear,{box:[x0-h,start,x0+h,end],type:'side'}];
  }
  const walls = [
    {box:[x0-h,z0,x0+h,z1],type:'side'},
    {box:[x1-h,z0,x1+h,z1],type:'side'},
    rear,
    {box:[x0,doorZ-h,doorX-gap,doorZ+h],type:'front'},
    {box:[doorX+gap,doorZ-h,x1,doorZ+h],type:'front'},
  ];
  if (room.id==='restroom') {
    for (const x of [-1.70,-.05]) {
      const [px,pz]=point(room,x,2.11);
      walls.push({box:[px-h,pz-.95,px+h,pz+.95],type:'stall'});
    }
  }
  return walls;
}

export function propBounds(prop) {
  const [width,depth] = prop.size ?? furniture[prop.type].slice(1);
  const cosine=Math.abs(Math.cos(prop.angle)), sine=Math.abs(Math.sin(prop.angle));
  const rx=(width*cosine+depth*sine)/2, rz=(width*sine+depth*cosine)/2;
  return [prop.at[0]-rx,prop.at[1]-rz,prop.at[0]+rx,prop.at[1]+rz];
}

export function obstaclesFor(room,props=propsFor(room)) {
  return [
    ...partitions(room).map(({box})=>({box,id:null})),
    ...props.filter(prop=>prop.y<.1 && prop.type!=='rug').map(prop=>({box:propBounds(prop),id:prop.id})),
  ];
}

const localAnchor = (room,x,z,angle,clip,id,extra={}) => ({
  point:point(room,x,z), approach:point(room,x,z), angle, clip, id, height:0, ...extra,
});

export const conversationAnchors=[['hub',0,0],['reception',0,-1],['garden',-.25,-2.75]].map(([id,x,depth])=>{
  const room=roomById[id];
  const center=point(room,x,depth);
  return [[-1.16,0],[1.16,0],[0,1.16],[0,-1.16]].map(([dx,dz],slot)=>
    localAnchor(room,x+dx,depth+dz,Math.atan2(-dx,room.front*dz),'idle',id+'-talk-'+slot,{
      conversation:id,center,slot,
    }));
});

export function activityAnchors(person,activity) {
  if (['desk','work','nap'].includes(activity)) return [{
    ...station(roomById[person.id]), clip:'sit',
  }];
  const options = {
    coffee:()=>[-1.45,0,1.45].map((x,i)=>localAnchor(roomById.pantry,x,1.34,0,'drink','coffee-'+i)),
    game:()=>gamingSeats('game-play'),
    rest:()=>[-.56,.56].map((x,i)=>localAnchor(roomById.relaxation,x,1.88,0,'sit','rest-'+i,{
      height:.42, approach:point(roomById.relaxation,x,.90), support:'relaxation-sofa',
    })),
    read:()=>[-.56,.56].map((x,i)=>localAnchor(roomById.relaxation,x,1.88,0,'read','rest-'+i,{
      height:.42, approach:point(roomById.relaxation,x,.90), support:'relaxation-sofa',
    })),
    tv:()=>gamingSeats('sit'),
    talk:()=>conversationAnchors.flat(),
    meeting:()=>[-.78,.78].map((x,i)=>localAnchor(roomById.meeting,x,.22,Math.PI,'sit','meeting-'+i,{
      height:.42, approach:point(roomById.meeting,x,-.58), support:'meeting-seat-'+(i?'right':'left'),
      conversation:'meeting',center:point(roomById.meeting,0,.22),
    })).concat([-.78,.78].map((x,i)=>localAnchor(roomById.meeting,x,2.25,0,'sit','meeting-'+(i+2),{
      height:.42,approach:point(roomById.meeting,Math.sign(x)*1.82,1.9),
      support:'meeting-seat-rear-'+(i?'right':'left'),conversation:'meeting',center:point(roomById.meeting,0,1.23),
    }))),
    stroll:()=>[-1.18,0,1.18].map((x,i)=>localAnchor(roomById.garden,x,-.50,0,'idle','garden-'+i)),
    commute:()=>[{id:'gate-'+person.id,point:[gate.walkway+(person.index%3-1)*.8,31.2+Math.floor(person.index/3)*.78],
      approach:[gate.walkway+(person.index%3-1)*.8,31.2+Math.floor(person.index/3)*.78],angle:Math.PI,height:0,clip:'idle'}],
    outdoor:()=>outdoorSeats.map(([x,z],i)=>({id:'outdoor-'+i,point:[x,z],approach:[x,z-.78],angle:Math.PI,
      height:.48,clip:'sit',support:'outdoor-bench-'+i})),
    visit:()=>[roomById.hr,roomById.marketing,roomById.creative].filter(room=>room.id!==person.id)
      .map(room=>localAnchor(room,0,-1.62,room.front===1?Math.PI:0,'emote-yes','visit-'+room.id)),
  };
  return options[activity]?.() ?? [];
}

function gamingSeats(clip) {
  return [-1.14,-.01].map((depth,slot)=>localAnchor(roomById.gaming,2.71,depth,-Math.PI/2,clip,'gaming-seat-'+slot,{
    height:.47,approach:point(roomById.gaming,1.98,depth),support:'gaming-sofa',controller:slot,
  }));
}
