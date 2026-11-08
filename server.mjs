import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { createHmac, randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const dataDir = process.env.DATA_DIR || join(root, '.data');
const dataFile = join(dataDir, 'schedule.json');
const passwordsFile = join(dataDir, 'passwords.json');
const passwordFile = join(dataDir, 'admin-password.txt');
const port = Number(process.env.PORT || 3000);
const remoteMode = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY && process.env.ESCALA_STORE_SECRET);
const sessions = new Map();

const defaultPeopleCamareiras = [
  'ADRIANE', 'ANA', 'ANA MARIA', 'CRISTIANE', 'DAIANE SILVA',
  'DOUGLAS SOARES', 'GRAZIELA SALGADO', 'LAIRIS NATALIA', 'MARCELLI',
  'MÁRCIA CRISTINA', 'MARIA CRUZ', 'PABLO', 'PATRICIA', 'PIETRA',
  'RAISSA', 'ROSE', 'ROSIANA', 'SUELLEN'
];
const defaultShiftsCamareiras = [
  '08:00–16:00', '14:00–22:00', '06:00–14:00', '06:30–14:30', '07:00–15:00',
  '07:30–15:30', '08:30–16:30', '09:00–17:00', '09:30–17:30', '10:00–18:00',
  '10:30–18:30', '11:00–19:00', '13:00–21:00', '13:30–21:30', '14:30–22:30',
  '15:00–23:00'
];

const defaultPeopleGeral = [
  'Diego Oliveira', 'Rafael Chagas', 'Mauricelia', 'Gerson Sena',
  'Bruno', 'Denin', 'Ysa Marassi', 'Amanda Costa', 'Valquiria', 'Diogo'
];
const defaultShiftsGeral = [
  '06:30–14:30', '07:00–15:20', '09:00–17:00', '10:00–18:00',
  '11:00–19:00', '14:00–22:20', '19:00–07:00'
];

const statuses = ['folga', 'ferias', 'atestado'];
let db;
let adminPasswords = { camareiras: 'camareiras', geral: '123456' };
let adminPasswordHash;
let isSinglePasswordFile = false;
let writing = Promise.resolve();

if (process.env.VERCEL && !remoteMode) throw new Error('Configure SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY e ESCALA_STORE_SECRET.');

function normalizeDb(raw) {
  if (raw?.departments?.camareiras && raw?.departments?.geral) {
    raw.people = raw.departments.camareiras.people;
    raw.shifts = raw.departments.camareiras.shifts;
    raw.weeks = raw.departments.camareiras.weeks;
    return raw;
  }
  const camPeople = raw?.departments?.camareiras?.people || raw?.people || defaultPeopleCamareiras;
  const camShifts = raw?.departments?.camareiras?.shifts || raw?.shifts || defaultShiftsCamareiras;
  const camWeeks = raw?.departments?.camareiras?.weeks || raw?.weeks || {};

  const gerPeople = raw?.departments?.geral?.people || (raw?.departments ? defaultPeopleGeral : (raw?.people || defaultPeopleGeral));
  const gerShifts = raw?.departments?.geral?.shifts || (raw?.departments ? defaultShiftsGeral : (raw?.shifts || defaultShiftsGeral));
  const gerWeeks = raw?.departments?.geral?.weeks || {};

  const result = {
    departments: {
      camareiras: {
        id: 'camareiras',
        name: 'Governança (Camareiras)',
        title: 'Escala de Camareiras',
        columnLabel: 'GOVERNANÇA',
        people: camPeople,
        shifts: camShifts,
        weeks: camWeeks
      },
      geral: {
        id: 'geral',
        name: 'Recepção / Geral',
        title: 'Escala Geral',
        columnLabel: 'FUNCIONÁRIO',
        people: gerPeople,
        shifts: gerShifts,
        weeks: gerWeeks
      }
    }
  };
  result.people = result.departments.camareiras.people;
  result.shifts = result.departments.camareiras.shifts;
  result.weeks = result.departments.camareiras.weeks;
  return result;
}

function resolveDeptId(id) {
  if (id && db.departments?.[id]) return id;
  return 'camareiras';
}
function getDept(id) {
  return db.departments[resolveDeptId(id)];
}

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
  db = normalizeDb(state.db);
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
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const salt = 'escala-hotel-titanic';
  const left = scryptSync(a, salt, 32);
  const right = scryptSync(b, salt, 32);
  return timingSafeEqual(left, right);
}

