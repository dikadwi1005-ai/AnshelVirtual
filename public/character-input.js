export function createCharacterStick(element,onMove) {
  const knob=element.firstElementChild;
  let pointer=null;

  function move(event) {
    const bounds=element.getBoundingClientRect();
    const radius=bounds.width*.28;
    if (!radius) return;
    const x=(event.clientX-bounds.left-bounds.width/2)/radius;
    const y=(event.clientY-bounds.top-bounds.height/2)/radius;
    const length=Math.hypot(x,y);
    const scale=Math.max(1,length);
    knob.style.transform='translate('+x/scale*radius+'px,'+y/scale*radius+'px)';
    const deadZone=.13;
    const strength=Math.max(0,(Math.min(1,length)-deadZone)/(1-deadZone));
    onMove(length?x/length*strength:0,length?-y/length*strength:0);
  }

  function reset() {
    const id=pointer;
    pointer=null;
    if (id!==null && element.hasPointerCapture(id)) element.releasePointerCapture(id);
    knob.style.transform='';
    delete element.dataset.active;
    onMove(0,0);
  }

  element.addEventListener('pointerdown',event=>{
    if (pointer!==null || event.button!==0) return;
    event.preventDefault();
    pointer=event.pointerId;
    element.setPointerCapture(pointer);
    element.dataset.active='';
    move(event);
  });
  element.addEventListener('pointermove',event=>{
    if (event.pointerId===pointer) move(event);
  });
  for (const type of ['pointerup','pointercancel','lostpointercapture']) element.addEventListener(type,event=>{
    if (event.pointerId===pointer) reset();
  });
  return {reset};
}
