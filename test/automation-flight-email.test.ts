import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCloudApi } from '../api/route.ts';
import { createStore } from '../server/store.ts';
import { parseGmailFlightAlert } from '../server/automation-flight-email.ts';
import { deliverAutomationNotifications } from '../server/automation-service.ts';

const now = Date.parse('2026-11-22T10:00:00Z');
const token = 'test-only-token-for-n8n-intake';
const env = { N8N_TOKEN: token, TELEGRAM_CHAT_ID: '-12345678', TELEGRAM_USER_ID: '123456',
  TELEGRAM_BOT_TOKENS_JSON: JSON.stringify({ management: '123456:' + 'a'.repeat(24) }) };
const address = '/api/integrations/automation/gmail-flight-alert';

// TEST synthetic mail. Parsed only in local tests and never submitted to production.
function testMail({ traveloka = false, id = 'abcd1234', body, subject, auth, at = now - 500 } = {}) {
  const domain = traveloka ? 'traveloka.com' : 'google.com';
  const content = body ?? (traveloka
    ? 'Rute: SUB → BTH\nTanggal keberangkatan: 2026-12-02\nHarga terbaru: Rp 950.000\nHarga sebelumnya: Rp 1.000.000\nMaskapai: Lion Air\nhttps://www.traveloka.com/id-id/flights'
    : 'Route: Surabaya to Batam\nAny dates\nCurrent price: IDR 900.000\nhttps://www.google.com/travel/flights');
  return { id, internalDate: String(at), labelIds: ['Label_1'], payload: {
    mimeType: 'text/plain', body: { data: Buffer.from(content).toString('base64url') },
    headers: [
      { name: 'From', value: 'Alert <prices@' + domain + '>' },
      { name: 'Subject', value: subject ?? (traveloka ? 'Traveloka Price Alert' : 'Google Flights price tracking') },
      { name: 'Authentication-Results', value: auth ?? 'mx.google.com; dkim=pass header.i=@' + domain +
        '; dmarc=pass header.from=' + domain },
    ],
  } };
}

test('TEST Google route minimum and Traveloka date-specific alerts preserve known data', () => {
  const google = parseGmailFlightAlert(testMail(), now).alert;
  assert.deepEqual([google.type, google.date, google.airline, google.total, google.previousTotal],
    ['route_level_alert', null, null, 900000, null]);
  const traveloka = parseGmailFlightAlert(testMail({ traveloka: true }), now).alert;
  assert.deepEqual([traveloka.type, traveloka.date, traveloka.airline, traveloka.previousTotal, traveloka.changeKind],
    ['date_specific_alert', '2026-12-02', 'Lion Air', 1000000, 'decrease']);
  const increase = parseGmailFlightAlert(testMail({ body:
    'Route: SUB → BTH\nAny dates\nCurrent price: USD 95.50\nPrevious price: USD 90' }), now).alert;
  assert.equal(increase.changeKind, 'increase');
  assert.equal(increase.currency, 'USD');
});

test('TEST irrelevant, spoofed, forwarded-auth and unsupported payloads cannot generate prices', () => {
  assert.equal(parseGmailFlightAlert(testMail({ subject: 'Newsletter promotion' }), now).status, 'ignored');
  const forged = testMail({ auth: 'mx.google.com; dkim=pass header.i=@example.com; dmarc=fail header.from=google.com' });
  forged.payload.headers.push({ name: 'Authentication-Results',
    value: 'mx.google.com; dkim=pass header.i=@google.com; dmarc=pass header.from=google.com' });
  assert.equal(parseGmailFlightAlert(forged, now).status, 'sender_unverified');
  assert.equal(parseGmailFlightAlert(testMail({ body: 'Rute: SUB → BTH\nAny dates\nHarga terbaru: 900000' }), now).status,
    'unsupported_format');
  assert.equal(parseGmailFlightAlert(testMail({ traveloka: true, body: 'Rute: SUB → BTH\nHarga terbaru: Rp 900.000' }), now).status,
    'unsupported_format');
});