function findMatchingDeptsLocal(password) {
  const matched = [];
  for (const [dept, pass] of Object.entries(adminPasswords)) {
    if (safeEqual(password, pass)) matched.push(dept);
  }
  return matched;
}

function findMatchingDeptsRemote(password) {
  const hash = scryptSync(password, 'escala-hotel-titanic', 32);
  const matched = [];
  if (typeof adminPasswordHash === 'object' && adminPasswordHash !== null) {
    for (const [dept, h] of Object.entries(adminPasswordHash)) {
      const stored = Buffer.from(h, 'hex');
      if (stored.length === hash.length && timingSafeEqual(hash, stored)) matched.push(dept);
    }
  } else if (typeof adminPasswordHash === 'string') {
    const stored = Buffer.from(adminPasswordHash, 'hex');
    if (stored.length === hash.length && timingSafeEqual(hash, stored)) {
      matched.push('camareiras', 'geral');
    }
  }
  return matched;
}

function sessionSignature(expiry, scope = 'all') {
  const hashStr = typeof adminPasswordHash === 'object' ? JSON.stringify(adminPasswordHash) : String(adminPasswordHash);
  return createHmac('sha256', process.env.ESCALA_STORE_SECRET).update(`${expiry}:${scope}:${hashStr}`).digest('hex');
}

function authorized(req, dept) {
  if (remoteMode) {
    const match = /(?:^|; )escala_session=([a-f0-9]+)(?:;|$)/.exec(req.headers.cookie || '');
    if (!match) return false;
    const token = match[1];
    const expiry = token.slice(0, 12);
    if (parseInt(expiry, 16) <= Date.now()) return false;
    const received = Buffer.from(token.slice(12), 'hex');
    const expectedAll = Buffer.from(sessionSignature(expiry, 'all'), 'hex');
    if (received.length === expectedAll.length && timingSafeEqual(received, expectedAll)) return true;
    if (dept) {
      const expectedDept = Buffer.from(sessionSignature(expiry, dept), 'hex');
      if (received.length === expectedDept.length && timingSafeEqual(received, expectedDept)) return true;
    }
    const oldExpected = Buffer.from(createHmac('sha256', process.env.ESCALA_STORE_SECRET).update(`${expiry}:${adminPasswordHash}`).digest('hex'), 'hex');
    if (received.length === oldExpected.length && timingSafeEqual(received, oldExpected)) return true;
    return false;
  }
  const match = /(?:^|; )escala_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '');
  const data = match && sessions.get(match[1]);
  if (!data || data.expiry <= Date.now()) return false;
  if (!dept) return true;
  return Array.isArray(data.depts) && data.depts.includes(dept);
}

async function writePasswords() {
  if (isSinglePasswordFile) {
    const temp = `${passwordFile}.${randomBytes(6).toString('hex')}.tmp`;
    await writeFile(temp, adminPasswords.camareiras || Object.values(adminPasswords)[0], { mode: 0o600 });
    await rename(temp, passwordFile);
    return;
  }
  const passJson = JSON.stringify(adminPasswords, null, 2);
  const tempJson = `${passwordsFile}.${randomBytes(6).toString('hex')}.tmp`;
  await writeFile(tempJson, passJson, { mode: 0o600 });
  await rename(tempJson, passwordsFile);

  const txtContent = `Governança (Camareiras): ${adminPasswords.camareiras}\nRecepção / Geral: ${adminPasswords.geral}\n`;
  const tempTxt = `${passwordFile}.${randomBytes(6).toString('hex')}.tmp`;
  await writeFile(tempTxt, txtContent, { mode: 0o600 });
  await rename(tempTxt, passwordFile);
}

