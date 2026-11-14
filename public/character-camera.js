import * as THREE from 'three';
import { partitions } from './furnishings.js';
import { districtObstacles, rooms } from './layout.js';

export function createCharacterCamera() {
  const camera=new THREE.PerspectiveCamera(59,1,.10,105);
  const focus=new THREE.Vector3(), anchor=new THREE.Vector3(), desired=new THREE.Vector3();
  const boom=new THREE.Vector3(), hit=new THREE.Vector3(), look=new THREE.Vector3();
  const ray=new THREE.Ray();
  const walls=rooms.flatMap(room=>partitions(room).map(({box:[left,front,right,back],type})=>{
    const height=room.style==='pod' || (type==='back' && room.daylight) ? 1.87 :
      room.style==='service'?1.22:type==='back'?.88:.56;
    return new THREE.Box3(new THREE.Vector3(left-.12,0,front-.12),new THREE.Vector3(right+.12,height,back+.12));
  }));
  for (const {box:[left,front,right,back],height} of districtObstacles)
    walls.push(new THREE.Box3(new THREE.Vector3(left-.12,0,front-.12),new THREE.Vector3(right+.12,height,back+.12)));
  const forward=new THREE.Vector3(0,0,-1);
  let yaw=0,pitch=.29,distance=4.1,reach=distance,initialized=false;

  function reset(heading) {
    yaw=heading-Math.PI;
    pitch=.29;
    distance=4.1;
    reach=Infinity;
    initialized=false;
  }

  function update(root,delta,compact) {
    focus.copy(root.position).y+=1.13;
    anchor.copy(focus);
    forward.set(-Math.sin(yaw),0,-Math.cos(yaw));
    const shoulder=compact?.19:.58;
    const radius=distance*(compact?1.04:1);
    desired.set(-forward.x*Math.cos(pitch)*radius-forward.z*shoulder,Math.sin(pitch)*radius,
      -forward.z*Math.cos(pitch)*radius+forward.x*shoulder).add(anchor);
    boom.copy(desired).sub(anchor);
    const length=boom.length();
    boom.divideScalar(length);
    ray.set(anchor,boom);
    let limit=length;
    for (const wall of walls) {
      if (wall.containsPoint(anchor) || !ray.intersectBox(wall,hit)) continue;
      limit=Math.min(limit,Math.max(.32,hit.distanceTo(anchor)-.13));
    }
    reach=Math.min(limit,initialized?THREE.MathUtils.lerp(reach,limit,1-Math.exp(-delta*10)):limit);
    initialized=true;
    camera.position.copy(anchor).addScaledVector(boom,reach);
    look.copy(focus);
    const offset=shoulder*Math.min(1,reach/length);
    look.x-=forward.z*offset;
    look.z+=forward.x*offset;
    camera.lookAt(look);
    camera.updateMatrixWorld();
  }

  return {
    camera,focus,forward,reset,update,
    rotate(x,y) {
      yaw-=x*.006;
      pitch=THREE.MathUtils.clamp(pitch+y*.0045,.11,.75);
    },
    zoom(factor) { distance=THREE.MathUtils.clamp(distance/factor,2.5,5.9); },
    resize(aspect) { camera.aspect=aspect; camera.updateProjectionMatrix(); },
  };
}
