const formats={webm:['video/webm;codecs=vp8,opus','video/webm'],mp4:['video/mp4']};

export function recordReplay(scene,{format,portrait,heading,subtitles,audio,start,end,onProgress}) {
  const mime=formats[format]?.find(type=>globalThis.MediaRecorder?.isTypeSupported(type));
  if (!mime) throw new Error('Encoder '+format.toUpperCase()+' belum tersedia di browser ini.');
  const canvas=document.createElement('canvas');
  [canvas.width,canvas.height]=portrait?[540,960]:[960,540];
  const context=canvas.getContext('2d');
  if (!context || !canvas.captureStream) throw new Error('Perekaman kanvas tidak tersedia.');
  const stream=canvas.captureStream(24);
  let sound, source, audioStream, recorder;
  let chunks=[], finished=false, timer;
  const clean=()=>{
    clearTimeout(timer);
    scene.replayOptions({onFrame:null,playing:false,exportAspect:null});
    audio?.pause();
    if (source && audioStream) source.disconnect(audioStream);
    void sound?.close().catch(()=>{});
    for (const track of stream.getTracks()) track.stop();
  };
  try {
    if (audio) {
      sound=new AudioContext();
      source=sound.createMediaElementSource(audio);
      audioStream=sound.createMediaStreamDestination();
      source.connect(audioStream);
      for (const track of audioStream.stream.getAudioTracks()) stream.addTrack(track);
    }
    recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:3000000});
  } catch (error) { clean(); throw error; }

  let complete, fail;
  const result=new Promise((resolve,reject)=>{ complete=resolve; fail=reject; });
  const cancel=(message='Ekspor dibatalkan.')=>{
    if (finished) return;
    finished=true;
    if (recorder.state!=='inactive') recorder.stop();
    clean();
    fail(new Error(message));
  };
  recorder.ondataavailable=event=>{ if (event.data.size) chunks.push(event.data); };
  recorder.onerror=()=>cancel('Encoder gagal merekam video.');
  recorder.onstop=()=>{
    if (finished) return;
    finished=true;
    const output=new Blob(chunks,{type:recorder.mimeType});
    chunks=[];
    clean();
    if (output.size) complete(output);
    else fail(new Error('Encoder tidak menghasilkan video.'));
  };

  function caption(text,y) {
    if (!text) return;
    const max=canvas.width-64;
    context.font='600 24px sans-serif';
    const lines=[''];
    for (const word of text.split(/\s+/)) {
      const i=lines.length-1, next=(lines[i]+' '+word).trim();
      if (lines[i] && context.measureText(next).width>max) lines.push(word);
      else lines[i]=next;
    }
    for (const [index,line] of lines.slice(0,4).entries()) {
      const baseline=y+index*31;
      context.fillStyle='#172534ed';
      context.fillRect(20,baseline-26,canvas.width-40,31);
      context.fillStyle='#fff';
      context.fillText(line,32,baseline,max);
    }
  }
  async function begin() {
    try {
      if (sound) {
        await sound.resume();
        await audio.play();
      }
      if (finished) return;
      recorder.start(250);
      timer=setTimeout(()=>cancel('Ekspor melewati batas waktu. Pastikan tab tetap aktif.'),end-start+15000);
      scene.replayOptions({time:start,end,speed:1,playing:true,exportAspect:canvas.width/canvas.height,onFrame:(world,turn,at)=>{
        try {
          context.fillStyle='#172534';
          context.fillRect(0,0,canvas.width,canvas.height);
          context.drawImage(world,0,0,canvas.width,canvas.height);
          caption(heading,52);
          if (subtitles) caption(turn?.text,canvas.height-127);
          onProgress(Math.min(100,Math.round((at-start)/(end-start)*100)));
          if (at>=end && recorder.state==='recording') recorder.stop();
        } catch { cancel('Frame 3D tidak dapat direkam.'); }
      }});
    } catch { cancel('Perekaman atau narasi tidak dapat dimulai.'); }
  }
  void begin();
  return {result,cancel};
}