test('TEST email deduplicates transactionally through restart and Telegram sends only once', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'anshel-test-flight-mail-'));
  const file = join(dir, 'state.sqlite');
  let clock = now - 1000;
  let store = createStore(file, () => clock);
  try {
    const { watch } = store.automation({ action: 'watch-save', config: {} });
    const { watch: specific } = store.automation({ action: 'watch-save', config: {
      mode: 'specific', date: '2026-12-02', providers: ['traveloka'],
    } });
    clock = now;
    const parsed = parseGmailFlightAlert(testMail(), now);
    const add = outcome => store.automation({ action: 'flight-email', ...outcome });
    assert.equal(add(parsed).matched, 1);
    assert.equal(add(parseGmailFlightAlert(testMail({ traveloka: true, id: 'abcd1235' }), now)).matched, 1);
    assert.equal(add({ ...parsed, replay: true }).status, 'duplicate');
    store.close();
    store = createStore(file, () => clock);
    assert.equal(add(parseGmailFlightAlert(testMail({ id: 'abcd1236' }), now)).status, 'duplicate');
    const sent = [];
    const post = async (_url, request) => {
      sent.push(JSON.parse(request.body).text);
      return Response.json({ ok: true, result: { message_id: 1 } });
    };
    assert.equal(await deliverAutomationNotifications(store, env, post), 2);
    assert.equal(await deliverAutomationNotifications(store, env, post), 0);
    assert.match(sent[0], /Semua tanggal/);
    assert.doesNotMatch(sent[0], /Harga sebelumnya/);
    assert.match(sent[1], /Selisih/);
    const state = store.automation();
    assert.deepEqual(state.flightEmail.history.map(row => row.watchIds), [[watch.id], [specific.id]]);
    assert.equal(state.flightEmail.counts.duplicates, 1);
    assert.equal(state.flightEmail.delivery, 'sent');
    assert.equal(state.offers.length, 0);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});

for (const action of ['stop', 'route']) test('TEST ' + action + ' fences existing and late email', async () => {
  let clock = now - 1000;
  const store = createStore(':memory:', () => clock);
  try {
    const { watch } = store.automation({ action: 'watch-save', config: {} });
    clock = now;
    const add = message => store.automation({ action: 'flight-email', ...parseGmailFlightAlert(message, now) });
    assert.equal(add(testMail()).status, 'queued');
    if (action === 'stop') store.automation({ action: 'watch-control', id: watch.id, control: 'stop' });
    else store.automation({ action: 'watch-route', id: watch.id, route: { from: 'CGK', to: 'BTH' } });
    assert.equal(store.automation({ action: 'outbox-claim' }), null);
    assert.equal(add(testMail({ id: 'abcd5678', body: 'Route: SUB → BTH\nAny dates\nCurrent price: IDR 850.000' })).status,
      'no_matching_watch');
    assert.equal(store.automation().outbox[0].status, 'cancelled');
  } finally { store.close(); }
});

test('TEST Vercel intake requires n8n credential and reports Gmail authentication independently', async () => {
  let clock = now;
  const store = createStore(':memory:', () => clock);
  try {
    const api = createCloudApi(store, env);
    const request = (payload, authorized = true) => api.fetch(new Request('https://office.example' + address, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(authorized ? { Authorization: 'Bearer ' + token } : {}) },
      body: JSON.stringify(payload),
    }));
    assert.equal(store.automation().flightEmail.connection, 'oauth_authorization_required');
    assert.equal((await request({ poll: 'connected' }, false)).status, 401);
    assert.equal((await request({ poll: 'connected' })).status, 200);
    assert.equal(store.automation().flightEmail.status, 'waiting_for_first_alert');
    assert.equal(store.automation().flightEmail.connected, true);
    clock += 46 * 60000;
    assert.equal(store.automation().flightEmail.connected, false);
    assert.equal((await request({ test: true, message: testMail() })).status, 400);
    assert.equal((await request({ poll: 'error' })).status, 200);
    assert.equal(store.automation().flightEmail.connection, 'not_connected');
  } finally { store.close(); }
});

test('TEST cloud workflow only reads the exact alert label and omits unrelated mail', async () => {
  const workflow = JSON.parse(await readFile(new URL('../workflows/office_gmail_flight_alerts.json', import.meta.url), 'utf8'));
  const nodes = Object.fromEntries(workflow.nodes.map(node => [node.name, node]));
  assert.equal(workflow.active, false);
  assert.equal(workflow.settings.saveDataErrorExecution, 'none');
  for (const node of workflow.nodes.filter(node => node.parameters.jsCode))
    assert.doesNotThrow(() => new Function('$input', '$', node.parameters.jsCode));
  const choose = new Function('$input', nodes['Pilih Anshel/FlightAlerts'].parameters.jsCode);
  const labels = [
    { name: 'Anshel/FlightAlerts backup', type: 'user', id: 'Label_9' },
    { name: 'Anshel/FlightAlerts', type: 'user', id: 'Label_1' },
  ];
  assert.equal(choose({ first: () => ({ json: { statusCode: 200, body: { labels } } }) })[0].json.labelId, 'Label_1');
  assert.equal(choose({ first: () => ({ json: { statusCode: 401 } }) })[0].json.hasLabel, false);
  const filter = new Function('$input', '$', nodes['Ambil hanya metadata dan isi alert'].parameters.jsCode);
  const messages = [testMail(), { ...testMail(), labelIds: ['Label_9'] }, testMail({ subject: 'OTP' })];
  const result = filter({ all: () => messages.map(body => ({ json: { statusCode: 200, body } })) },
    () => ({ first: () => ({ json: { labelId: 'Label_1' } }) }));
  assert.equal(result.length, 1);
  assert.equal(result[0].json.replay, true);
  assert.equal(parseGmailFlightAlert(result[0].json.message, now).status, 'parsed');
});
