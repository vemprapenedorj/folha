import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = await mkdtemp(join(tmpdir(), 'escala-test-'));
process.env.DATA_DIR = dir;
await writeFile(join(dir, 'admin-password.txt'), 'senha-de-teste');
const { handler } = await import('../server.mjs');

async function request(method, url, data, cookie = '') {
  const req = Readable.from(data === undefined ? [] : [JSON.stringify(data)]);
  req.method = method; req.url = url; req.headers = { host: 'localhost', cookie };
  const res = { status: 0, headers: {}, text: '', writeHead(status, headers) { this.status = status; this.headers = headers; }, end(text) { this.text = text?.toString() || ''; } };
  await handler(req, res);
  return { status: res.status, headers: res.headers, body: JSON.parse(res.text) };
}

test('edição, publicação, consulta e correção da mesma semana', async () => {
  const week = '2030-01-07';
  assert.equal((await request('GET', `/api/public?week=${week}`)).status, 404);
  assert.equal((await request('PUT', '/api/week', { start: week, entries: {} })).status, 401);
  const login = await request('POST', '/api/login', { password: 'senha-de-teste' });
  assert.equal(login.status, 200);
  assert.equal((await request('GET', '/api/version')).body.version, 3);
  const cookie = login.headers['Set-Cookie'].split(';')[0];
  assert.equal((await request('POST', '/api/copy-week', { source: '2029-12-31', target: week, mode: 'fill' }, cookie)).status, 404);
  const people = await request('GET', '/api/data', undefined, cookie);
  assert.equal(people.body.people.length, 18);
  assert.ok(people.body.people.includes('ADRIANE'));
  const colors = { folga: '#112233', falta: '#aa4422', atestado: '#ffee99', troca_folga: '#335577' };
  assert.equal((await request('PUT', '/api/status-colors', { colors })).status, 401);
  assert.equal((await request('PUT', '/api/status-colors', { colors: { ...colors, falta: 'red' } }, cookie)).status, 400);
  assert.deepEqual((await request('PUT', '/api/status-colors', { colors }, cookie)).body.statusColors, colors);
  assert.deepEqual((await request('GET', '/api/data', undefined, cookie)).body.statusColors, colors);
  const entries = { ADRIANE: { 0: '08:00–16:00', 1: 'folga', 2: 'troca_folga' }, ANA: { 0: '14:00–22:00', 3: 'falta', 4: 'atestado' } };
  assert.equal((await request('PUT', '/api/week', { start: week, entries }, cookie)).status, 200);
  assert.equal((await request('GET', `/api/public?week=${week}`)).status, 404);
  assert.equal((await request('POST', '/api/publish', { start: week }, cookie)).body.published, true);
  assert.equal((await request('GET', `/api/public?week=${week}`)).body.entries.ADRIANE[0], '08:00–16:00');
  assert.deepEqual((await request('GET', `/api/public?week=${week}`)).body.statusColors, colors);
  const updatedColors = { ...colors, folga: '#223344' };
  await request('PUT', '/api/status-colors', { colors: updatedColors }, cookie);
  assert.deepEqual((await request('GET', `/api/public?week=${week}`)).body.statusColors, updatedColors);
  entries.ADRIANE[0] = '07:00–15:00';
  assert.equal((await request('PUT', '/api/week', { start: week, entries }, cookie)).status, 200);
  assert.equal((await request('GET', `/api/public?week=${week}`)).body.entries.ADRIANE[0], '07:00–15:00');
  assert.equal((await request('GET', '/api/week?week=2030-01-09', undefined, cookie)).body.start, week);
  const nextWeek = '2030-01-14';
  const copy = await request('POST', '/api/copy-week', { source: week, target: nextWeek, mode: 'fill' }, cookie);
  assert.equal(copy.status, 200);
  assert.equal(copy.body.published, false);
  assert.equal(copy.body.entries.ADRIANE[0], '07:00–15:00');
  assert.equal(copy.body.entries.ADRIANE[1], 'folga');
  assert.equal(copy.body.entries.ADRIANE[2], 'troca_folga');
  assert.equal(copy.body.entries.ANA[0], '14:00–22:00');
  assert.equal(copy.body.entries.ANA[3], 'falta');
  assert.equal((await request('GET', `/api/public?week=${nextWeek}`)).status, 404);
  assert.equal((await request('POST', '/api/copy-week', { source: week, target: nextWeek, mode: 'fill' }, cookie)).body.copiedCount, 0);

  const source = '2026-11-02', target = '2026-11-09';
  const sourceEntries = { ADRIANE: { 0: '08:00–16:00' }, ANA: { 1: 'folga' } };
  const targetEntries = { ADRIANE: { 0: '11:00–19:00' }, CRISTIANE: { 1: '14:00–22:00' } };
  await request('PUT', '/api/week', { start: source, entries: sourceEntries }, cookie);
  await request('PUT', '/api/week', { start: target, entries: targetEntries }, cookie);
  await request('POST', '/api/publish', { start: target }, cookie);
  const filled = await request('POST', '/api/copy-week', { source: '2026-11-04', target: '2026-11-12', mode: 'fill' }, cookie);
  assert.equal(filled.status, 200);
  assert.equal(filled.body.published, true);
  assert.equal(filled.body.copiedCount, 1);
  assert.equal(filled.body.entries.ADRIANE[0], '11:00–19:00');
  assert.equal(filled.body.entries.ANA[1], 'folga');
  assert.equal(filled.body.entries.CRISTIANE[1], '14:00–22:00');
  assert.equal((await request('GET', `/api/public?week=${target}`)).body.entries.ANA[1], 'folga');
  const replaced = await request('POST', '/api/copy-week', { source, target, mode: 'replace' }, cookie);
  assert.equal(replaced.status, 200);
  assert.equal(replaced.body.published, true);
  assert.equal(replaced.body.entries.ADRIANE[0], '08:00–16:00');
  assert.equal(replaced.body.entries.CRISTIANE, undefined);

  const full = '2026-11-16';
  const fullEntries = Object.fromEntries(people.body.people.map(person => [person, Object.fromEntries(Array.from({ length: 7 }, (_, day) => [day, 'folga']))]));
  await request('PUT', '/api/week', { start: full, entries: fullEntries }, cookie);
  assert.equal((await request('POST', '/api/copy-week', { source, target: full, mode: 'fill' }, cookie)).body.copiedCount, 0);
  const fullReplaced = await request('POST', '/api/copy-week', { source, target: full, mode: 'replace' }, cookie);
  assert.equal(fullReplaced.status, 200);
  assert.equal(fullReplaced.body.entries.ADRIANE[0], '08:00–16:00');
  assert.equal(fullReplaced.body.entries.CRISTIANE, undefined);
  assert.equal((await request('POST', '/api/copy-week', { source, target: source, mode: 'replace' }, cookie)).status, 400);
  for (const invalid of ['Ab123', 'Abcdefghijklm', 'Senha_123', 'Senha!123', 'Senha 123']) {
    assert.equal((await request('POST', '/api/change-password', { currentPassword: 'senha-de-teste', newPassword: invalid })).status, 400);
  }
  assert.equal((await request('POST', '/api/change-password', { currentPassword: 'errada', newPassword: 'NovaSenha123' })).status, 401);
  assert.equal((await request('POST', '/api/change-password', { currentPassword: 'senha-de-teste', newPassword: 'NovaSenha123' })).status, 200);
  assert.match(await readFile(join(dir, 'admin-password.txt'), 'utf8'), /Governança \(Camareiras\): NovaSenha123/);
  assert.equal(JSON.parse(await readFile(join(dir, 'passwords.json'), 'utf8')).geral, 'senha-de-teste');
  assert.equal((await request('GET', '/api/data', undefined, cookie)).status, 401);
  assert.equal((await request('POST', '/api/login', { password: 'senha-de-teste' })).status, 401);
  assert.equal((await request('POST', '/api/login', { password: 'NovaSenha123' })).status, 200);
  assert.equal((await request('POST', '/api/login', { dept: 'geral', password: 'senha-de-teste' })).status, 200);
  assert.equal((await request('POST', '/api/change-password', { currentPassword: 'NovaSenha123', newPassword: 'Ab1234' })).status, 200);
  assert.equal((await request('POST', '/api/login', { password: 'Ab1234' })).status, 200);
  await rm(dir, { recursive: true, force: true });
});
