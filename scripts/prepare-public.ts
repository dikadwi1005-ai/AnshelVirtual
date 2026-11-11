import { copyFile, cp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';

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
await build({
  entryPoints:[target('scene.js')],
  outfile:target('scene.bundle.js'),
  bundle:true,
  format:'esm',
  platform:'browser',
  target:['chrome100','safari15'],
  minify:true,
  legalComments:'none',
});
console.log('Bundle kantor 3D, Three.js, dan font siap disajikan di Vercel.');
