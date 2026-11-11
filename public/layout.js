import { divisions } from './catalog.js';

// One world unit equals one meter. Ground is y=0.
export const site = {width:44.8, depth:38.8};
export const doorway = 1.75;
export const wallThickness = .19;
export const wings = {
  studio:'Studio Kreatif', technical:'Sayap Teknis', business:'Operasional', commons:'Ruang Bersama',
};

const roomRows = [
  [
    ['creative','studio','#e86a49','#814132','oak'],
    ['video','studio','#a571f1','#422c62','carpet'],
    ['social','studio','#df649c','#65344d','carpet'],
    ['research','technical','#43c98b','#254d43','oak'],
    ['marketing','technical','#26c8b5','#215050','carpet'],
  ],
  [
    ['relaxation','commons','#e2ab65','#694b38','oak','Ruang Santai'],
    ['gaming','commons','#a077fb','#443261','carpet','Lounge Game'],
    ['meeting','commons','#d99855','#684e3c','oak','Ruang Rapat'],
    ['development','technical','#5397ff','#25416b','carpet'],
    ['qa','technical','#8eacfa','#35436c','carpet'],
  ],
  [
    ['executive','business','#f1bc60','#655139','oak','Ruang Dika'],
    ['management','business','#f3be59','#3a4864','oak'],
    ['reception','commons','#3ed1be','#24545c','tile','Resepsionis'],
    ['pantry','commons','#f8a75c','#68432e','tile','Pantri & Kopi'],
    ['operations','technical','#4edaf1','#2d4757','carpet'],
  ],
  [
    ['hr','business','#dc8294','#624651','oak'],
    ['administration','business','#7eb2e5','#354c65','tile'],
    ['finance','business','#b5c968','#42543a','oak'],
    ['restroom','commons','#7cc7d8','#345564','tile','Toilet'],
    ['garden','commons','#82d477','#2d654e','grass','Teras Taman'],
  ],
];

export const rooms = roomRows.flatMap((row,rowIndex) => row.map(([id,wing,accent,floor,finish,label],column) => {
  const person = divisions.find(division => division.id === id);
  return {
    id, wing, accent, floor, finish, label:label ?? person.name, person,
    x:(column-2)*8.65, z:[-15.15,-7.05,7.05,15.15][rowIndex],
    width:[7.7,7.45,7.7,7.45,7.7][column], depth:rowIndex%3 === 0 ? 6.55 : 6.25,
    front:rowIndex<2 ? 1 : -1, outer:rowIndex%3===0,
  };
}));

export const roomById = Object.fromEntries(rooms.map(room => [room.id,room]));
export const point = (room,x,depth) => [room.x+x,room.z-room.front*depth];
export const entrance = room => point(room,0,-room.depth/2);
