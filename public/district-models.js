import * as THREE from 'three';

export function fittedModel(asset,[width,height,depth]) {
  const group=new THREE.Group();
  const copy=asset.scene.clone(true);
  const scale=new THREE.Vector3(width/asset.size.x,height/asset.size.y,depth/asset.size.z);
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
