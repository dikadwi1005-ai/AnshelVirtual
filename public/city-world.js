import * as THREE from 'three';
import { avenueHalfWidth, avenueOffset, chunkSize, cityBlock, cityChunks, cityEdge, cityRoadRoute, citySidewalkZ,
  localStreetHalfWidth, localStreetOffset, plotBounds, sidewalkWidth, staffPlot, streetSpans } from './city-plan.js';
import { segmentHits } from './navigation.js';
import { batchDistrictModels, fittedModel } from './district-models.js';

const surfaces=['#718369','#344454','#a1a795','#cad0be','#55724f','#365645','#987559','#648288'];
const homeModels=['a','d','f','i'];
const towerModels=['building-skyscraper-a','building-skyscraper-c','building-skyscraper-d'];
const vehicleModels=['sedan','van','taxi','delivery','garbage-truck','ambulance'];

export async function streamingCity(scene,loadModel,low=false) {
  const root=new THREE.Group();
  root.name='Kota Anshel';
  scene.add(root);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(cityEdge*2,cityEdge*2),new THREE.MeshStandardMaterial({color:'#617765'}));
  ground.rotation.x=-Math.PI/2;
  ground.position.y=-.19;
  root.add(ground);
  const cube=new THREE.BoxGeometry(), treeGeometry=new THREE.IcosahedronGeometry(1,0);
  const material=new THREE.MeshStandardMaterial({roughness:.85});
  const lampMaterial=new THREE.MeshStandardMaterial({color:'#ffdda0',emissive:'#ffbe71',emissiveIntensity:.22});
  const dummy=new THREE.Object3D(), tint=new THREE.Color();
  const chunks=new Map();
  const available=new Map();
  const names=[...homeModels.map(type=>'building-type-'+type),'building-type-b','building-type-c',...towerModels,...vehicleModels];
  await Promise.allSettled(names.map(async name=>available.set(name,await loadModel('district/'+name))));

  function batch(parent,positions,geometry=cube,finish=material) {
    if (!positions.length) return;
    const mesh=new THREE.InstancedMesh(geometry,finish,positions.length);
    for (const [index,[x,y,z,w,h,d,color]] of positions.entries()) {
      dummy.position.set(x,y,z);
      dummy.scale.set(w,h,d);
      dummy.rotation.y=0;
      dummy.updateMatrix();
      mesh.setMatrixAt(index,dummy.matrix);
      mesh.setColorAt(index,tint.set(color));
    }
    mesh.computeBoundingSphere();
    parent.add(mesh);
  }

  function populate(block,detail) {
    const {x,z,zone,plots}=block;
    const group=new THREE.Group();
    group.name=block.id;
    root.add(group);
    const roadZ=z+avenueOffset;
    const solids=[], crowns=[], lighting=[];
    const part=(x,y,z,w,h,d,color)=>solids.push([x,y,z,w,h,d,color]);
    const surface=(x,z,w,d,color,y=-.055)=>part(x,y,z,w,.045,d,color);
    const modelPlacements=new Map();
    if (zone!=='campus') {
      const hasLocal=zone==='residential'||zone==='business';
      const crossings=[[avenueOffset,avenueHalfWidth]];
      if (hasLocal) crossings.push([localStreetOffset,localStreetHalfWidth]);
      const horizontal=(at,width,color,y,spans)=>{
        for (const [start,end] of spans) surface(x+(start+end)/2,z+at,end-start,width,color,y);
      };
      const vertical=(at,width,color,y,spans)=>{
        for (const [start,end] of spans) surface(x+at,z+(start+end)/2,width,end-start,color,y);
      };
      const asphalt=streetSpans([[0,avenueHalfWidth]]);
      const sidewalk=streetSpans([[0,avenueHalfWidth+sidewalkWidth]]);
      const crossStreets=streetSpans(crossings);
      surface(x,z,chunkSize,chunkSize,surfaces[0],-.125);
      surface(x,z,avenueHalfWidth*2,chunkSize,surfaces[1]);
      horizontal(avenueOffset,avenueHalfWidth*2,surfaces[1],-.055,asphalt);
      if (hasLocal) horizontal(localStreetOffset,localStreetHalfWidth*2,surfaces[1],-.055,asphalt);
      for (const side of [-1,1]) {
        const center=side*(avenueHalfWidth+sidewalkWidth/2);
        horizontal(avenueOffset+center,sidewalkWidth,surfaces[2],-.033,sidewalk);
        vertical(center,sidewalkWidth,surfaces[2],-.033,crossStreets);
        if (hasLocal) horizontal(localStreetOffset+side*(localStreetHalfWidth+.55),1.1,surfaces[2],-.033,sidewalk);
      }
      for (let i=-56;i<=56;i+=8) {
        if (Math.abs(i)>6) surface(x+i,roadZ,3,.12,surfaces[3],-.024);
        if (crossings.every(([center,half])=>Math.abs(i-center)>half+1.5))
          surface(x,z+i,.12,3,surfaces[3],-.024);
      }
      for (const side of [-1,1]) for (const offset of [-3.4,-2.2,-1,1,2.2,3.4]) {
        surface(x+side*7.1,roadZ+offset,1.65,.48,surfaces[3],-.022);
      }
      for (const offset of [-3.6,-2.4,-1.2,0,1.2,2.4,3.6])
        surface(x+offset,roadZ-avenueHalfWidth-sidewalkWidth/2,.48,1.55,surfaces[3],-.022);
      for (const plot of plots) {
        if (staffPlot(plot)) continue;
        const color=['#776254','#687e84','#867962','#536777'][plot.color];
        const modeled=(plot.townhouse?`building-type-${homeModels[plot.variant]}`:zone==='business'?towerModels[plot.variant%towerModels.length]:
          zone==='residential'?`building-type-${homeModels[plot.variant]}`:
          zone==='market'||zone==='services'?`building-type-${plot.variant%2?'b':'c'}`:null);
        if (detail && modeled && available.has(modeled)) {
          if (!modelPlacements.has(modeled)) modelPlacements.set(modeled,[]);
          modelPlacements.get(modeled).push({position:[plot.x,0,plot.z],size:[plot.width,plot.height,plot.depth],
            angle:plot.angle+(zone==='residential' || plot.townhouse?Math.PI:0)});
        } else {
          part(plot.x,plot.height/2,plot.z,plot.width,plot.height,plot.depth,color);
          part(plot.x,plot.height,plot.z,plot.width+.42,.28,plot.depth+.43,surfaces[6]);
          if (detail && zone==='business') for (let floor=2.2;floor<plot.height-1;floor+=3) {
            part(plot.x,floor,plot.z+plot.depth/2+.025,plot.width*.82,1.44,.07,surfaces[7]);
            part(plot.x,floor,plot.z-plot.depth/2-.025,plot.width*.82,1.44,.07,surfaces[7]);
          }
        }
        const pathZ=(plot.roadZ+plot.z)/2;
        surface(plot.x,pathZ,1.6,Math.abs(plot.roadZ-plot.z)-6,surfaces[2],-.028);
      }
    }
    if (zone==='campus') {
      // Continue the legacy north/south avenue beyond its terminal sidewalk.
      surface(x,52,9,24,surfaces[1]);
      surface(x,-59,9,10,surfaces[1]);
    } else if (zone==='park') {
      for (const side of [-1,1]) {
        surface(x+side*30,z-10,45,61,surfaces[4]);
        surface(x+side*30,z-10,2.3,60,surfaces[2],-.029);
        surface(x+side*30,z-9,41,2.3,surfaces[2],-.027);
        for (const local of [-45,-16,13,44]) {
          const tx=x+side*(18+Math.abs(local)%9),tz=z+local;
          part(tx,.95,tz,.27,1.9,.27,surfaces[6]);
          crowns.push([tx,3.5,tz,2.3,3.1,2.2,surfaces[5]]);
        }
        const plazaX=x+side*29, plazaZ=z-21;
        surface(plazaX,plazaZ,13,11,'#a8aa96',-.027);
        part(plazaX,.15,plazaZ,6,.36,4.8,'#b0b2a5');
        part(plazaX,.34,plazaZ,5.6,.04,4.4,'#507f90');
        for (const offset of [-7.8,7.8]) {
          part(plazaX+offset,.35,plazaZ,1.8,.35,.58,'#765746');
          part(plazaX+offset,.62,plazaZ+.23,1.8,.40,.11,'#765746');
        }
      }
    } else {
      for (const side of [-1,1]) for (const local of [-51,-29,29,51]) {
        const tx=x+local,tz=roadZ+side*7.15;
        part(tx,1.7,tz,.12,3.4,.12,surfaces[1]);
        lighting.push([tx,3.42,tz,.4,.13,.34,'#ffde9a']);
      }
      if (zone==='market'||zone==='services') {
        surface(x+43,z-17,28,14,surfaces[1]);
        for (let px=31;px<=54;px+=3) surface(x+px,z-17,.09,5.3,surfaces[3],-.024);
        for (const px of [9,14]) part(x+px,1.1,roadZ-7,.10,2.2,.10,surfaces[1]);
        part(x+11.5,2.25,roadZ-7,5.4,.18,2.1,surfaces[7]);
      }
    }
    batch(group,solids);
    batch(group,crowns,treeGeometry);
    batch(group,lighting,cube,lampMaterial);
    for (const [name,placements] of modelPlacements) batchDistrictModels(group,available.get(name),placements);
    group.updateMatrixWorld(true);
    group.traverse(node=>{ node.matrixAutoUpdate=false; });
    return {group,detail,obstacles:plots.filter(plot=>!staffPlot(plot)).map(plotBounds)};
  }

  const cars=Array.from({length:low?8:16},(_,index)=>{
    const group=new THREE.Group();
    const type=index%7===6?'motor':vehicleModels[index%7];
    const asset=available.get(type);
    if (type==='motor') {
      batch(group,[[0,.27,-.7,.16,.52,.52,'#202a32'],[0,.27,.7,.16,.52,.52,'#202a32'],
        [0,.58,-.05,.43,.42,1.61,index%2?'#258480':'#bb7047'],[0,.85,.55,.67,.10,.13,'#202a32'],
        [0,1.02,-.17,.44,.53,.34,'#3d5269'],[0,1.4,-.083,.32,.33,.32,'#dbb17d']],cube);
    } else if (asset) group.add(fittedModel(asset,[1.9,index%4===0?1.44:1.88,4.1],{fit:'contain'}));
    else {
      const substitute=new THREE.Mesh(cube,material);
      substitute.scale.set(1.8,1.4,4);
      substitute.position.y=.7;
      group.add(substitute);
    }
    group.visible=false;
    root.add(group);
    return group;
  });
  const pedestrianCount=low?12:25;
  const people=new THREE.InstancedMesh(cube,material,pedestrianCount*4);
  people.frustumCulled=false;
  root.add(people);
  const routes=new Map();
  const intersections=new Map();
  let districtKey='';
  let anchor=[0,0];
  let lastFrame=0;

  function disposeChunk(chunk) {
    chunk.group.removeFromParent();
    for (const node of chunk.group.children) node.dispose?.();
  }

  function stream(view,zoom) {
    const ix=Math.round(view.x/chunkSize), iz=Math.round(view.z/chunkSize);
    const distance=zoom<.14?3:low?1:2;
    const key=`${ix}:${iz}:${distance}`;
    if (key===districtKey) return;
    districtKey=key;
    anchor=[ix,iz];
    const next=new Set();
    for (const block of cityChunks(view.x,view.z,distance)) {
      next.add(block.id);
      const detail=distance!==3 && Math.max(Math.abs(block.ix-ix),Math.abs(block.iz-iz))<=1;
      const current=chunks.get(block.id);
      if (current?.detail===detail) continue;
      if (current) disposeChunk(current);
      chunks.set(block.id,populate(block,detail));
    }
    for (const [id,chunk] of chunks) if (!next.has(id)) { disposeChunk(chunk); chunks.delete(id); }
    routes.clear();
    intersections.clear();
  }

  function update(target,zoom,at,elapsed,player,employees=[]) {
    stream(target,zoom);
    const [ix,iz]=anchor;
    const hour=new Date(at+7*3600000).getUTCHours();
    const density=hour<6||hour>=22?.32:hour<9||hour>=16&&hour<19?1:.75;
    const time=elapsed*.001;
    const delta=Math.max(0,Math.min(.1,(elapsed-lastFrame)*.001));
    lastFrame=elapsed;
    const crossingPhase=time%23;
    const footCrossing=zoom>=.28 && (ix||iz) && crossingPhase>=5 && crossingPhase<14;
    for (const [index,vehicle] of cars.entries()) {
      if (index>=cars.length*density || zoom<.12) {
        const trip=routes.get(index);
        if (trip?.junction) intersections.delete(trip.junction);
        routes.delete(index);
        vehicle.visible=false;
        continue;
      }
      const east=index%2===0;
      const reverse=Math.floor(index/2)%2===1;
      const row=Math.floor(index/4)%3-1;
      const column=ix+row===0 && Math.abs(iz)<2?1:ix+row;
      const start=east?[ix-1,iz+row]:[column,iz-1];
      const end=east?[ix+2,iz+row]:[column,iz+2];
      const trip=routes.get(index) ?? {path:cityRoadRoute(reverse?end:start,reverse?start:end),distance:index*43%380,junction:null};
      routes.set(index,trip);
      const {path}=trip;
      const length=(path.length-1)*chunkSize;
      const cycle=trip.distance;
      const step=Math.min(path.length-2,Math.floor(cycle/chunkSize));
      const [x,z]=path[step], [ex,ez]=path[step+1];
      const dx=Math.sign(ex-x), dz=Math.sign(ez-z);
      const offset=cycle-step*chunkSize;
      const positionX=x+dx*offset-dz*2.2,positionZ=z+dz*offset+dx*2.2;
      if (trip.junction && offset>11 && offset<chunkSize-8) {
        intersections.delete(trip.junction);
        trip.junction=null;
      }
      vehicle.visible=cycle<length && Math.abs(positionX)<cityEdge && Math.abs(positionZ)<cityEdge &&
        (Math.abs(positionX)>88 || Math.abs(positionZ-avenueOffset)>83);
      if (cycle>=length) {
        if (trip.junction) intersections.delete(trip.junction);
        trip.junction=null;
        trip.distance=cycle>length+40?0:cycle+8*delta;
        continue;
      }
      vehicle.position.set(positionX,0,positionZ);
      vehicle.rotation.y=Math.atan2(dx,dz);
      const junction=`${ex}:${ez}`;
      const holding=offset>chunkSize-8 && intersections.has(junction) && intersections.get(junction)!==index;
      if (offset>chunkSize-8 && !holding && !trip.junction) {
        intersections.set(junction,index);
        trip.junction=junction;
      }
      const queue=cars.some(other=>{
        if (other===vehicle || !other.visible) return false;
        const rx=other.position.x-positionX, rz=other.position.z-positionZ;
        const along=rx*dx+rz*dz;
        return along>0 && along<6 && Math.abs(rx*dz-rz*dx)<1.6;
      });
      const crosswalkX=ix*chunkSize+7.1;
      const approachingCrosswalk=(crosswalkX-positionX)*dx;
      const yields=east && footCrossing && Math.abs(positionZ-(iz*chunkSize+avenueOffset))<4 &&
        approachingCrosswalk>1.9 && approachingCrosswalk<8;
      const distanceToStaffCrossing=(iz*chunkSize+citySidewalkZ-positionZ)*dz;
      const staffCrossing=!east && distanceToStaffCrossing>2.1 && distanceToStaffCrossing<9 &&
        employees.some(({root})=>Math.abs(root.position.x-x)<8 &&
          Math.abs(root.position.z-(iz*chunkSize+citySidewalkZ))<1.35);
      const playerAhead=player && (player.x-positionX)*dx+(player.z-positionZ)*dz>0 &&
        Math.hypot(player.x-positionX,player.z-positionZ)<5.4;
      if (!holding && !queue && !yields && !staffCrossing && !playerAhead) trip.distance+=delta*(east?8.2:7.1);
    }
    people.count=zoom>=.28 && (ix||iz)?Math.round(pedestrianCount*density)*4:0;
    for (let index=0;index<people.count/4;index++) {
      const side=index%2?1:-1, progress=(time*.86+index*9)%103;
      const local=progress>51?103-progress:progress;
      const crossing=index<2;
      const crossPosition=THREE.MathUtils.clamp((crossingPhase-5)/9,0,1);
      const direction=Math.floor(time/23)%2?1:-1;
      const x=ix*chunkSize+(crossing?7.1+side*.47:side*(8+local));
      const z=iz*chunkSize+avenueOffset+(crossing?direction*(5.5-crossPosition*11):side*5.5);
      const stride=crossing&&!footCrossing?0:Math.sin(time*8+index)*.11;
      const parts=[[0,.95,0,.40,.67,.27,['#6e4254','#26766d','#4279a2','#955e37'][index%4]],
        [0,1.46,0,.37,.33,.32,'#b48766'],[stride,.35,.105,.16,.54,.14,'#3f4e60'],[-stride,.35,-.105,.16,.54,.14,'#3f4e60']];
      for (const [part,[dx,y,dz,w,h,d,color]] of parts.entries()) {
        dummy.position.set(x+dx,y,z+dz);
        dummy.scale.set(w,h,d);
        dummy.updateMatrix();
        people.setMatrixAt(index*4+part,dummy.matrix);
        people.setColorAt(index*4+part,tint.set(color));
      }
    }
    if (people.count) { people.instanceMatrix.needsUpdate=true; people.instanceColor.needsUpdate=true; }
    return {chunks:chunks.size,vehicles:cars.filter(car=>car.visible).length,pedestrians:people.count/4};
  }

  return {update,
    clear(a,b,radius) {
      const inside=point=>point.every(value=>Math.abs(value)+radius<cityEdge);
      if (!inside(a)||!inside(b)) return false;
      const ix=Math.round(a[0]/chunkSize), iz=Math.round(a[1]/chunkSize);
      for (let x=ix-1;x<=ix+1;x++) for (let z=iz-1;z<=iz+1;z++) {
        if (Math.abs(a[0]-x*chunkSize)>chunkSize/2+2 || Math.abs(a[1]-z*chunkSize)>chunkSize/2+2) continue;
        const obstacles=chunks.get(`${x}:${z}`)?.obstacles ?? cityBlock(x,z).plots.filter(plot=>!staffPlot(plot)).map(plotBounds);
        if (obstacles.some(box=>segmentHits(a,b,box,radius))) return false;
      }
      return !cars.some(car=>car.visible && Math.hypot(car.position.x-b[0],car.position.z-b[1])<2.1 &&
        Math.hypot(car.position.x-b[0],car.position.z-b[1])<Math.hypot(car.position.x-a[0],car.position.z-a[1]));
    },
    lighting(night) { lampMaterial.emissiveIntensity=.24+night*1.12; },dispose() {
    for (const chunk of chunks.values()) disposeChunk(chunk);
    root.removeFromParent();
    people.dispose();
    for (const car of cars) car.traverse(node=>{if(node.isInstancedMesh)node.dispose();});
    for (const asset of [ground.geometry,ground.material,cube,treeGeometry,material,lampMaterial]) asset.dispose();
  }};
}
