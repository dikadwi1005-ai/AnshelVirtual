import { createHash } from 'node:crypto';

const dayMs = 86400000;
const providers = { 'google-flights': 'Google Flights', traveloka: 'Traveloka' };
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const providerDomain = { 'google-flights': 'google.com', traveloka: 'traveloka.com' };
const datePattern = /\b(20\d{2}-\d{2}-\d{2})\b/;

function bodyParts(part, depth = 0) {
  if (!part || depth > 5 || part.filename) return [];
  if (part.mimeType?.startsWith('multipart/') && Array.isArray(part.parts)) {
    return part.parts.slice(0, 12).flatMap(child => bodyParts(child, depth + 1));
  }
  const data = part.body?.data;
  if (!['text/plain', 'text/html'].includes(part.mimeType) || typeof data !== 'string' ||
      !/^[\w=-]{1,80000}$/.test(data)) return [];
  return [{ type: part.mimeType, text: Buffer.from(data, 'base64url').toString('utf8') }];
}

function officialLink(raw, provider) {
  const url = URL.parse(raw?.replaceAll('&amp;', '&') ?? '');
  if (!url || url.protocol !== 'https:' || url.port || url.username || url.password) return null;
  if (provider === 'google-flights') {
    if (url.hostname !== 'www.google.com' || !/^\/travel\/flights(?:\/|$)/.test(url.pathname)) return null;
  } else if (!['traveloka.com', 'www.traveloka.com'].includes(url.hostname) ||
      !/\/(?:flights|flight|tiket-pesawat)(?:\/|$)/i.test(url.pathname)) return null;
  url.search = '';
  url.hash = '';
  return url.href;
}

function amount(value) {
  const match = /^(Rp|IDR|USD|US\$|SGD|EUR)\s*(\d[\d.,]*)$/i.exec(value?.trim() ?? '');
  if (!match) return null;
  const currency = /^rp$/i.test(match[1]) ? 'IDR' : /^us\$/i.test(match[1]) ? 'USD' : match[1].toUpperCase();
  const raw = match[2];
  const rupiah = currency === 'IDR';
  if (!(rupiah ? /^\d+(?:,\d{2})?$|^\d{1,3}(?:\.\d{3})+(?:,\d{2})?$/ :
    /^\d+(?:\.\d{1,2})?$|^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/).test(raw)) return null;
  const total = Number(rupiah ? raw.replaceAll('.', '').replace(',', '.') : raw.replaceAll(',', ''));
  return total > 0 && total < 1e10 ? { currency, total } : null;
}

