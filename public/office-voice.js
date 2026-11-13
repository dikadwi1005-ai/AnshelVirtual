export function createOfficeVoice(browser=globalThis,{start=()=>{},boundary=()=>{},end=()=>{}}={}) {
  const engine=browser.speechSynthesis;
  const Utterance=browser.SpeechSynthesisUtterance;
  let enabled=false, current=null, utterance=null;

  function stop() {
    if (!utterance) return;
    utterance=null;
    engine.cancel();
  }

  return {
    enable(value) {
      enabled=Boolean(value);
      if (!enabled) stop();
    },
    show(turn,volume=1) {
      if (turn===current) return;
      current=turn;
      stop();
      if (!turn || !enabled || !engine || !Utterance || volume<=0) return;
      const voice=engine.getVoices().find(voice=>voice.localService && /^id(?:[-_]|$)/i.test(voice.lang));
      if (!voice) return;
      const speech=new Utterance(turn.text);
      speech.voice=voice;
      speech.lang=voice.lang;
      speech.rate=1.06;
      speech.pitch=.90+turn.speaker.person.index%6*.05;
      speech.volume=volume;
      speech.onstart=()=>{ if (utterance===speech) start(turn); };
      speech.onboundary=event=>{
        if (utterance===speech && event.name==='word') boundary(turn,event.charIndex);
      };
      speech.onend=()=>{
        if (utterance!==speech) return;
        utterance=null;
        end(turn);
      };
      speech.onerror=()=>{ if (utterance===speech) utterance=null; };
      try { utterance=speech; engine.speak(speech); }
      catch { utterance=null; }
    },
    stop,
  };
}
