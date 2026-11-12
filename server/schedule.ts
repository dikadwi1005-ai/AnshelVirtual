import { timezone } from '../public/catalog.js';

export const defaults = {
  arrival:'08:45', open:'09:00', briefingEnd:'09:15', lunch:'12:00',
  lunchEnd:'13:00', review:'16:30', close:'17:00', days:[1,2,3,4,5], holidays:[],
};

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone:timezone, hourCycle:'h23', year:'numeric', month:'2-digit', day:'2-digit',
  weekday:'short', hour:'2-digit', minute:'2-digit',
});

export function phase(at = new Date(), schedule = defaults, mode = 'auto') {
  if (mode !== 'auto') return mode;
  const parts = Object.fromEntries(formatter.formatToParts(at).map(part => [part.type,part.value]));
  const weekday = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(parts.weekday);
  const date = [parts.year,parts.month,parts.day].join('-');
  const time = [parts.hour,parts.minute].join(':');
  if (!schedule.days.includes(weekday) || schedule.holidays.includes(date)) return 'closed';
  if (time < schedule.arrival || time >= schedule.close) return 'closed';
  if (time < schedule.open) return 'arrival';
  if (time < schedule.briefingEnd) return 'briefing';
  if (time < schedule.lunch) return 'work';
  if (time < schedule.lunchEnd) return 'lunch';
  if (time < schedule.review) return 'work';
  return 'review';
}

// Counts one scheduled Gemini claim per task, in the office's WIB timezone.
export const scheduledDraftDailyLimit = 3;
export function scheduledDraftDay(at = new Date()) {
  const parts = Object.fromEntries(formatter.formatToParts(at).map(part => [part.type,part.value]));
  return [parts.year,parts.month,parts.day].join('-');
}

export function validSchedule(value) {
  const keys = ['arrival','open','briefingEnd','lunch','lunchEnd','review','close'];
  return value && keys.every((key,i) => typeof value[key] === 'string' &&
    /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value[key]) && (!i || value[key] > value[keys[i-1]])) &&
    Array.isArray(value.days) && value.days.length <= 7 &&
    value.days.every(day => Number.isInteger(day) && day >= 0 && day <= 6) &&
    Array.isArray(value.holidays) && value.holidays.length <= 366 &&
    value.holidays.every(date => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date));
}

export function canDispatch(current: string) {
  return ['open','overtime','work','review'].includes(current);
}
