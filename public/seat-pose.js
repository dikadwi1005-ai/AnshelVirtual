import * as THREE from 'three';

const samples=24;
const pitchLimit=Math.PI/3;
const legNames=['leg-left','leg-right'];

// The Kenney mini rig rotates each shoe with its leg. Give the shoe a local
// pivot so it can stay level on the floor during the seated pose.
export function createSeatRig(figure) {
  const mesh=figure.getObjectByName('body-mesh');
  const rigRoot=figure.getObjectByName('root');
  figure.updateMatrixWorld(true);
  const {position,skinIndex,skinWeight}=mesh.geometry.attributes;
  const indices=skinIndex.clone(), weights=skinWeight.clone();
  const bones=mesh.skeleton.bones.slice(), inverses=mesh.skeleton.boneInverses.slice();
  const contacts=[];
  const joints=legNames.map(name=>{
    const leg=mesh.skeleton.getBoneByName(name);
    const legIndex=bones.indexOf(leg);
    const shoe=new THREE.Bone();
    shoe.position.set(0,.042-leg.position.y,.011-leg.position.z);
    leg.add(shoe);
    shoe.updateWorldMatrix(true,false);
    // Bind against the unscaled asset, as the imported inverse bind matrices do.
    const bind=mesh.skeleton.boneInverses[legIndex].clone().invert().multiply(shoe.matrix);
    const shoeIndex=bones.push(shoe)-1;
    inverses.push(bind.invert());
    for (let i=0;i<position.count;i++) {
      if (skinIndex.getX(i)!==legIndex || skinWeight.getX(i)<.999) continue;
      const y=position.getY(i), z=position.getZ(i);
      contacts.push({index:i,hip:y>.153 && z<-.042,shoe:y<.001});
      const shoeWeight=1-THREE.MathUtils.smoothstep(y,.04,.107);
      if (shoeWeight>0) {
        indices.setXY(i,legIndex,shoeIndex);
        weights.setXY(i,1-shoeWeight,shoeWeight);
      }
    }
    return {leg,shoe};
  });
  mesh.geometry=mesh.geometry.clone();
  mesh.geometry.setAttribute('skinIndex',indices);
  mesh.geometry.setAttribute('skinWeight',weights);
  mesh.bind(new THREE.Skeleton(bones,inverses),mesh.bindMatrix);

  function pose(pitch) {
    for (const {leg,shoe} of joints) {
      leg.rotation.set(-pitch,0,0);
      shoe.rotation.x=pitch;
    }
  }

  const vertex=new THREE.Vector3();
  const curve=Array.from({length:samples+1},(_,i)=>{
    pose(i*pitchLimit/samples);
    figure.updateMatrixWorld(true);
    let sole=Infinity, hip=Infinity, hipDepth=0, shoeDepth=0, shoeVertices=0;
    for (const contact of contacts) {
      mesh.getVertexPosition(contact.index,vertex).applyMatrix4(mesh.matrixWorld);
      sole=Math.min(sole,vertex.y);
      if (contact.hip && vertex.y<hip) {
        hip=vertex.y;
        hipDepth=vertex.z;
      }
      if (contact.shoe) {
        shoeDepth+=vertex.z;
        shoeVertices++;
      }
    }
    if (!Number.isFinite(sole+hip) || !shoeVertices) throw new Error('Titik kontak rig duduk tidak ditemukan');
    return {rise:-sole,height:hip-sole,hipDepth,shoeDepth:shoeDepth/shoeVertices};
  });
  pose(0);

  return {
    fit(height) {
      if (height>curve[0].height || height<curve[samples].height) return null;
      const next=curve.findIndex(point=>point.height<=height);
      if (next===0) return {...curve[0],sample:0};
      const from=curve[next-1],to=curve[next];
      const fraction=(from.height-height)/(from.height-to.height);
      return {sample:next-1+fraction,hipDepth:THREE.MathUtils.lerp(from.hipDepth,to.hipDepth,fraction),
        shoeDepth:THREE.MathUtils.lerp(from.shoeDepth,to.shoeDepth,fraction)};
    },
    standingOffset(fit) {
      return fit.shoeDepth-curve[0].shoeDepth-fit.hipDepth;
    },
    apply(fit,progress) {
      const index=fit.sample*progress;
      const low=Math.floor(index);
      pose(index*pitchLimit/samples);
      rigRoot.position.y=0;
      const high=Math.min(samples,low+1), fraction=index-low;
      const rise=THREE.MathUtils.lerp(curve[low].rise,curve[high].rise,fraction);
      const foot=THREE.MathUtils.lerp(curve[low].shoeDepth,curve[high].shoeDepth,fraction);
      return {rise,forward:fit.shoeDepth-foot-fit.hipDepth};
    },
  };
}
