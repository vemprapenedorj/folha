import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { scryptSync } from 'node:crypto';

process.env.VERCEL = '1';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
process.env.ESCALA_STORE_SECRET = 'test-store-secret';

let state = {
  db: { people: ['Diego', 'Diogo'], shifts: ['06:30–14:30'], weeks: {} },
  passwordHash: scryptSync('Senha123', 'escala-hotel-titanic', 32).toString('hex')
};
globalThis.fetch = async (url, options) => {
  const args = JSON.parse(options.body);
  assert.equal(options.headers.apikey, process.env.SUPABASE_PUBLISHABLE_KEY);
  assert.equal(args.p_secret, process.env.ESCALA_STORE_SECRET);
  if (url.endsWith('/escala_load')) return Response.json(state);
  if (url.endsWith('/escala_save')) { state = args.p_state; return Response.json(true); }
  throw new Error(`Chamada inesperada: ${url}`);
};

const { handler } = await import('../server.mjs');

async function request(method, url, data, cookie = '') {
  const req = Readable.from(data === undefined ? [] : [JSON.stringify(data)]);
  req.method = method; req.url = url; req.headers = { host: 'localhost', cookie };
  const res = { status: 0, headers: {}, text: '', writeHead(status, headers) { this.status = status; this.headers = headers; }, end(text) { this.text = text?.toString() || ''; } };
  await handler(req, res);
  return { status: res.status, headers: res.headers, body: JSON.parse(res.text) };
}

test('escala e login persistem entre chamadas e a troca de senha invalida a sessão', async () => {
  assert.equal((await request('GET', '/api/me')).body.editor, false);
  assert.equal((await request('GET', '/api/bootstrap?week=2030-01-07')).body.editor, false);
  const login = await request('POST', '/api/login?week=2030-01-07', { password: 'Senha123' });
  assert.equal(login.status, 200);
  assert.equal(login.body.week.start, '2030-01-07');
  assert.deepEqual(login.body.people, ['Diego', 'Diogo']);
  const cookie = login.headers['Set-Cookie'].split(';')[0];
  assert.equal((await request('GET', '/api/me', undefined, cookie)).body.editor, true);
  assert.equal((await request('GET', '/api/bootstrap?week=2030-01-07', undefined, cookie)).body.week.start, '2030-01-07');
  const week = '2030-01-07';
  assert.equal((await request('PUT', '/api/week', { start: week, entries: { Diego: { 0: '06:30–14:30' } } }, cookie)).status, 200);
  assert.equal(state.db.weeks[week].entries.Diego[0], '06:30–14:30');
  assert.equal((await request('POST', '/api/publish', { start: week }, cookie)).status, 200);
  assert.equal((await request('GET', `/api/public?week=${week}`)).body.entries.Diego[0], '06:30–14:30');
  assert.equal((await request('POST', '/api/change-password', { currentPassword: 'Senha123', newPassword: 'NovaSenha12' }, cookie)).status, 200);
  assert.equal((await request('GET', '/api/me', undefined, cookie)).body.editor, false);
  assert.equal((await request('POST', '/api/login', { password: 'NovaSenha12' })).status, 200);
});
