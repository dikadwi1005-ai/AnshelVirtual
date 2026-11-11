export const displayModes={
  idle:'Siap', offline:'Worker offline', waiting:'Menunggu', blocked:'Terhambat', running:'Berjalan',
};

export function displayState(office,division) {
  const plan=office?.people?.[division];
  const task=plan?.task;
  if (!task) return {mode:'idle',kind:null};
  if (plan.executing && task.status==='running') return {mode:'running',kind:task.kind ?? null};
  if (task.status==='blocked') return {mode:'blocked',kind:task.kind ?? null};
  const ready=office.worker && office.capabilities?.includes(task.kind);
  return {mode:ready?'waiting':'offline',kind:task.kind ?? null};
}

export function workstationTask(office,division) {
  const assigned=office.people?.[division]?.task;
  const tasks=office.tasks ?? [];
  if (assigned) return tasks.find(task=>task.id===assigned.id) ?? assigned;
  return tasks.find(task=>task.division===division) ?? null;
}
