import * as THREE from 'three';

const geometries=new WeakMap();

export function employeeMouth(figure) {
  const mesh=figure.getObjectByName('head-mesh');
  if (!mesh) return null;
  let geometry=geometries.get(mesh.geometry);
  if (!geometry) {
    const source=mesh.geometry;
    const position=source.attributes.position;
    const open=new Float32Array(position.count*3);
    const round=new Float32Array(open.length), wide=new Float32Array(open.length);
    let matches=0;
    for (let index=0;index<position.count;index++) {
      const x=position.getX(index), y=position.getY(index), z=position.getZ(index);
      // All approved Kenney heads share this lip contour, including the moustache variant.
      if (Math.abs(x)>.046 || y<.400 || y>.436 || Math.abs(z-.15964)>.0002) continue;
      const offset=index*3;
      open[offset+1]=(y-.422)*.88-.005;
      round[offset]=x*-.44;
      wide[offset]=x*.29;
      matches++;
    }
    if (!matches) return null;
    geometry=source.clone();
    geometry.morphTargetsRelative=true;
    geometry.morphAttributes.position=[open,round,wide].map(values=>new THREE.BufferAttribute(values,3));
    geometries.set(source,geometry);
  }
  mesh.geometry=geometry;
  mesh.updateMorphTargets();
  return mesh.morphTargetInfluences;
}


const mouthKeys=['open','round','wide'];

// Filter rapid viseme changes from approximate text-to-shape timing. This is
// animation polish, not audio phoneme recognition. Caller resets influences
// immediately when a new speaker takes over or speech ends.
export function blendEmployeeMouth(mouth,pose,seconds) {
  if(!mouth) return;
  for (let index=0;index<3;index++) {
    const raw=Number(pose?.[mouthKeys[index]]);
    const next=Number.isFinite(raw)?THREE.MathUtils.clamp(raw,0,1):0;
    if(!Number.isFinite(seconds)||seconds<=0) {
      mouth[index]=next;
      continue;
    }
    const current=Number.isFinite(mouth[index])?mouth[index]:0;
    const speed=next>current?31:24;
    const alpha=THREE.MathUtils.clamp(1-Math.exp(-seconds*speed),0,1);
    mouth[index]=THREE.MathUtils.lerp(current,next,alpha);
  }
}
