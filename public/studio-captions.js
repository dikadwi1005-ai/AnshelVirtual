export function narrationCues(input,duration) {
  const timestamp=value=>{
    const parts=value.split(':').map(Number);
    return parts.reduce((sum,part)=>60*sum+part,0)*1000;
  };
  const source=input.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').trim();
  if (!/^WEBVTT(?:\s|$)/.test(source)) throw new Error('Gunakan berkas subtitle WebVTT.');
  const blocks=source.split(/\n{2,}/).slice(1);
  const pattern=/^((?:\d{2}:)?[0-5]\d:[0-5]\d\.\d{3}) --> ((?:\d{2}:)?[0-5]\d:[0-5]\d\.\d{3})$/;
  const cues=[];
  for (const block of blocks) {
    const lines=block.split('\n');
    const index=lines.findIndex(line=>line.includes('-->'));
    const match=pattern.exec(lines[index] ?? '');
    const text=lines.slice(index+1).join(' ').replace(/\s+/g,' ').trim();
    if (!match || !text || text.length>240 || /[<>]/.test(text)) throw new Error('Cue WebVTT harus berisi teks biasa dan waktu yang valid.');
    const start=timestamp(match[1]),end=timestamp(match[2]);
    if (end<=start || end>duration+1 || start<(cues.at(-1)?.end ?? 0)) throw new Error('Waktu subtitle bertumpuk atau di luar durasi video.');
    cues.push({start,end,text});
  }
  if (!cues.length || cues.length>120) throw new Error('Berkas harus berisi 1–120 cue narasi.');
  return cues;
}
