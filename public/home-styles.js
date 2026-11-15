// Each employee keeps a stable exterior identity independently of house
// ordering, geometry variants and the saved city parcel ID.
// These colors decorate existing local meshes; no external model/license cost.
const styles=Object.freeze({
  management:{facade:'#e9d8c8',trim:'#996055',accent:'#5d7977',mark:1},
  operations:{facade:'#d3dce1',trim:'#506f83',accent:'#df9559',mark:2},
  administration:{facade:'#f0e5cc',trim:'#7d8770',accent:'#b96d63',mark:3},
  hr:{facade:'#e6d5d7',trim:'#976f82',accent:'#6a8980',mark:1},
  development:{facade:'#dce2d2',trim:'#64816c',accent:'#a97959',mark:2},
  creative:{facade:'#dfd8ee',trim:'#84659a',accent:'#c69d63',mark:3},
  video:{facade:'#e4d4c5',trim:'#80695b',accent:'#638a9b',mark:1},
  social:{facade:'#d9e4e2',trim:'#568d87',accent:'#b77b99',mark:2},
  research:{facade:'#d3dcea',trim:'#60799e',accent:'#c18e66',mark:3},
  marketing:{facade:'#f0dfc3',trim:'#aa8b56',accent:'#6e8b87',mark:1},
  qa:{facade:'#e2d9e9',trim:'#8d709c',accent:'#779b80',mark:2},
  finance:{facade:'#d3e6da',trim:'#648e7b',accent:'#b98b67',mark:3},
});
export const homeVisualStyles=styles;

export function homeVisualStyle(division) {
  const style=styles[division];
  if(!style)throw new Error('Unknown employee home style: '+String(division));
  return style;
}

// Pure facade placement plan, in home-local coordinates. Details sit outside
// the wall and above the threshold; the door/walkway and collision map stay
// exactly as before. The individual bar count adds identity even in grayscale.
export function homeFacadeDetails(home) {
  const style=homeVisualStyle(home.person.id);
  const front=home.depth/2+.39;
  const left=home.doorOffset-.86, right=home.doorOffset+.86;
  const details=[
    {color:style.trim,u:left-.24,y:1.32,v:front,w:.12,h:1.7,d:.09},
    {color:style.trim,u:right+.24,y:1.32,v:front,w:.12,h:1.7,d:.09},
    {color:style.accent,u:home.doorOffset,y:2.46,v:front+.02,w:1.96,h:.10,d:.10},
  ];
  for(let i=0;i<style.mark;i++) {
    details.push({color:style.accent,u:-home.width*.39+i*.19,y:2.48,
      v:front,w:.12,h:.23,d:.10});
  }
  return details;
}
