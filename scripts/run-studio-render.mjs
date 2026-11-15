import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { narrationCues } from '../public/studio-captions.js';
import { isolatedRenderQueue, privateRenderMedia } from '../server/studio-render-jobs.ts';

const [database,mediaRoot]=process.argv.slice(2);
if (!database || !mediaRoot) throw new Error('Specify an isolated SQLite queue and private media directory.');
const queue=isolatedRenderQueue(database);
const media=await privateRenderMedia(mediaRoot);
const job=queue.claim();
const types={'.js':'text/javascript','.glb':'model/gltf-binary','.png':'image/png','.jpg':'image/jpeg'};

async function render(job) {
  const root=resolve('.vercel-public');
  const buildHash=createHash('sha256').update(await readFile(join(root,'scene.js'))).digest('hex');
  if (job.manifest.sceneBuild!==buildHash) throw new Error('Scene build differs from the manifest.');
  const sandbox=await mkdtemp(join(tmpdir(),'anshel-render-'));
  const server=createServer(async (request,response)=>{
    try {
      const pathname=new URL(request.url,'http://127.0.0.1').pathname;
      if (request.method!=='GET') { response.writeHead(405).end(); return; }
      if (pathname==='/') {
        response.writeHead(200,{'Content-Type':'text/html'}).end(
          '<meta charset="utf-8"><style>body{margin:0}#view{width:100vw;height:100vh}</style><div id="view"><div id="labels"></div></div>');
        return;
      }
      const file=resolve(root,'.'+decodeURIComponent(pathname));
      if (!file.startsWith(root+sep) || !Object.hasOwn(types,extname(file))) { response.writeHead(404).end(); return; }
      const bytes=await readFile(file);
      response.writeHead(200,{'Content-Type':types[extname(file)]}).end(bytes);
    } catch { response.writeHead(404).end(); }
  });
  let browser, encoder, timeout, hardDeadline;
  try {
    server.listen(0,'127.0.0.1');
    await once(server,'listening');
    const origin='http://127.0.0.1:'+server.address().port;
    const {chromium}=await import(process.env.ANSHEL_PLAYWRIGHT_MODULE ?? 'playwright');
    browser=await chromium.launch({executablePath:process.env.ANSHEL_CHROME_PATH,headless:true,args:['--enable-unsafe-swiftshader']});
    const {width,height,fps}=job.manifest.output;
    const page=await browser.newPage({viewport:{width,height},serviceWorkers:'block'});
    let pageError;
    page.on('pageerror',error=>{
      pageError=error;
      void page.close().catch(()=>{});
    });
    await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    await page.goto(origin);
    await page.evaluate(async ()=>{
      const {officeScene}=await import('/scene.js');
      const view=document.getElementById('view'), labels=document.getElementById('labels');
      const scene=officeScene(view,labels,()=>{},()=>{},()=>{},null,{low:true});
      scene.state({now:Date.UTC(2026,0,5,2),phase:'work',people:{},tasks:[],audit:[]});
      await scene.load();
      const frame=document.createElement('canvas');
      frame.width=1080;
      frame.height=1920;
      const context=frame.getContext('2d');
      window.renderShot=async frames=>{
        scene.stopReplay();
        if (!scene.startReplay(frames)) throw new Error('Replay could not be loaded.');
      };
      window.renderFrame=(time,shot,text)=>new Promise(resolve=>{
        scene.replayOptions({time,playing:false,exportSize:[1080,1920],shot,onFrame(canvas){
          scene.replayOptions({onFrame:null});
          context.drawImage(canvas,0,0);
          if (text) {
            context.fillStyle='#172534ed';
            context.fillRect(40,1580,1000,76);
            context.fillStyle='#fff';
            context.font='600 38px sans-serif';
            context.fillText(text,60,1630,960);
          }
          resolve(frame.toDataURL('image/jpeg',.91).split(',')[1]);
        }});
      });
    });
    const args=['-v','error','-y','-f','image2pipe','-framerate',String(fps),'-vcodec','mjpeg','-i','pipe:0'];
    const sources=[];
    for (const name of ['narration','music']) if (job.manifest[name]) {
      const path=join(sandbox,name+'.wav');
      const data=await media.get(job.manifest[name]);
      if (data.toString('ascii',0,4)!=='RIFF' || data.toString('ascii',8,12)!=='WAVE') throw new Error('Audio must be WAV.');
      await writeFile(path,data,{mode:0o600});
      args.push('-f','wav','-i',path);
      sources.push(name);
    }
    if (sources.length===2) args.push('-filter_complex','[1:a]volume=0.9[a];[2:a]volume=0.24[b];[a][b]amix=inputs=2:normalize=0,apad[out]',
      '-map','0:v','-map','[out]');
    else if (sources.length) args.push('-map','0:v','-map','1:a','-af','apad');
    const cues=job.manifest.captions?narrationCues((await media.get(job.manifest.captions)).toString(),job.manifest.duration):[];
    const output=join(sandbox,'render.mp4');
    const framesTotal=job.manifest.shots.reduce((total,shot)=>total+Math.ceil((shot.end-shot.start)*fps/1000),0);
    args.push('-c:v','libx264','-threads','2','-preset','fast','-pix_fmt','yuv420p','-crf','22',
      '-maxrate','1800k','-bufsize','1800k','-c:a','aac','-t',String(framesTotal/fps),'-movflags','faststart',output);
    encoder=spawn(process.env.ANSHEL_FFMPEG_PATH ?? 'ffmpeg',args,{stdio:['pipe','ignore','inherit'],windowsHide:true});
    const closed=once(encoder,'close');
    closed.catch(()=>{});
    encoder.stdin.on('error',()=>{});
    const clear=()=>queue.pulse(job.id,job.lease);
    timeout=setInterval(()=>{ if (!clear()) void browser.close().catch(()=>{}); },5000);
    hardDeadline=setTimeout(()=>{ void browser.close().catch(()=>{}); encoder.kill(); },15*60_000);
    let count=0;
    for (const {replay,camera,start,end} of job.manifest.shots) {
      const frames=JSON.parse((await media.get(replay)).toString());
      if (!Array.isArray(frames) || frames.length<2 || frames.length>900 ||
          frames.some((frame,i)=>!Number.isFinite(frame?.at) || (i>0 && frame.at<=frames[i-1].at) ||
            !Array.isArray(frame.actors) || frame.actors.length!==12) || frames.at(-1).at-frames[0].at<end)
        throw new Error('Replay does not contain the requested interval.');
      await page.evaluate(frames=>window.renderShot(frames),frames);
      const shot={id:camera,start:frames[0].at+start,end:frames[0].at+end};
      for (let time=shot.start;time<shot.end;time+=1000/fps) {
        if (count%24===0 && !queue.pulse(job.id,job.lease,Math.floor(99*count/framesTotal)))
          throw new Error('Render lease ended.');
        const at=count/fps*1000;
        const text=cues.find(cue=>cue.start<=at && at<cue.end)?.text;
        const data=await page.evaluate(({time,shot,text})=>window.renderFrame(time,shot,text),{time,shot,text})
          .catch(error=>{throw pageError ?? error;});
        if (encoder.exitCode!==null) throw new Error('FFmpeg stopped before all frames arrived.');
        if (!encoder.stdin.write(Buffer.from(data,'base64'))) {
          await Promise.race([once(encoder.stdin,'drain'),closed.then(()=>{throw new Error('FFmpeg stopped.');})]);
        }
        count++;
      }
    }
    encoder.stdin.end();
    const [exit]=await closed;
    if (exit!==0) throw new Error('FFmpeg could not encode the episode.');
    const result=await media.put(await readFile(output));
    if (!queue.finish(job.id,job.lease,result)) throw new Error('Render lease ended before publishing the private artifact.');
    console.log(JSON.stringify({id:job.id,result,frames:count}));
  } finally {
    clearInterval(timeout);
    clearTimeout(hardDeadline);
    if (encoder?.exitCode===null) encoder.kill();
    await browser?.close().catch(()=>{});
    await new Promise(resolve=>server.close(resolve));
    await rm(sandbox,{recursive:true,force:true});
  }
}

try {
  if (job) await render(job);
} catch (error) {
  if (job) queue.fail(job.id,job.lease);
  console.error(error.message);
  process.exitCode=1;
} finally { queue.close(); }