export function parseGmailFlightAlert(message, now) {
  const headers = message?.payload?.headers;
  const receivedAt = Number(message?.internalDate);
  if (!Array.isArray(headers) || !/^[a-f0-9]{8,64}$/i.test(message?.id ?? '') ||
      !Number.isSafeInteger(receivedAt) || receivedAt > now || receivedAt <= now - 7 * dayMs) return { status: 'ignored' };
  const values = name => headers.filter(header => header?.name?.toLowerCase() === name).map(header => header.value);
  if (values('from').length !== 1 || values('subject').length !== 1 ||
      message.labelIds?.some(label => ['SPAM', 'TRASH', 'SENT', 'DRAFT'].includes(label))) return { status: 'ignored' };
  const from = /(?:^|<)([\w.+-]+@([\w.-]+))>?\s*$/.exec(values('from')[0] ?? '');
  const domain = from?.[2]?.toLowerCase();
  const subject = String(values('subject')[0]).slice(0, 500);
  const provider = domain === 'google.com' && /google.?flights|price track|tracked flight|harga penerbangan/i.test(subject)
    ? 'google-flights' : (domain === 'traveloka.com' || domain?.endsWith('.traveloka.com')) &&
      /price alert|notifikasi harga|pantauan harga/i.test(subject) ? 'traveloka' : null;
  if (!provider) return { status: 'ignored' };

  // Use the first receiver authentication result. Lower headers can be supplied by the sender.
  const auth = String(values('authentication-results')[0] ?? '').replace(/\r?\n[ \t]+/g, ' ');
  const signature = auth.split(';').slice(1).find(item => /^\s*dkim=pass\b/i.test(item) &&
    new RegExp('\\b(?:header\\.d=|header\\.i=[\\w.+-]*@)(?:[\\w-]+\\.)*' +
      providerDomain[provider].replace('.', '\\.') + '(?=\\s|$)', 'i').test(item));
  if (!/^\s*mx\.google\.com\s*;/i.test(auth) || !signature ||
      !auth.split(';').some(item => /^\s*dmarc=pass\b/i.test(item) &&
        item.match(/\bheader\.from=([\w.-]+)/i)?.[1]?.toLowerCase() === domain)) {
    return { status: 'sender_unverified' };
  }

  const key = digest([provider, message.id]);
  const parts = bodyParts(message.payload);
  const plain = parts.find(part => part.type === 'text/plain')?.text;
  const html = parts.find(part => part.type === 'text/html')?.text ?? '';
  const body = plain ?? html.replace(/<(?:br|\/(?:p|div|tr|h[1-6]|li))\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ').replace(/&(?:nbsp|#160);/gi, ' ').replace(/&rarr;|&#8594;/gi, '→');
  const lines = body.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const field = pattern => lines.map(line => pattern.exec(line)?.[1]).find(Boolean);
  const route = field(/^(?:Route|Rute)\s*:\s*(.+)$/i) ?? [subject, ...lines].find(line =>
    /\b(?:SUB|Surabaya)\s*(?:\(SUB\))?\s*(?:→|->|–|—|-|to|ke)\s*(?:BTH|Batam)\b/i.test(line));
  const codes = route?.match(/\b([A-Z]{3})\s*(?:→|->|–|—|-|to|ke)\s*([A-Z]{3})\b/);
  const subBth = /\b(?:SUB|Surabaya)\s*(?:\(SUB\))?\s*(?:→|->|–|—|-|to|ke)\s*(?:BTH|Batam)\b/i.test(route ?? '');
  const fromCode = codes?.[1] ?? (subBth ? 'SUB' : null);
  const toCode = codes?.[2] ?? (subBth ? 'BTH' : null);
  const latest = amount(field(/^(?:Current price|New price|Latest price|Harga terbaru|Harga saat ini)\s*:\s*(.+)$/i) ??
    /(?:is now|kini)\s+((?:Rp|IDR|USD|US\$|SGD|EUR)\s*[\d.,]+)/i.exec(subject)?.[1]);
  const previous = amount(field(/^(?:Previous price|Old price|Harga sebelumnya)\s*:\s*(.+)$/i) ??
    /\bwas\s+((?:Rp|IDR|USD|US\$|SGD|EUR)\s*[\d.,]+)/i.exec(subject)?.[1]);
  const dateText = field(/^(?:Departure date|Departure|Tanggal keberangkatan|Tanggal terbang)\s*:\s*(.+)$/i);
  const date = dateText?.match(datePattern)?.[1] ?? null;
  const validDate = date && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().startsWith(date);
  const anyDates = /\b(?:any dates|all dates|semua tanggal)\b/i.test(subject + '\n' + body);
  const type = date ? 'date_specific_alert' : 'route_level_alert';
  const urls = (body + '\n' + html).match(/https:\/\/[^\s<>"']+/g) ?? [];
  const url = urls.map(raw => officialLink(raw, provider)).find(Boolean) ?? null;
  const forecast = /(?:likely to|expected to|diperkirakan|kemungkinan akan)\s+(?:rise|fall|increase|drop|naik|turun)/i.test(subject);
  if (!fromCode || !toCode || fromCode === toCode || !latest || forecast ||
      (dateText && !validDate) || (!date && (provider !== 'google-flights' || !anyDates)) ||
      /\b(?:round[ -]trip|pulang[ -]pergi|business class|kelas bisnis)\b/i.test(subject + '\n' + body)) {
    return { status: 'unsupported_format', key, provider, receivedAt };
  }
  const airline = field(/^(?:Airline|Maskapai)\s*:\s*(.{1,70})$/i) ?? null;
  const previousTotal = previous?.currency === latest.currency ? previous.total : null;
  const changeKind = previousTotal === null ? 'reported_price' :
    latest.total > previousTotal ? 'increase' : latest.total < previousTotal ? 'decrease' : 'unchanged';
  const alert = { provider, from: fromCode, to: toCode, date, type, receivedAt, airline, url,
    total: latest.total, currency: latest.currency, previousTotal, changeKind, messageId: message.id };
  return { status: 'parsed', key, provider, receivedAt, alert,
    fingerprint: digest([provider, fromCode, toCode, type, date, airline, latest.currency, latest.total, previousTotal,
      subject.toLowerCase().replace(/\s+/g, ' ').trim(), body.replace(/https:\/\/[^\s<>]+/g, '').replace(/\s+/g, ' ').trim()]) };
}

export function flightEmailStatus(state, now) {
  const mail = state.flightEmail;
  const connected = mail?.lastPoll?.status === 'connected' && now - mail.lastPoll.at < 45 * 60000;
  const latest = (mail?.history ?? []).at(-1);
  const deliveries = state.outbox.filter(item => item.kind === 'flight-email');
  return { connected, connection: connected ? 'connected' : mail?.lastPoll?.status === 'error'
    ? 'not_connected' : 'oauth_authorization_required',
  status: mail?.lastStatus ?? 'waiting_for_first_alert', lastPollAt: mail?.lastPoll?.at ?? null,
  lastReceivedAt: mail?.lastReceivedAt ?? null, lastProcessedAt: mail?.lastProcessedAt ?? null,
  counts: mail?.counts ?? { processed: 0, 'google-flights': 0, traveloka: 0, duplicates: 0, parserErrors: 0 },
  delivery: deliveries.at(-1)?.status ?? null, parserVerified: Boolean(latest),
  history: mail?.history ?? [] };
}

export function recordFlightEmail(state, input, now, enqueue) {
  const mail = state.flightEmail ??= { seen: [], history: [], counts: {
    processed: 0, 'google-flights': 0, traveloka: 0, duplicates: 0, parserErrors: 0 } };
  if (input.poll) {
    mail.lastPoll = { status: input.poll, at: now };
    return { status: input.poll };
  }
  if (['ignored', 'sender_unverified'].includes(input.status)) return { status: input.status };
  mail.seen = mail.seen.filter(row => row.at > now - 8 * dayMs);
  const prior = mail.seen.find(row => row.key === input.key);
  if (prior) {
    if (!prior.counted && !input.replay) { mail.counts.duplicates++; prior.counted = true; }
    return { status: 'duplicate' };
  }
  const sameContent = input.fingerprint && mail.seen.some(row => row.fingerprint === input.fingerprint &&
    Math.abs(row.receivedAt - input.receivedAt) <= dayMs);
  mail.seen.push({ key: input.key, fingerprint: input.fingerprint, receivedAt: input.receivedAt, at: now,
    counted: Boolean(sameContent) });
  mail.seen = mail.seen.slice(-5000);
  if (sameContent) {
    mail.counts.duplicates++;
    return { status: 'duplicate' };
  }
  mail.lastReceivedAt = Math.max(mail.lastReceivedAt ?? 0, input.receivedAt);
  mail.lastStatus = input.status === 'parsed' ? 'alert_received' : input.status;
  if (input.status !== 'parsed') {
    mail.counts.parserErrors++;
    return { status: input.status };
  }
  const { alert } = input;
  mail.counts.processed++;
  mail.counts[alert.provider]++;
  mail.lastProcessedAt = now;
  const watches = state.watches.filter(watch => watch.status === 'active' &&
    (watch.emailSince ?? watch.created) <= alert.receivedAt &&
    watch.route.from === alert.from && watch.route.to === alert.to &&
    watch.providers.some(provider => provider === 'connected' || provider === alert.provider) &&
    watch.trip === 'oneway' && watch.cabin === 'ECONOMY' && watch.passengers === 1 &&
    !watch.nonstop && watch.baggage === 'any' && !watch.airlines.length &&
    (alert.type === 'route_level_alert' ? watch.mode === 'rolling' :
      watch.mode === 'specific' && watch.date === alert.date &&
      alert.date >= new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(now)));
  const target = watches.find(watch => watch.providers.includes(alert.provider)) ?? watches[0];
  if (target) enqueue(state, 'flight-email', target.id, target.revision, { alert }, now, input.key);
  mail.history.push({ ...alert, watchIds: watches.map(watch => watch.id) });
  mail.history = mail.history.filter(row => row.receivedAt > now - 180 * dayMs).slice(-2000);
  return { status: watches.length ? 'queued' : 'no_matching_watch', matched: watches.length };
}

export function formatFlightEmail(alert) {
  const money = value => new Intl.NumberFormat('id-ID', { style: 'currency', currency: alert.currency }).format(value);
  const route = alert.from === 'SUB' && alert.to === 'BTH' ? 'Surabaya → Batam' : alert.from + ' → ' + alert.to;
  const delta = alert.previousTotal === null ? null : alert.total - alert.previousTotal;
  return ['Pak, ' + providers[alert.provider] + ' melaporkan harga tiket ' + route + '.',
    'Harga terbaru: ' + money(alert.total),
    'Tanggal: ' + (alert.date ?? 'Semua tanggal (harga minimum rute)'),
    alert.airline && 'Maskapai: ' + alert.airline,
    delta !== null && 'Harga sebelumnya: ' + money(alert.previousTotal),
    delta !== null && 'Selisih: ' + (delta < 0 ? '−' : '+') + money(Math.abs(delta)) +
      ' (' + (delta / alert.previousTotal * 100).toFixed(1) + '%)',
    'Waktu informasi: ' + new Date(alert.receivedAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB',
    alert.url, 'Monitoring tetap aktif.'].filter(Boolean).join('\n');
}
