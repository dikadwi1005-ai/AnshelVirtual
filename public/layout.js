import { divisions } from './catalog.js';

const extra = [
  [
    ['executive','Ruang Dika','executive',-8,4.7,'#d3b58a'],
    ['pantry','Pantri','pantry',0,4.7,'#e1c7a1'],
    ['reception','Resepsionis','reception',8,4.7,'#aec8b8'],
  ],
  [
    ['meeting','Ruang rapat','meeting',-8,4.7,'#c1c7ae'],
    ['gaming','Lounge game','gaming',0,4.7,'#b0a9cb'],
    ['relaxation','Ruang santai','relaxation',8,4.7,'#c7cbae'],
  ],
  [
    ['garden','Teras taman','garden',-8,4.7,'#9fbca0'],
    ['restroom','Toilet','restroom',0,4.7,'#b3c9ca'],
  ],
];

export function layout(floor) {
  const teams = divisions.filter(person => person.floor === floor);
  const [a,b,c,d] = teams;
  return [
    [a.id,a.name,'office',-12,-4.7,'#b9d0b8',a],
    [b.id,b.name,'office',-4,-4.7,'#aec9ca',b],
    [c.id,c.name,'office',4,-4.7,'#dfc3a6',c],
    [d.id,d.name,'office',12,-4.7,'#c7bfcc',d],
    ...extra[floor],
  ].map(([id,name,type,x,z,color,person]) => ({id,name,type,x,z,color,person}));
}
