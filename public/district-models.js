import * as THREE from 'three';

export function fittedModel(asset,[width,height,depth],{fit='stretch'}={}) {
  if(!['stretch','contain'].includes(fit) ||
    ![width,height,depth,asset.size.x,asset.size.y,asset.size.z].every(value=>Number.isFinite(value)&&value>0))
    throw new RangeError('Invalid 3D asset size or fitting mode.');
  const group=new THREE.Group();
  const copy=asset.scene.clone(true);
  const scale=new THREE.Vector3(width/asset.size.x,height/asset.size.y,depth/asset.size.z);
  // Dynamic vehicles are visual props with a physical aspect ratio. The
  // default stretch remains for authored building/collision footprints.
  if(fit==='contain')scale.setScalar(Math.min(scale.x,scale.y,scale.z));
  const center=asset.bounds.getCenter(new THREE.Vector3());
  copy.position.set(-center.x*scale.x,-asset.bounds.min.y*scale.y,-center.z*scale.z);
  copy.scale.copy(scale);
  copy.traverse(mesh=>{if(mesh.isMesh) mesh.castShadow=mesh.receiveShadow=true;});
  group.add(copy);
  return group;
}

export function batchDistrictModels(parent,asset,placements) {
  const fitted=fittedModel(asset,placements[0].size);
  fitted.updateMatrixWorld(true);
  const dummy=new THREE.Object3D(), local=new THREE.Matrix4();
  const tint=new THREE.Color();
  fitted.traverse(node=>{
    if (!node.isMesh) return;
    const mesh=new THREE.InstancedMesh(node.geometry,node.material,placements.length);
    for(const [index,part] of placements.entries()) {
      const [width,height,depth]=part.size;
      const base=placements[0].size;
      dummy.scale.set(width/base[0],height/base[1],depth/base[2]);
      dummy.position.set(...part.position);
      dummy.rotation.y=part.angle;
      dummy.updateMatrix();
      mesh.setMatrixAt(index,local.multiplyMatrices(dummy.matrix,node.matrixWorld));
      if (part.tint) mesh.setColorAt(index,tint.set(part.tint));
    }
    mesh.castShadow=mesh.receiveShadow=true;
    mesh.computeBoundingSphere();
    parent.add(mesh);
  });
}

// Subtract the front doorway on authored house meshes while retaining their UVs.
export function openHouseFacade(asset,entranceFraction,widthFraction,heightFraction) {
  const scene=asset.scene.clone(true);
  const center=asset.bounds.getCenter(new THREE.Vector3());
  const x=center.x-entranceFraction*asset.size.x;
  const half=asset.size.x*widthFraction/2;
  const cuts=[[0,x-half,1],[0,x+half,-1],
    [1,asset.bounds.min.y+asset.size.y*heightFraction,-1],
    [2,asset.bounds.min.z+asset.size.z*.24,-1]];
  scene.traverse(node=>{
    if (!node.isMesh) return;
    const original=node.geometry;
    const source=original.index?original.toNonIndexed():original;
    const keys=['position','normal','uv'].filter(key=>source.hasAttribute(key));
    const attributes=keys.map(key=>source.getAttribute(key));
    const result=attributes.map(()=>[]);
    const vertex=index=>attributes.flatMap(attribute=>Array.from({length:attribute.itemSize},(_,axis)=>attribute.getComponent(index,axis)));
    function emit(polygon) {
      for (let i=1;i<polygon.length-1;i++) for (const point of [polygon[0],polygon[i],polygon[i+1]]) {
        let offset=0;
        for (const [index,attribute] of attributes.entries()) {
          result[index].push(...point.slice(offset,offset+attribute.itemSize));
          offset+=attribute.itemSize;
        }
      }
    }
    const vertices=source.getAttribute('position').count;
    for (let i=0;i<vertices;i+=3) {
      let remaining=[vertex(i),vertex(i+1),vertex(i+2)];
      for (const [axis,limit,sign] of cuts) {
        if (!remaining.length) break;
        const inside=[], outside=[];
        for (const [index,point] of remaining.entries()) {
          const next=remaining[(index+1)%remaining.length];
          const a=(point[axis]-limit)*sign, b=(next[axis]-limit)*sign;
          (a>=0?inside:outside).push(point);
          if ((a>=0)!==(b>=0)) {
            const border=point.map((value,k)=>THREE.MathUtils.lerp(value,next[k],a/(a-b)));
            inside.push(border);
            outside.push(border);
          }
        }
        emit(outside);
        remaining=inside;
      }
    }
    const cut=new THREE.BufferGeometry();
    keys.forEach((key,index)=>cut.setAttribute(key,new THREE.Float32BufferAttribute(result[index],attributes[index].itemSize)));
    cut.computeBoundingSphere();
    node.geometry=cut;
    if (source!==original) source.dispose();
  });
  return {...asset,scene};
}
