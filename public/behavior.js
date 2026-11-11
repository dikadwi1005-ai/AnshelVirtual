import { divisions } from './catalog.js';

const cycle = 70_000;

export function employeePlans(now, phase, running) {
  return Object.fromEntries(divisions.map(person => {
    const task = running.find(item => item.division === person.id);
    if (task) return [person.id,{activity:'work', task, mood:'Fokus', energy:80}];
    const turn = Math.floor((now + person.index * 13_701) / cycle);
    const seed = Math.abs(Math.sin(turn * 12.9898 + person.index * 78.233));
    const prefersDesk = ['arrival','work','open','review'].includes(phase) && seed < .42;
    const alternatives = [
      ['coffee','arcade','rest','talk'],
      ['arcade','rest','talk'],
      ['rest','talk'],
    ][person.floor];
    const activity = prefersDesk ? 'desk' : seed < .72 && alternatives.includes(person.hobby) ?
      person.hobby : alternatives[(turn+person.index)%alternatives.length];
    return [person.id,{activity, task:null, mood:activity === 'rest' ? 'Santai' : 'Netral', energy:65+Math.floor(seed*32)}];
  }));
}

export function routeBetween(from, to, rows, lane) {
  if (from.room === to.room && Math.abs(from.x-to.x) < .15) return [[to.x,to.z]];
  const corridor = [[from.x,lane], [to.x,lane], [to.x,to.z]];
  return from.room ? [[from.x,rows[from.room]],...corridor] : corridor;
}
