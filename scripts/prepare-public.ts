import { copyFile, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root=fileURLToPath(new URL('../',import.meta.url));
const source=resolve(root,'public');
const dependencies=name=>resolve(root,'node_modules',name);
const output=resolve(root,'.vercel-public');
const target=name=>resolve(output,name);

// Only regenerate the dedicated build output. Local source and assets stay intact.
await rm(output,{recursive:true,force:true});
const oldBuild=new Set(['assets','lib','fonts','scene.bundle.js']);
await cp(source,output,{recursive:true,filter:file=>!oldBuild.has(relative(source,file).split(sep)[0])});

// Cached releases can still import Three.js through the old import map.
await mkdir(target('lib/three/build'),{recursive:true});
for (const file of ['three.module.js','three.core.js']) {
  await copyFile(dependencies('three/build/'+file),target('lib/three/build/'+file));
}
await cp(dependencies('three/examples/jsm'),target('lib/three/examples/jsm'),{recursive:true});
for (const [packageName,folder,file] of [
  ['dm-sans','dm','dm-sans-latin-wght-normal.woff2'],
  ['space-grotesk','space','space-grotesk-latin-wght-normal.woff2'],
]) {
  await mkdir(target('fonts/'+folder+'/files'),{recursive:true});
  await copyFile(dependencies('@fontsource-variable/'+packageName+'/files/'+file),target('fonts/'+folder+'/files/'+file));
}

const {metafile}=await build({
  absWorkingDir:root,
  entryPoints:['public/app.js','public/scene.js'],
  outdir:target('assets'),
  entryNames:'[name]-[hash]',
  chunkNames:'chunk-[hash]',
  bundle:true,
  splitting:true,
  format:'esm',
  platform:'browser',
  target:['chrome100','safari15'],
  minify:true,
  metafile:true,
  legalComments:'eof',
});
function entryUrl(name) {
  const entry=Object.entries(metafile.outputs).find(([,info])=>info.entryPoint==='public/'+name+'.js');
  if (!entry) throw new Error('Entry build tidak ditemukan: '+name);
  return '/'+relative(output,resolve(root,entry[0])).split(sep).join('/');
}
const app=entryUrl('app'), scene=entryUrl('scene');
const html=await readFile(resolve(source,'index.html'),'utf8');
const script='<script type="module" src="/app.js"></script>';
if (!html.includes(script)) throw new Error('Entry aplikasi tidak ditemukan di index.html');
await writeFile(target('index.html'),html
  .replace(/^[ \t]*<script type="importmap">[^\n]*\r?\n/m,'')
  .replace(script,`<script type="module" src="${app}"></script>`));
await writeFile(target('app.js'),`import '${app}';\n`);
for (const name of ['scene.js','scene.bundle.js']) {
  await writeFile(target(name),`export {officeScene} from '${scene}';\n`);
}
console.log('Build 3D siap disajikan di .vercel-public.');
