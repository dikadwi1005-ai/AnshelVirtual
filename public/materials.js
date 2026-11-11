import * as THREE from 'three';

const palette = new Map();
const woodColors = {dark:'#503629',warm:'#b97342',medium:'#936044'};
const floorTextures = new Map();
const color = value => new THREE.Color(value);
const mix = (a,b,t) => color(a).lerp(color(b),t);

export function finish(value,roughness=.82,metalness=0) {
  const key=[value,roughness,metalness].join('|');
  if (!palette.has(key)) palette.set(key,new THREE.MeshStandardMaterial({color:value,roughness,metalness}));
  return palette.get(key);
}

export function emission(value,level=.35) {
  const key='emission|'+value+'|'+level;
  if (!palette.has(key)) palette.set(key,new THREE.MeshStandardMaterial({
    color:value,emissive:value,emissiveIntensity:level,roughness:.68,
  }));
  return palette.get(key);
}

export function objectMaterial(source,prop) {
  const name=source.name.toLowerCase();
  if (source.map) {
    const key='map|'+source.uuid;
    if (!palette.has(key)) {
      const material=new THREE.MeshStandardMaterial({
        map:source.map,color:source.color,side:source.side,roughness:.77,metalness:0,
      });
      if (prop.type==='rack' && name.includes('cyan')) {
        material.emissive.set('#30aabd');
        material.emissiveMap=source.map;
        material.emissiveIntensity=.36;
      }
      palette.set(key,material);
    }
    return palette.get(key);
  }
  if (name.startsWith('plant') || name.includes('leaf')) return finish(name.includes('dark')?'#28784d':'#3ca574',.88);
  if (name.includes('bark')) return finish('#745138');
  if (name.includes('glass')) return finish('#537c8d',.23,.15);
  if (name.startsWith('wood')) {
    if (['plant','succulent'].includes(prop.type)) return finish(name==='wooddark'?'#5e422b':'#bd7358');
    return finish(woodColors[prop.wood] ?? woodColors.medium,.56);
  }
  if (name.startsWith('carpet')) {
    if (name.includes('white')) return finish('#eee2cb');
    const tone=name.includes('darker') ? mix(prop.accent,'#1b2838',.55) : mix(prop.accent,'#1b2838',.20);
    return finish('#'+tone.getHexString(),.97);
  }
  if (['monitor','tv','laptop'].includes(prop.type) && name==='metaldark') return finish('#131e31',.38,.19);
  if (name.includes('metal')) return finish(name==='metal'?'#3c495a':'#252f40',.48,.26);
  if (/porcelain|white|ceramic/.test(name)) return finish('#e4dfd6',.26);
  return finish('#'+source.color.getHexString(),.69);
}

function surfacePattern(kind) {
  const canvas=document.createElement('canvas');
  canvas.width=canvas.height=256;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#dedede';
  ctx.fillRect(0,0,256,256);
  const rand=index=>((Math.sin(index*37.719+12.71)*43758.5453)%1+1)%1;
  if (kind==='oak') {
    for (let row=0;row<8;row++) {
      const y=row*32;
      ctx.fillStyle='rgba(0,0,0,'+(rand(row)*.13)+')';
      ctx.fillRect(0,y,256,32);
      ctx.fillStyle='#999';
      ctx.fillRect(0,y,256,1.4);
      ctx.fillRect(row%3*79+27,y,1.2,32);
      for (let stripe=0;stripe<6;stripe++) {
        const key=row*7+stripe;
        ctx.fillStyle='rgba(18,18,18,.09)';
        ctx.fillRect(rand(key)*230,y+4+stripe*4,16+rand(key+3)*78,.85);
      }
    }
  } else if (kind==='tile') {
    ctx.strokeStyle='#a8a8a8';
    ctx.lineWidth=2;
    for (let line=0;line<3;line++) {
      const n=line*128+1;
      ctx.beginPath();ctx.moveTo(n,0);ctx.lineTo(n,256);ctx.moveTo(0,n);ctx.lineTo(256,n);ctx.stroke();
    }
  } else {
    const contrast=kind==='grass'?.30:.14;
    for (let pixel=0;pixel<3700;pixel++) {
      ctx.fillStyle=pixel%2 ? 'rgba(0,0,0,'+contrast+')' : 'rgba(255,255,255,.27)';
      ctx.fillRect(rand(pixel)*256,rand(pixel+9000)*256,1.3,kind==='grass'?3:1);
    }
  }
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.anisotropy=4;
  return texture;
}

export function floorMaterial(kind,value) {
  const key='floor|'+kind+'|'+value;
  if (!palette.has(key)) {
    if (!floorTextures.has(kind)) floorTextures.set(kind,surfacePattern(kind));
    palette.set(key,new THREE.MeshStandardMaterial({
      color:value,map:floorTextures.get(kind),roughness:kind==='tile'?.74:.93,
    }));
  }
  return palette.get(key);
}

export function radialTexture(warm=false) {
  const canvas=document.createElement('canvas');
  canvas.width=canvas.height=64;
  const ctx=canvas.getContext('2d');
  const gradient=ctx.createRadialGradient(32,32,0,32,32,31);
  gradient.addColorStop(0,warm?'rgba(255,176,89,.62)':'rgba(7,12,25,.58)');
  gradient.addColorStop(.47,warm?'rgba(255,180,98,.29)':'rgba(7,12,25,.33)');
  gradient.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=gradient;
  ctx.fillRect(0,0,64,64);
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  return texture;
}
