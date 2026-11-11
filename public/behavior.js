import { divisions } from './catalog.js';

const cycle = 110_000;
const alternatives = ['coffee','arcade','rest','talk','meeting','visit','read','tv','stroll','nap'];

export function employeePlans(now, phase, running, assigned = []) {
  return Object.fromEntries(divisions.map(person => {
    const active = running.find(item => item.division === person.id);
    const task = active ?? assigned.find(item => item.division === person.id);
    if (task) return [person.id,{
      activity:active ? 'work' : 'desk', task, executing:!!active, mood:active ? 'Fokus' : 'Siap', energy:80,
    }];
    const turn = Math.floor((now + person.index * 13_701) / cycle);
    const seed = Math.abs(Math.sin(turn * 12.9898 + person.index * 78.233));
    const prefersDesk = ['arrival','work','open','review'].includes(phase) && seed < .23;
    const activity = prefersDesk ? 'desk' : seed < .66 ? person.hobby : alternatives[(turn+person.index)%alternatives.length];
    return [person.id,{activity, task:null, executing:false, mood:activity === 'rest' ? 'Santai' : 'Netral', energy:65+Math.floor(seed*32)}];
  }));
}
