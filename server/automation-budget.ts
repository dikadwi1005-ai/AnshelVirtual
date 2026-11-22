import { AutomationFault, wibDate } from './automation-domain.ts';

// Reservations are persisted in the existing transaction before every external request.
// Failed requests still consume a reservation; provider billing may count those requests.
export function reserveSourceBudget(state,input,now) {
  if (!['brave','google-alerts','freelancer','skyscanner'].includes(input.provider))
    throw new AutomationFault('Provider kuota tidak dikenal.');
  const {daily,monthly,gapMinutes,cost=1}=input;
  if (![daily,monthly,gapMinutes,cost].every(Number.isSafeInteger) || daily<0 || monthly<0 ||
      daily>10000 || monthly>100000 || gapMinutes<1 || gapMinutes>10080 || cost<1 || cost>10)
    throw new AutomationFault('Batas kuota sumber tidak valid.');
  state.sourceBudgets ??= {};
  const day=wibDate(now),month=day.slice(0,7),prior=state.sourceBudgets[input.provider];
  const row={month,day,monthUsed:prior?.month===month?prior.monthUsed:0,
    dayUsed:prior?.day===day?prior.dayUsed:0,lastAt:prior?.lastAt ?? null};
  const nextDay=Date.parse(day+'T00:00:00+07:00')+86400000;
  const [year,mon]=month.split('-').map(Number);
  const nextMonth=Date.UTC(year,mon,1)-7*3600000;
  const daysLeft=Math.ceil((nextMonth-Date.parse(day+'T00:00:00+07:00'))/86400000);
  // Pace whole reservations. A single day keeps the same allowance after each request.
  const remainingAtDayStart=Math.max(0,monthly-row.monthUsed+row.dayUsed);
  const reservations=Math.ceil(Math.floor(remainingAtDayStart/cost)/daysLeft);
  const fairDaily=Math.min(daily,reservations*cost);
  let reason=null,nextAt=now;
  if (row.monthUsed+cost>monthly) {reason='Kuota bulanan habis atau belum disetujui.';nextAt=nextMonth;}
  else if (row.dayUsed+cost>fairDaily) {reason='Jatah harian ditunda agar kuota bertahan sampai akhir bulan.';nextAt=nextDay;}
  else if (row.lastAt!==null && now<row.lastAt+gapMinutes*60000) {
    reason='Menunggu interval sumber.';nextAt=row.lastAt+gapMinutes*60000;
  }
  if (!reason) {row.dayUsed+=cost;row.monthUsed+=cost;row.lastAt=now;}
  state.sourceBudgets[input.provider]={...row,dailyLimit:daily,monthlyLimit:monthly,nextAt};
  return {allowed:!reason,reason,nextAt,dayUsed:row.dayUsed,monthUsed:row.monthUsed};
}