async function persist() {
  const activeDept = db.departments.camareiras || Object.values(db.departments)[0];
  db.people = activeDept.people;
  db.shifts = activeDept.shifts;
  db.weeks = activeDept.weeks;

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

function schedule(deptId, key) {
  const deptObj = getDept(deptId);
  return deptObj.weeks[key] || { start: key, published: false, updatedAt: null, entries: {} };
}

function publicWeek(deptId, key) {
  const deptObj = getDept(deptId);
  const item = deptObj.weeks[key];
  return item?.published ? { ...item, people: deptObj.people, shifts: deptObj.shifts } : null;
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
      const { password, dept: requestedDept } = await bodyJson(req);
      if (typeof password !== 'string') return send(res, 400, { error: 'Senha inválida' });
      const matching = remoteMode ? findMatchingDeptsRemote(password) : findMatchingDeptsLocal(password);
      if (matching.length === 0) return send(res, 401, { error: 'Senha incorreta' });
      const targetDept = (requestedDept && matching.includes(requestedDept)) ? requestedDept : matching[0];
      const token = remoteMode
        ? (() => { const expiry = (Date.now() + 7 * 86400_000).toString(16).padStart(12, '0'); return expiry + sessionSignature(expiry, matching.length > 1 ? 'all' : targetDept); })()
        : randomBytes(32).toString('hex');
      if (!remoteMode) {
        const existingToken = /(?:^|; )escala_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
        if (existingToken && sessions.has(existingToken)) {
          const sess = sessions.get(existingToken);
          sess.depts = [...new Set([...sess.depts, ...matching])];
        } else {
          sessions.set(token, { expiry: Date.now() + 7 * 86400_000, depts: matching });
        }
      }
      const initialWeek = weekStart(url.searchParams.get('week'));
      const deptObj = getDept(targetDept);
      const payload = {
        ok: true,
        editor: true,
        dept: targetDept,
        deptName: deptObj.name,
        deptTitle: deptObj.title,
        columnLabel: deptObj.columnLabel,
        availableDepts: Object.entries(db.departments).map(([id, d]) => ({
          id,
          name: d.name,
          title: d.title,
          columnLabel: d.columnLabel,
          authorized: authorized(req, id) || matching.includes(id)
        })),
        people: deptObj.people,
        shifts: deptObj.shifts,
        week: initialWeek ? schedule(targetDept, initialWeek) : null
      };
      return send(res, 200, payload, { 'Set-Cookie': `escala_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${process.env.NODE_ENV === 'production' ? '; Secure' : ''}` });
    }

    if (path === '/api/change-password' && req.method === 'POST') {
      if (!remoteMode && process.env.ADMIN_PASSWORD) return send(res, 409, { error: 'A senha deste servidor é definida no ambiente. Altere ADMIN_PASSWORD na configuração do servidor.' });
      const { currentPassword, newPassword, dept } = await bodyJson(req);
      if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || !/^[\p{L}\p{N}]{6,12}$/u.test(newPassword)) return send(res, 400, { error: 'A nova senha deve ter de 6 a 12 caracteres, usando somente letras e números.' });

      let targetDept = dept;
      if (!targetDept) {
        const matching = remoteMode ? findMatchingDeptsRemote(currentPassword) : findMatchingDeptsLocal(currentPassword);
        if (matching.length === 0) return send(res, 401, { error: 'Senha atual incorreta.' });
        targetDept = matching[0];
      } else {
        const valid = remoteMode
          ? findMatchingDeptsRemote(currentPassword).includes(targetDept)
          : safeEqual(currentPassword, adminPasswords[targetDept]);
        if (!valid) return send(res, 401, { error: 'Senha atual incorreta.' });
      }

      if (currentPassword === newPassword) return send(res, 400, { error: 'Escolha uma senha diferente da atual.' });

      if (remoteMode) {
        if (typeof adminPasswordHash !== 'object' || !adminPasswordHash) {
          adminPasswordHash = scryptSync(newPassword, 'escala-hotel-titanic', 32).toString('hex');
        } else {
          adminPasswordHash[targetDept] = scryptSync(newPassword, 'escala-hotel-titanic', 32).toString('hex');
        }
        await persist();
      } else {
        if (isSinglePasswordFile) {
          for (const d of Object.keys(adminPasswords)) {
            adminPasswords[d] = newPassword;
          }
        } else {
          adminPasswords[targetDept] = newPassword;
        }
        await writePasswords();
      }
      sessions.clear();
      return send(res, 200, { ok: true, dept: targetDept });
    }

    if (path === '/api/logout' && req.method === 'POST') {
      const match = /escala_session=([a-f0-9]{64})/.exec(req.headers.cookie || '');
      if (match && !remoteMode) sessions.delete(match[1]);
      return send(res, 200, { ok: true }, { 'Set-Cookie': 'escala_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' });
    }

    if (path === '/api/me' && req.method === 'GET') {
      const targetDept = resolveDeptId(url.searchParams.get('dept'));
      return send(res, 200, { editor: authorized(req, targetDept) });
    }

    if (path === '/api/bootstrap' && req.method === 'GET') {
      const targetDept = resolveDeptId(url.searchParams.get('dept'));
      const isEd = authorized(req, targetDept);
      const deptObj = getDept(targetDept);
      const availableDepts = Object.entries(db.departments).map(([id, d]) => ({
        id,
        name: d.name,
        title: d.title,
        columnLabel: d.columnLabel,
        authorized: authorized(req, id)
      }));
      if (!isEd) return send(res, 200, { editor: false, dept: targetDept, availableDepts });
      const key = weekStart(url.searchParams.get('week'));
      return key ? send(res, 200, {
        editor: true,
        dept: targetDept,
        deptName: deptObj.name,
        deptTitle: deptObj.title,
        columnLabel: deptObj.columnLabel,
        availableDepts,
        people: deptObj.people,
        shifts: deptObj.shifts,
        week: schedule(targetDept, key)
      }) : send(res, 400, { error: 'Semana inválida' });
    }

    if (path === '/api/version' && req.method === 'GET') return send(res, 200, { app: 'escala-hotel-titanic', version: 3, unified: true });

    if (path === '/api/public' && req.method === 'GET') {
      const targetDept = resolveDeptId(url.searchParams.get('dept'));
      const key = weekStart(url.searchParams.get('week'));
      if (!key) return send(res, 400, { error: 'Semana inválida' });
      const item = publicWeek(targetDept, key);
      if (!item) return send(res, 404, { error: 'Semana ainda não publicada' });
      const deptObj = getDept(targetDept);
      return send(res, 200, {
        ...item,
        dept: targetDept,
        deptName: deptObj.name,
        deptTitle: deptObj.title,
        columnLabel: deptObj.columnLabel,
        availableDepts: Object.entries(db.departments).map(([id, d]) => ({
          id,
          name: d.name,
          title: d.title,
          columnLabel: d.columnLabel
        }))
      });
    }

    if (path.startsWith('/api/') && !authorized(req)) return send(res, 401, { error: 'Acesso restrito' });

    if (path === '/api/data' && req.method === 'GET') {
      const targetDept = resolveDeptId(url.searchParams.get('dept'));
      if (!authorized(req, targetDept)) return send(res, 401, { error: 'Acesso restrito' });
      const deptObj = getDept(targetDept);
      return send(res, 200, { people: deptObj.people, shifts: deptObj.shifts, dept: targetDept });
    }

    if (path === '/api/data' && req.method === 'PUT') {
      const input = await bodyJson(req);
      const targetDept = resolveDeptId(input.dept || url.searchParams.get('dept'));
      if (!authorized(req, targetDept)) return send(res, 401, { error: 'Acesso restrito' });
      const people = input.people;
      const shifts = input.shifts;
      if (!Array.isArray(people) || !Array.isArray(shifts) || people.length > 100 || shifts.length > 100 || ![...people, ...shifts].every(x => typeof x === 'string' && x.trim() && x.length < 80)) return send(res, 400, { error: 'Lista inválida' });
      const deptObj = getDept(targetDept);
      deptObj.people = [...new Set(people.map(x => x.trim()))];
      deptObj.shifts = [...new Set(shifts.map(x => x.trim()))];
      await persist();
      return send(res, 200, { people: deptObj.people, shifts: deptObj.shifts, dept: targetDept });
    }

    if (path === '/api/week' && req.method === 'GET') {
      const targetDept = resolveDeptId(url.searchParams.get('dept'));
      const key = weekStart(url.searchParams.get('week'));
      return key ? send(res, 200, schedule(targetDept, key)) : send(res, 400, { error: 'Semana inválida' });
    }

    if (path === '/api/week' && req.method === 'PUT') {
      const input = await bodyJson(req);
      const targetDept = resolveDeptId(input.dept || url.searchParams.get('dept'));
      if (!authorized(req, targetDept)) return send(res, 401, { error: 'Acesso restrito' });
      const key = weekStart(input.start);
      if (!key || key !== input.start || !input.entries || typeof input.entries !== 'object' || Array.isArray(input.entries)) return send(res, 400, { error: 'Escala inválida' });
      const deptObj = getDept(targetDept);
      const entries = {};
      for (const [person, days] of Object.entries(input.entries)) {
        if (!deptObj.people.includes(person) || !days || typeof days !== 'object' || Array.isArray(days)) return send(res, 400, { error: 'Funcionário inválido' });
        entries[person] = {};
        for (const [day, value] of Object.entries(days)) {
          if (!/^[0-6]$/.test(day)) return send(res, 400, { error: 'Marcação inválida' });
          if (value !== '' && !deptObj.shifts.includes(value) && !statuses.includes(value)) {
            if (/^\d{1,2}:\d{2}[–-]\d{1,2}:\d{2}$/.test(value)) {
              deptObj.shifts.push(value);
            } else {
              return send(res, 400, { error: 'Marcação inválida' });
            }
          }
          if (value) entries[person][day] = value;
        }
      }
      const old = schedule(targetDept, key);
      deptObj.weeks[key] = { ...old, entries, updatedAt: new Date().toISOString() };
      await persist();
      return send(res, 200, deptObj.weeks[key]);
    }

    if (path === '/api/copy-week' && req.method === 'POST') {
      const input = await bodyJson(req);
      const targetDept = resolveDeptId(input.dept || url.searchParams.get('dept'));
      if (!authorized(req, targetDept)) return send(res, 401, { error: 'Acesso restrito' });
      const sourceKey = weekStart(input.source);
      const targetKey = weekStart(input.target);
      if (!sourceKey || !targetKey || sourceKey === targetKey || !['fill', 'replace'].includes(input.mode)) return send(res, 400, { error: 'Escolha semanas diferentes e uma forma de cópia.' });
      const deptObj = getDept(targetDept);
      const source = deptObj.weeks[sourceKey];
      if (!source || !Object.values(source.entries).some(days => Object.values(days).some(Boolean))) return send(res, 404, { error: 'A semana escolhida não tem escala para copiar.' });
      const target = schedule(targetDept, targetKey);
      const entries = input.mode === 'replace' ? {} : structuredClone(target.entries);
      let copiedCount = 0;
      for (const person of deptObj.people) {
        for (const [day, value] of Object.entries(source.entries[person] || {})) {
          if (!/^[0-6]$/.test(day) || (!deptObj.shifts.includes(value) && !statuses.includes(value))) continue;
          if (input.mode === 'fill' && entries[person]?.[day]) continue;
          entries[person] ||= {};
          entries[person][day] = value;
          copiedCount++;
        }
      }
      if (!copiedCount && input.mode === 'fill') return send(res, 200, { ...target, copiedCount });
      if (!copiedCount) return send(res, 404, { error: 'A semana escolhida não tem marcações atuais para copiar.' });
      deptObj.weeks[targetKey] = { ...target, entries, updatedAt: new Date().toISOString() };
      await persist();
      return send(res, 200, { ...deptObj.weeks[targetKey], copiedCount });
    }

    if (path === '/api/publish' && req.method === 'POST') {
      const input = await bodyJson(req);
      const targetDept = resolveDeptId(input.dept || url.searchParams.get('dept'));
      if (!authorized(req, targetDept)) return send(res, 401, { error: 'Acesso restrito' });
      const key = weekStart(input.start);
      const deptObj = getDept(targetDept);
      if (!key || key !== input.start || !deptObj.weeks[key]) return send(res, 400, { error: 'Salve a semana antes de publicar' });
      deptObj.weeks[key].published = true;
      deptObj.weeks[key].updatedAt = new Date().toISOString();
      await persist();
      return send(res, 200, deptObj.weeks[key]);
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
  try { db = normalizeDb(JSON.parse(await readFile(dataFile, 'utf8'))); }
  catch { db = normalizeDb({}); await persist(); }

  if (process.env.ADMIN_PASSWORD) {
    adminPasswords = { camareiras: process.env.ADMIN_PASSWORD, geral: process.env.ADMIN_PASSWORD };
    isSinglePasswordFile = true;
  } else {
    try {
      const passContent = await readFile(passwordsFile, 'utf8');
      adminPasswords = JSON.parse(passContent);
      isSinglePasswordFile = false;
    } catch {
      try {
        const rawTxt = (await readFile(passwordFile, 'utf8')).trim();
        if (rawTxt.includes(':')) {
          for (const line of rawTxt.split('\n')) {
            const parts = line.split(':').map(s => s.trim());
            if (parts.length >= 2) {
              const k = parts[0].toLowerCase();
              const v = parts[1];
              if (k.includes('camareira') || k.includes('governança')) adminPasswords.camareiras = v;
              else if (k.includes('geral') || k.includes('recepção')) adminPasswords.geral = v;
            }
          }
          isSinglePasswordFile = false;
        } else if (rawTxt) {
          adminPasswords = { camareiras: rawTxt, geral: rawTxt };
          isSinglePasswordFile = true;
        }
      } catch {
        adminPasswords = { camareiras: 'camareiras', geral: '123456' };
        await writePasswords();
      }
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) createServer(handler).listen(port, () => console.log(`Escala unificada disponível em http://localhost:${port}`));
export { handler };
