// Deterministic, decorative-only art pass for the 21-room office.
// Coordinates match the existing meter-based room footprints. These accents
// are shallow and do not enter the navigation/collision or furniture layout.
export function officeInteriorAccents(room) {
  const accent=room.accent;
  const front=room.front;
  const strips=[];
  const entranceZ=room.z+front*(room.depth/2-.74);
  const span=Math.min(2.15,room.width*.32);
  // Two low-profile threshold inlays visually identify a division/room without
  // adding any obstruction or modifying entrance waypoint calculations.
  for(const side of [-1,1]) {
    strips.push({kind:'floor',color:accent,x:room.x+side*span*.55,y:.034,
      z:entranceZ,w:Math.min(.73,span*.5),h:.012,d:.045});
  }
  const hasRearWall=room.style!=='hub' && (room.style!=='open'||room.daylight===true);
  if(!hasRearWall)return strips;
  const rearZ=room.z-front*(room.depth/2-.145);
  const width=Math.min(2.82,room.width*.40);
  // Wall-mounted acoustic/plaque detail above bookshelves, outside reach of
  // seated characters and beneath the existing ceiling-light housings.
  strips.push({kind:'wall',color:'#334752',x:room.x,y:2.23,z:rearZ,
    w:width,h:.28,d:.045});
  strips.push({kind:'wall',color:accent,x:room.x,y:2.41,z:rearZ+.018*front,
    w:width*.96,h:.055,d:.047});
  for(const side of [-1,1]) strips.push({kind:'wall',color:'#d2c7b5',
    x:room.x+side*width*.46,y:2.23,z:rearZ+.032*front,
    w:.035,h:.22,d:.05});
  return strips;
}
