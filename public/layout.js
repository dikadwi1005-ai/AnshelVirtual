import { divisions } from './catalog.js';

// One world unit equals one meter. Ground is y=0.
export const site = {width:48.8, depth:43};
const edgeX = site.width/2;
const edgeZ = site.depth/2;
const bevel = 2.3;
export const footprint = [
  [-edgeX+bevel,-edgeZ], [edgeX-bevel,-edgeZ], [edgeX,-edgeZ+bevel], [edgeX,edgeZ-bevel],
  [edgeX-bevel,edgeZ], [-edgeX+bevel,edgeZ], [-edgeX,edgeZ-bevel], [-edgeX,-edgeZ+bevel],
];

export function withinSite([x,z], margin = 0) {
  return Math.abs(x)<=edgeX-margin && Math.abs(z)<=edgeZ-margin &&
    Math.abs(x)+Math.abs(z)<=edgeX+edgeZ-bevel-Math.SQRT2*margin;
}

export const doorway = 1.75;
export const wallThickness = .19;
export const wings = {
  studio:'Studio Kreatif', technical:'Sayap Teknis', business:'Operasional', commons:'Ruang Bersama',
};

// Coordinates are independent of directory order. Open neighborhoods use their full front edge.
const neighborhoods = [
  {
    wing:'studio', areas:[
      {id:'video', x:-18.9,z:-14, width:8.3,depth:7.4,front:1, style:'pod', accent:'#9274ba',floor:'#a29ab5',finish:'carpet',daylight:true},
      {id:'creative', x:-9.75,z:-14.3, width:8.3,depth:8,front:1, style:'open', accent:'#d47447',floor:'#ac815f',finish:'oak',daylight:true},
      {id:'social', x:-14.2,z:-5.55, width:9.1,depth:6.5,front:1, style:'open', accent:'#bb6888',floor:'#bc969e',finish:'carpet'},
    ],
  },
  {
    wing:'technical', areas:[
      {id:'research', x:.7,z:-16.2, width:9.4,depth:6.6,front:1, style:'nook', accent:'#518773',floor:'#a2856d',finish:'oak',daylight:true},
      {id:'development', x:13.9,z:-14.9, width:11,depth:8.3,front:1, style:'open', accent:'#4d82b3',floor:'#829aa8',finish:'carpet',daylight:true},
      {id:'marketing', x:8.9,z:-6.1, width:7.7,depth:6.45,front:1, style:'open', accent:'#4b9386',floor:'#a1b0a2',finish:'carpet'},
      {id:'qa', x:19.0,z:-6.2, width:8.5,depth:6.6,front:1, style:'open', accent:'#7293be',floor:'#9faebc',finish:'carpet'},
      {id:'operations', x:18.75,z:1.95, width:8.4,depth:7.5,front:-1, style:'pod', accent:'#4b9d9c',floor:'#819697',finish:'carpet'},
    ],
  },
  {
    wing:'business', areas:[
      {id:'management', x:2.6,z:8.0, width:8.4,depth:6.35,front:-1, style:'nook', accent:'#b88742',floor:'#b59872',finish:'oak'},
      {id:'executive', x:8.85,z:17.2, width:9,depth:7.3,front:-1, style:'pod', accent:'#ad7742',floor:'#aa8669',finish:'oak',label:'Ruang Dika'},
      {id:'administration', x:11.75,z:9.05, width:8.5,depth:6.5,front:-1, style:'open', accent:'#6995a7',floor:'#a8b5b7',finish:'tile'},
      {id:'finance', x:20.05,z:9.9, width:7.1,depth:6.4,front:-1, style:'nook', accent:'#879c5a',floor:'#a6a483',finish:'oak'},
      {id:'hr', x:18.4,z:17.4, width:8.3,depth:6.4,front:-1, style:'open', accent:'#be7880',floor:'#b79581',finish:'oak'},
    ],
  },
  {
    wing:'commons', areas:[
      {id:'hub', x:0,z:0, width:10,depth:8.15,front:1, style:'hub', accent:'#398a81',floor:'#b9a385',finish:'oak',label:'Atrium Kolaborasi'},
      {id:'meeting', x:0,z:-8.5, width:8.1,depth:6.15,front:1, style:'pod', accent:'#509391',floor:'#ab9c80',finish:'oak',label:'Pod Rapat'},
      {id:'relaxation', x:-10.25,z:1.7, width:8.1,depth:6.4,front:1, style:'open', accent:'#c38858',floor:'#b29981',finish:'oak',label:'Ruang Santai'},
      {id:'gaming', x:-19.15,z:2.15, width:8.35,depth:6.8,front:1, style:'nook', accent:'#9376b6',floor:'#9d8eae',finish:'carpet',label:'Lounge Game'},
      {id:'pantry', x:-9.35,z:8.55, width:8.9,depth:6.35,front:-1, style:'open', accent:'#c48051',floor:'#c0a38a',finish:'tile',label:'Pantri & Kopi'},
      {id:'reception', x:-1.45,z:15.85, width:10.4,depth:7.6,front:-1, style:'open', accent:'#51968c',floor:'#adb7a6',finish:'tile',label:'Resepsionis'},
      {id:'restroom', x:-10.3,z:17.35, width:6.9,depth:6.4,front:-1, style:'service', accent:'#739da5',floor:'#afb9ba',finish:'tile',label:'Toilet'},
      {id:'garden', x:-18.9,z:11.8, width:9.45,depth:10.3,front:-1, style:'garden', accent:'#679667',floor:'#859e69',finish:'grass',label:'Teras Taman'},
    ],
  },
];

export const rooms = neighborhoods.flatMap(({wing,areas}) => areas.map(area => {
  const person = divisions.find(division => division.id === area.id);
  return {...area, wing, person, label:area.label ?? person.name};
}));

export const roomById = Object.fromEntries(rooms.map(room => [room.id,room]));
export const point = (room,x,depth) => [room.x+x,room.z-room.front*depth];
export const entrance = room => point(room,0,-room.depth/2);

export function roomOutline(room,inset = room.style==='hub'?.24:.04) {
  const rx=room.width/2-inset, rz=room.depth/2-inset;
  if (room.style==='hub') {
    return Array.from({length:48},(_,i)=>{
      const a=i*Math.PI/24;
      return [room.x+rx*Math.cos(a),room.z+rz*Math.sin(a)];
    });
  }
  const chamfer=room.style==='open'?.65:.16;
  return [
    [-rx+chamfer,-rz],[rx-chamfer,-rz],[rx,-rz+chamfer],[rx,rz-chamfer],
    [rx-chamfer,rz],[-rx+chamfer,rz],[-rx,rz-chamfer],[-rx,-rz+chamfer],
  ].map(([x,z])=>[room.x+x,room.z+z]);
}

export function insideRoom(room,[x,z]) {
  const outline=roomOutline(room);
  return outline.every(([fromX,fromZ],i)=>{
    const [toX,toZ]=outline[(i+1)%outline.length];
    return (toX-fromX)*(z-fromZ)-(toZ-fromZ)*(x-fromX)>=0;
  });
}
