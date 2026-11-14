import { divisions } from '../public/catalog.js';
import { Fault } from './store.ts';

export const meetingKey='studio_meetings_v1';
const employeeIds=new Set(divisions.map(person=>person.id));
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

export function changeMeeting(current,input,now) {
  const state=current ?? {revision:0,active:null,history:[]};
  if (input===undefined) return state;
  if (input.revision!==state.revision) throw new Fault(409,'Rapat telah berubah. Buka kembali panel Rapat.');
  const active=state.active;
  if (input.action==='start') {
    const {id,agenda,participants}=input;
    if (active) throw new Fault(409,'Rapat masih aktif.');
    if (typeof id!=='string' || !uuid.test(id) || typeof agenda!=='string' || !agenda.trim() || agenda.length>120 ||
      !Array.isArray(participants) || participants.length<2 || participants.length>4 ||
      new Set(participants).size!==participants.length || !participants.every(id=>employeeIds.has(id)))
      throw new Fault(400,'Agenda atau peserta rapat tidak valid.');
    return {...state,revision:state.revision+1,active:{id,agenda:agenda.trim(),participants,started:now,notes:'',decisions:'',attended:[]}};
  }
  if (!active || active.id!==input.id) throw new Fault(409,'Rapat sudah tidak aktif.');
  const {notes,decisions,attended}=input;
  if (!['save','close'].includes(input.action) || typeof notes!=='string' || notes.length>2000 ||
    typeof decisions!=='string' || decisions.length>1000 || !Array.isArray(attended) || attended.length>4 ||
    !attended.every(id=>active.participants.includes(id))) throw new Fault(400,'Catatan rapat tidak valid.');
  const saved={...active,notes,decisions,attended:[...new Set([...active.attended,...attended])]};
  return input.action==='save'?{...state,revision:state.revision+1,active:saved}:
    {revision:state.revision+1,active:null,history:[...state.history,{...saved,closed:now}].slice(-30)};
}
