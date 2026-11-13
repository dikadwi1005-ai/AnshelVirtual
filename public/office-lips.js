const closed={open:0,round:0,wide:0};
const shapes={
  a:{open:1,round:0,wide:0}, e:{open:.49,round:0,wide:.46},
  i:{open:.26,round:0,wide:.83}, o:{open:.72,round:.84,wide:0}, u:{open:.35,round:1,wide:0},
  consonant:{open:.19,round:0,wide:.08},
};

function sounds(text) {
  const letters=[...text.toLowerCase().matchAll(/[a-z]|[,.!?;:]|\s+/g)];
  return letters.map(({0:letter,index:character},index)=>{
    const vowel=shapes[letter];
    const silence=/[^a-z]/.test(letter);
    const stop=/[bmp]/.test(letter);
    const joined=(letter==='g' && letters[index-1]?.[0]==='n') || (letter==='y' && letters[index-1]?.[0]==='n');
    return {index:character,shape:vowel ?? (stop || silence?closed:shapes.consonant),
      weight:vowel?1.55:joined?.23:silence?(letter.trim()?1.65:.45):stop?.68:.66};
  });
}

export function createLipTimeline(text,duration) {
  const units=sounds(text);
  const weight=units.reduce((sum,unit)=>sum+unit.weight,0);
  let time=0, adjustment=0;
  for (const unit of units) {
    unit.start=time;
    time+=unit.weight/weight*duration;
    unit.end=time;
  }
  return {
    align(index,elapsed) {
      const unit=units.find(unit=>unit.index>=index);
      if (unit && Number.isFinite(elapsed)) adjustment=unit.start-elapsed;
    },
    pose(elapsed) {
      const cursor=Math.max(0,elapsed+adjustment);
      const unit=units.find(unit=>cursor<unit.end);
      if (!unit || elapsed<0) return closed;
      const pulse=Math.min(1,(cursor-unit.start)/.025,(unit.end-cursor)/.027);
      return {open:unit.shape.open*pulse,round:unit.shape.round*pulse,wide:unit.shape.wide*pulse};
    },
  };
}
