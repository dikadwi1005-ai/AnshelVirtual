import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { employeeProfile } from './employee-profiles.js';

const fabricMaps=new Map();

function fabricMap(map, profile) {
  const key=map.uuid+':'+profile.dye+':'+profile.fabricTile.join(',');
  if (fabricMaps.has(key)) return fabricMaps.get(key);

  const canvas=document.createElement('canvas');
  const source=map.image;
  canvas.width=source.width;
  canvas.height=source.height;
  const context=canvas.getContext('2d',{willReadFrequently:true});
  context.drawImage(source,0,0);
  const [column,row]=profile.fabricTile;
  const width=Math.floor(canvas.width/8), height=Math.floor(canvas.height/4);
  const x=column*width, y=row*height;
  const swatch=context.getImageData(x,y,width,height);
  const target=profile.dye.slice(1).match(/../g).map(hex=>Number.parseInt(hex,16));
  for (let offset=0;offset<swatch.data.length;offset+=4) {
    const shade=Math.max(swatch.data[offset],swatch.data[offset+1],swatch.data[offset+2])/255;
    for (let channel=0;channel<3;channel++) swatch.data[offset+channel]=target[channel]*shade;
  }
  context.putImageData(swatch,x,y);
  const texture=map.clone();
  texture.source=new THREE.Source(canvas);
  texture.needsUpdate=true;
  fabricMaps.set(key,texture);
  return texture;
}

export function employeeFigure(asset, division) {
  const profile=employeeProfile(division);
  if (!asset.animations.some(clip=>clip.name==='walk') || !asset.animations.some(clip=>clip.name==='sit')) {
    throw new Error('Rig berjalan/duduk tidak tersedia: '+profile.asset);
  }
  const figure=clone(asset.scene);
  const body=figure.getObjectByName('body-mesh');
  const head=figure.getObjectByName('head-mesh');
  if (!body?.isSkinnedMesh || !head?.isSkinnedMesh ||
      !['leg-left','leg-right','arm-left','arm-right'].every(name=>body.skeleton.getBoneByName(name)) ||
      !Number.isFinite(asset.size.y) || asset.size.y<=0) {
    throw new Error('Rig karyawan tidak kompatibel: '+profile.asset);
  }
  figure.scale.setScalar(profile.stature/asset.size.y);
  if (profile.dye) {
    if (!body.material.map?.image) throw new Error('Atlas pakaian tidak tersedia: '+profile.asset);
    body.material=body.material.clone();
    body.material.map=fabricMap(body.material.map,profile);
  }
  return figure;
}
