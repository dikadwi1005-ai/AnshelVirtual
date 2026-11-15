export const chunkSize=128;
export const cityRadius=8;
export const cityEdge=(cityRadius+.5)*chunkSize;
export const avenueOffset=36;
export const cityDistricts={
  business:{label:'Pusat bisnis',x:128,z:36},
  residential:{label:'Permukiman barat',x:-384,z:36},
  market:{label:'Pasar timur',x:512,z:36},
  park:{label:'Taman kota',x:0,z:-348},
  services:{label:'Terminal selatan',x:0,z:548},
};
const noise=(x,z)=>((Math.imul(x+41,19349663)^Math.imul(z+71,83492791))>>>0)%997/997;

export function zoneAt(x,z) {
  if (!x && !z) return 'campus';
  if (Math.abs(x)<=2 && Math.abs(z)<=1) return 'business';
  if (z>=3 && Math.abs(x)<=2) return 'services';
  if (z<=-2 && Math.abs(x)<=2 || (x+z*2)%7===0) return 'park';
  if (x>=3 && Math.abs(z)<=2) return 'market';
  return 'residential';
}

export function cityBlock(ix,iz) {
  const zone=zoneAt(ix,iz), x=ix*chunkSize, z=iz*chunkSize;
  const plots=[];
  if (zone!=='campus') {
    for (const east of [-1,1]) for (const north of [-1,1]) {
      if (zone==='park') continue;
      const count=zone==='residential'?4:zone==='business'?2:3;
      for (let row=0;row<count;row++) {
        const n=noise(ix*13+row*2+east,iz*7+north);
        const localZ=north===1?(zone==='business'?16:14):-21;
        const plot={id:`${ix}:${iz}/${east}/${north}/${row}`,zone,x:x+east*(19+row*(count===4?11:15)),
          z:z+avenueOffset+localZ,angle:north===1?Math.PI:0,roadZ:z+avenueOffset,
          width:zone==='residential'?8+2*n:11+4*n,depth:zone==='business'?21:12,
          height:zone==='business'?15+20*n:zone==='residential'?4.5+1.1*n:6+2*n,
          variant:Math.floor(n*4),color:Math.floor(n*100)%4};
        plots.push(plot);
        if (north===-1 && (zone==='business'||zone==='residential')) for (const side of [-1,1]) {
          plots.push({...plot,id:plot.id+`/local/${side}`,z:z-29+side*16,roadZ:z-29,
            angle:side===1?Math.PI:0,height:plot.height*.83,variant:(plot.variant+side+4)%4});
        }
      }
    }
  }
  return {id:`${ix}:${iz}`,ix,iz,x,z,zone,plots};
}

export function cityChunks(x,z,radius) {
  const ix=Math.round(x/chunkSize), iz=Math.round(z/chunkSize), chunks=[];
  for (let dz=-radius;dz<=radius;dz++) for (let dx=-radius;dx<=radius;dx++) {
    if (Math.abs(ix+dx)<=cityRadius && Math.abs(iz+dz)<=cityRadius) chunks.push(cityBlock(ix+dx,iz+dz));
  }
  return chunks;
}

export function cityRoadRoute(from,to) {
  const points=[[from[0],from[1]]];
  let [x,z]=from;
  while (x!==to[0]) { x+=Math.sign(to[0]-x); points.push([x,z]); }
  while (z!==to[1]) { z+=Math.sign(to[1]-z); points.push([x,z]); }
  return points.map(([ix,iz])=>[ix*chunkSize,iz*chunkSize+avenueOffset]);
}

export function plotBounds(plot) {
  return [plot.x-plot.width/2,plot.z-plot.depth/2,plot.x+plot.width/2,plot.z+plot.depth/2];
}
