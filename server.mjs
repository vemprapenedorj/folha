import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { createHmac, randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const dataDir = process.env.DATA_DIR || join(root, '.data');
const dataFile = join(dataDir, 'schedule.json');
const passwordFile = join(dataDir, 'admin-password.txt');
const port = Number(process.env.PORT || 3000);
const remoteMode = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY && process.env.ESCALA_STORE_SECRET);
const sessions = new Map();
const defaultPeople = ['Diego', 'Rafael', 'Mauri', 'Gerson', 'Bruno', 'Denin', 'Ysa', 'Amanda', 'Val', 'Diogo'];
const defaultShifts = ['06:30–14:30', '07:00–15:20', '09:00–17:00', '10:00–18:00', '11:00–19:00', '14:00–22:20', '19:00–07:00'];
const statuses = ['folga', 'ferias', 'atestado'];
let db;
let adminPassword;
let adminPasswordHash;
let writing = Promise.resolve();

if (process.env.VERCEL && !remoteMode) throw new Error('Configure SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY e ESCALA_STORE_SECRET.');

async function remoteCall(name, payload) {
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: process.env.SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_PUBLISHABLE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_secret: process.env.ESCALA_STORE_SECRET, ...payload })
  });
  if (!response.ok) throw new Error(`Armazenamento indisponível (${response.status})`);
  return response.json();
}

async function refreshState() {
  if (!remoteMode) return;
  const state = await remoteCall('escala_load', {});
  if (!state?.db || !state?.passwordHash) throw new Error('Armazenamento não configurado');
  db = state.db;
  adminPasswordHash = state.passwordHash;
}

