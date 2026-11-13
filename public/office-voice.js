export function createOfficeVoice(browser=globalThis) {
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
    show(turn) {
      if (turn===current) return;
      current=turn;
      stop();
      if (!turn || !enabled || !engine || !Utterance) return;
      const voice=engine.getVoices().find(voice=>voice.localService && /^id(?:[-_]|$)/i.test(voice.lang));
      if (!voice) return;
      const speech=new Utterance(turn.text);
      speech.voice=voice;
      speech.lang=voice.lang;
      speech.rate=1.06;
      speech.pitch=.90+turn.speaker.person.index%6*.05;
      speech.onend=speech.onerror=()=>{ if (utterance===speech) utterance=null; };
      try { utterance=speech; engine.speak(speech); }
      catch { utterance=null; }
    },
    stop,
  };
}
