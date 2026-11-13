function createFootstep(context) {
  const duration=.095;
  const buffer=context.createBuffer(1,Math.ceil(context.sampleRate*duration),context.sampleRate);
  const samples=buffer.getChannelData(0);
  let low=0, random=41;
  for (let index=0;index<samples.length;index++) {
    const time=index/context.sampleRate;
    random=(Math.imul(random,1664525)+1013904223)>>>0;
    low+=.24*((random/2**31-1)-low);
    const attack=Math.min(1,time/.007);
    samples[index]=attack*Math.exp(-time*42)*(low*.56+Math.sin(time*2*Math.PI*88)*.20);
  }
  return buffer;
}

export function createOfficeSpatialAudio(browser=globalThis) {
  let context, buffer, enabled=false, level, tracking=false;
  const playing=new Set();
  let distanceByActor=new WeakMap();

  function clear() {
    if (!tracking) return;
    tracking=false;
    for (const sound of playing) sound.stop();
    playing.clear();
    distanceByActor=new WeakMap();
  }

  return {
    enable(value) {
      enabled=value;
      if (!value) clear();
    },
    async unlock() {
      const Audio=browser.AudioContext ?? browser.webkitAudioContext;
      if (!enabled || !Audio) return;
      try {
        if (!context) {
          context=new Audio();
          level=context.createGain();
          level.gain.value=.27;
          level.connect(context.destination);
          buffer=createFootstep(context);
        }
        if (context.state==='suspended') await context.resume();
      } catch { /* Subtitle and animation remain available. */ }
    },
    update(actors,focus,camera) {
      if (!enabled || !buffer || context?.state!=='running') return;
      tracking=true;
      const listener=context.listener;
      const dx=focus.x-camera.x, dz=focus.z-camera.z;
      const length=Math.hypot(dx,dz) || 1;
      listener.setPosition(focus.x,focus.y,focus.z);
      listener.setOrientation(dx/length,0,dz/length,0,1,0);
      for (const actor of actors) {
        const {x,z}=actor.root.position;
        const range=Math.hypot(x-focus.x,z-focus.z);
        const last=distanceByActor.get(actor);
        if (actor.animation!=='walk' || !last || range>8) {
          distanceByActor.set(actor,{x,z,distance:0});
          continue;
        }
        last.distance+=Math.hypot(x-last.x,z-last.z);
        last.x=x;
        last.z=z;
        if (last.distance<.69 || playing.size>=4) continue;
        last.distance=0;
        const source=context.createBufferSource(), panner=context.createPanner();
        source.buffer=buffer;
        source.playbackRate.value=.92+(actor.person.index%5)*.04;
        panner.distanceModel='linear';
        panner.refDistance=1;
        panner.maxDistance=8;
        panner.setPosition(x,.05,z);
        source.connect(panner).connect(level);
        source.onended=()=>{
          playing.delete(source);
          source.disconnect();
          panner.disconnect();
        };
        playing.add(source);
        source.start();
      }
    },
    clear,
    dispose() {
      clear();
      if (context) void context.close().catch(()=>{});
    },
  };
}