function send(res, status, data, headers = {}) {
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': typeof data === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}
function weekStart(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}
function safeEqual(a, b) {
  const salt = 'escala-hotel-titanic';
  const left = scryptSync(a, salt, 32);
  const right = scryptSync(b, salt, 32);
  return timingSafeEqual(left, right);
}
function passwordMatches(password) {
  if (!remoteMode) return safeEqual(password, adminPassword);
  const hash = scryptSync(password, 'escala-hotel-titanic', 32);
  const stored = Buffer.from(adminPasswordHash, 'hex');
  return stored.length === hash.length && timingSafeEqual(hash, stored);
}
function sessionSignature(expiry) {
  return createHmac('sha256', process.env.ESCALA_STORE_SECRET).update(`${expiry}:${adminPasswordHash}`).digest('hex');
}
function authorized(req) {
  if (remoteMode) {
    const match = /(?:^|; )escala_session=([a-f0-9]{76})(?:;|$)/.exec(req.headers.cookie || '');
    if (!match) return false;
    const expiry = match[1].slice(0, 12);
    if (parseInt(expiry, 16) <= Date.now()) return false;
    const received = Buffer.from(match[1].slice(12), 'hex');
    const expected = Buffer.from(sessionSignature(expiry), 'hex');
    return timingSafeEqual(received, expected);
  }
  const match = /(?:^|; )escala_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '');
  const expiry = match && sessions.get(match[1]);
  return Boolean(expiry && expiry > Date.now());
}
async function persist() {
  if (remoteMode) {
    const result = await remoteCall('escala_save', { p_state: { db, passwordHash: adminPasswordHash } });
    if (result !== true) throw new Error('Não foi possível salvar a escala');
    return;
  }
  const content = JSON.stringify(db, null, 2);
  writing = writing.then(async () => {
    const temp = `${dataFile}.${randomBytes(6).toString('hex')}.tmp`;
    await writeFile(temp, content);
    await rename(temp, dataFile);
  });
  await writing;
}
async function bodyJson(req) {
  if (req.body !== undefined) return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  let text = '';
  for await (const chunk of req) {
    text += chunk;
    if (text.length > 100_000) throw new Error('Corpo muito grande');
  }
  return JSON.parse(text || '{}');
}
function schedule(key) {
  return db.weeks[key] || { start: key, published: false, updatedAt: null, entries: {} };
}
function publicWeek(key) {
  const item = db.weeks[key];
  return item?.published ? { ...item, people: db.people, shifts: db.shifts } : null;
}
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
async function staticFile(req, res, path) {
  const file = path === '/' || path === '/public' ? 'index.html' : path.slice(1);
  if (!['index.html', 'app.js', 'week-calendar.js', 'style.css'].includes(file)) return send(res, 404, { error: 'Não encontrado' });
  const bytes = await readFile(join(root, 'public', file));
  res.writeHead(200, { 'Content-Type': mime[extname(file)], 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
  res.end(bytes);
}
async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const path = url.pathname;
  try {
    if (remoteMode && path.startsWith('/api/') && path !== '/api/version') await refreshState();
    if (path === '/api/login' && req.method === 'POST') {
      const { password } = await bodyJson(req);
      if (typeof password !== 'string' || !passwordMatches(password)) return send(res, 401, { error: 'Senha incorreta' });
      const token = remoteMode ? (() => { const expiry = (Date.now() + 7 * 86400_000).toString(16).padStart(12, '0'); return expiry + sessionSignature(expiry); })() : randomBytes(32).toString('hex');
      if (!remoteMode) sessions.set(token, Date.now() + 7 * 86400_000);
      const initialWeek = weekStart(url.searchParams.get('week'));
      const payload = initialWeek ? { ok: true, editor: true, people: db.people, shifts: db.shifts, week: schedule(initialWeek) } : { ok: true };
      return send(res, 200, payload, { 'Set-Cookie': `escala_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${process.env.NODE_ENV === 'production' ? '; Secure' : ''}` });
    }
    if (path === '/api/change-password' && req.method === 'POST') {
      if (!remoteMode && process.env.ADMIN_PASSWORD) return send(res, 409, { error: 'A senha deste servidor é definida no ambiente. Altere ADMIN_PASSWORD na configuração do servidor.' });
      const { currentPassword, newPassword } = await bodyJson(req);
      if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || !/^[\p{L}\p{N}]{6,12}$/u.test(newPassword)) return send(res, 400, { error: 'A nova senha deve ter de 6 a 12 caracteres, usando somente letras e números.' });
      if (!passwordMatches(currentPassword)) return send(res, 401, { error: 'Senha atual incorreta.' });
      if (passwordMatches(newPassword)) return send(res, 400, { error: 'Escolha uma senha diferente da atual.' });
      if (remoteMode) {
        adminPasswordHash = scryptSync(newPassword, 'escala-hotel-titanic', 32).toString('hex');
        await persist();
      } else {
        const temporaryPasswordFile = `${passwordFile}.${randomBytes(6).toString('hex')}.tmp`;
        await writeFile(temporaryPasswordFile, newPassword, { mode: 0o600 });
        await rename(temporaryPasswordFile, passwordFile);
        adminPassword = newPassword;
      }
      sessions.clear();
      return send(res, 200, { ok: true });
    }
    if (path === '/api/logout' && req.method === 'POST') {
      const match = /escala_session=([a-f0-9]{64})/.exec(req.headers.cookie || '');
      if (match && !remoteMode) sessions.delete(match[1]);
      return send(res, 200, { ok: true }, { 'Set-Cookie': 'escala_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' });
    }
    if (path === '/api/me' && req.method === 'GET') return send(res, 200, { editor: authorized(req) });
    if (path === '/api/bootstrap' && req.method === 'GET') {
      if (!authorized(req)) return send(res, 200, { editor: false });
      const key = weekStart(url.searchParams.get('week'));
      return key ? send(res, 200, { editor: true, people: db.people, shifts: db.shifts, week: schedule(key) }) : send(res, 400, { error: 'Semana inválida' });
    }
    if (path === '/api/version' && req.method === 'GET') return send(res, 200, { app: 'escala-hotel-titanic', version: 3 });
    if (path === '/api/public' && req.method === 'GET') {
      const key = weekStart(url.searchParams.get('week'));
      if (!key) return send(res, 400, { error: 'Semana inválida' });
      const item = publicWeek(key);
      return item ? send(res, 200, item) : send(res, 404, { error: 'Semana ainda não publicada' });
    }
    if (path.startsWith('/api/') && !authorized(req)) return send(res, 401, { error: 'Acesso restrito' });
    if (path === '/api/data' && req.method === 'GET') return send(res, 200, { people: db.people, shifts: db.shifts });
    if (path === '/api/data' && req.method === 'PUT') {
      const input = await bodyJson(req);
      const people = input.people;
      const shifts = input.shifts;
      if (!Array.isArray(people) || !Array.isArray(shifts) || people.length > 100 || shifts.length > 100 || ![...people, ...shifts].every(x => typeof x === 'string' && x.trim() && x.length < 80)) return send(res, 400, { error: 'Lista inválida' });
      db.people = [...new Set(people.map(x => x.trim()))];
      db.shifts = [...new Set(shifts.map(x => x.trim()))];
      await persist();
      return send(res, 200, { people: db.people, shifts: db.shifts });
    }
    if (path === '/api/week' && req.method === 'GET') {
      const key = weekStart(url.searchParams.get('week'));
      return key ? send(res, 200, schedule(key)) : send(res, 400, { error: 'Semana inválida' });
    }
    if (path === '/api/week' && req.method === 'PUT') {
      const input = await bodyJson(req);
      const key = weekStart(input.start);
      if (!key || key !== input.start || !input.entries || typeof input.entries !== 'object' || Array.isArray(input.entries)) return send(res, 400, { error: 'Escala inválida' });
      const entries = {};
      for (const [person, days] of Object.entries(input.entries)) {
        if (!db.people.includes(person) || !days || typeof days !== 'object' || Array.isArray(days)) return send(res, 400, { error: 'Funcionário inválido' });
        entries[person] = {};
        for (const [day, value] of Object.entries(days)) {
          if (!/^[0-6]$/.test(day) || (value !== '' && !db.shifts.includes(value) && !statuses.includes(value))) return send(res, 400, { error: 'Marcação inválida' });
          if (value) entries[person][day] = value;
        }
      }
      const old = schedule(key);
      db.weeks[key] = { ...old, entries, updatedAt: new Date().toISOString() };
      await persist();
      return send(res, 200, db.weeks[key]);
    }
    if (path === '/api/copy-week' && req.method === 'POST') {
      const input = await bodyJson(req);
      const sourceKey = weekStart(input.source);
      const targetKey = weekStart(input.target);
      if (!sourceKey || !targetKey || sourceKey === targetKey || !['fill', 'replace'].includes(input.mode)) return send(res, 400, { error: 'Escolha semanas diferentes e uma forma de cópia.' });
      const source = db.weeks[sourceKey];
      if (!source || !Object.values(source.entries).some(days => Object.values(days).some(Boolean))) return send(res, 404, { error: 'A semana escolhida não tem escala para copiar.' });
      const target = schedule(targetKey);
      const entries = input.mode === 'replace' ? {} : structuredClone(target.entries);
      let copiedCount = 0;
      for (const person of db.people) {
        for (const [day, value] of Object.entries(source.entries[person] || {})) {
          if (!/^[0-6]$/.test(day) || (!db.shifts.includes(value) && !statuses.includes(value))) continue;
          if (input.mode === 'fill' && entries[person]?.[day]) continue;
          entries[person] ||= {};
          entries[person][day] = value;
          copiedCount++;
        }
      }
      if (!copiedCount && input.mode === 'fill') return send(res, 200, { ...target, copiedCount });
      if (!copiedCount) return send(res, 404, { error: 'A semana escolhida não tem marcações atuais para copiar.' });
      db.weeks[targetKey] = { ...target, entries, updatedAt: new Date().toISOString() };
      await persist();
      return send(res, 200, { ...db.weeks[targetKey], copiedCount });
    }
    if (path === '/api/publish' && req.method === 'POST') {
      const input = await bodyJson(req);
      const key = weekStart(input.start);
      if (!key || key !== input.start || !db.weeks[key]) return send(res, 400, { error: 'Salve a semana antes de publicar' });
      db.weeks[key].published = true;
      db.weeks[key].updatedAt = new Date().toISOString();
      await persist();
      return send(res, 200, db.weeks[key]);
    }
    if (req.method === 'GET' && (path === '/' || path === '/app.js' || path === '/week-calendar.js' || path === '/style.css' || path === '/public')) return staticFile(req, res, path);
    return send(res, 404, { error: 'Não encontrado' });
  } catch (error) {
    console.error(error);
    send(res, 500, { error: 'Erro ao processar a solicitação' });
  }
}

if (!remoteMode) {
  await mkdir(dataDir, { recursive: true });
  try { db = JSON.parse(await readFile(dataFile, 'utf8')); }
  catch { db = { people: defaultPeople, shifts: defaultShifts, weeks: {} }; await persist(); }
  adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    try { adminPassword = (await readFile(passwordFile, 'utf8')).trim(); }
    catch {
      const allowed = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
      adminPassword = Array.from({ length: 12 }, () => allowed[randomInt(allowed.length)]).join('');
      await writeFile(passwordFile, adminPassword, { mode: 0o600 });
      console.log(`Senha inicial do editor: ${adminPassword}`);
    }
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) createServer(handler).listen(port, () => console.log(`Escala disponível em http://localhost:${port}`));
export { handler };
