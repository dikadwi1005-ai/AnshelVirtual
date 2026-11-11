import { copyFile, cp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const source = name => resolve('node_modules',name);
const target = name => resolve('public',name);
await mkdir(target('lib/three/build'),{recursive:true});
await copyFile(source('three/build/three.module.js'),target('lib/three/build/three.module.js'));
await cp(source('three/examples/jsm'),target('lib/three/examples/jsm'),{recursive:true,force:true});
for (const [packageName,folder,file] of [
  ['dm-sans','dm','dm-sans-latin-wght-normal.woff2'],
  ['space-grotesk','space','space-grotesk-latin-wght-normal.woff2'],
]) {
  await mkdir(target('fonts/'+folder+'/files'),{recursive:true});
  await copyFile(source('@fontsource-variable/'+packageName+'/files/'+file),
    target('fonts/'+folder+'/files/'+file));
}
console.log('Three.js dan font siap disajikan sebagai aset statis di Vercel.');
