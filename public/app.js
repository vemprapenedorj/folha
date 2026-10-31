import { dateKey, parseDate, startOfWeek, addDays, isoWeek, isoWeeksInYear, isoWeekStart } from './week-calendar.js';

const $ = (selector) => document.querySelector(selector);
const names = ['segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado', 'domingo'];
const labels = { folga: 'FOLGA', ferias: 'FÉRIAS', atestado: 'ATESTADO' };
const query = new URLSearchParams(location.search);
const viewing = query.has('week');
let editor = false;
let people = [];
let shifts = [];
let current = null;
let dirty = false;
let selected = startOfWeek(viewing ? query.get('week') : dateKey(new Date()));

function fmt(key, options) { return new Intl.DateTimeFormat('pt-BR', options).format(parseDate(key)); }
function notice(text, error = false) { const el = $('#message'); el.textContent = text; el.classList.toggle('error', error); }
async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || 'Erro inesperado');
  return value;
}
function showWorkspace() { $('#login').hidden = true; $('#workspace').hidden = false; document.querySelectorAll('.editor-only').forEach(el => el.hidden = !editor); }
function render() {
  $('#calendar').value = selected;
  const selectedWeek = isoWeek(selected), thisWeek = isoWeek(dateKey(new Date()));
  const weekNumber = $('#week-number');
  if (weekNumber.dataset.year !== String(selectedWeek.year)) {
    weekNumber.replaceChildren();
    for (let number = 1; number <= isoWeeksInYear(selectedWeek.year); number++) {
      const option = document.createElement('option'); option.value = String(number); option.textContent = `Semana ${String(number).padStart(2, '0')}`; weekNumber.append(option);
    }
    weekNumber.dataset.year = String(selectedWeek.year);
  }
  weekNumber.value = String(selectedWeek.number);
  $('#week-year').value = String(selectedWeek.year);
  $('#range').textContent = `SEMANA ${String(selectedWeek.number).padStart(2, '0')} / ${selectedWeek.year} · ${fmt(selected, { day: '2-digit', month: 'long' })} a ${fmt(addDays(selected, 6), { day: '2-digit', month: 'long', year: 'numeric' })}`;
  $('#today').textContent = `Semana atual · ${String(thisWeek.number).padStart(2, '0')}`;
  $('#status').textContent = current?.published ? 'Semana publicada' : 'Rascunho';
  $('#status').classList.toggle('published', Boolean(current?.published));
  $('#save').disabled = !editor;
  $('#publish').disabled = !editor;
  $('#copy').disabled = !editor;
  $('#share').disabled = !current?.published;
  $('#previous').disabled = viewing;
  $('#next').disabled = viewing;
  $('#calendar').disabled = viewing;
  weekNumber.disabled = viewing;
  $('#week-year').disabled = viewing;
  $('#today').disabled = viewing;
  const thead = $('#schedule thead');
  const tbody = $('#schedule tbody');
  thead.replaceChildren(); tbody.replaceChildren();
  const head = document.createElement('tr');
  const first = document.createElement('th'); first.textContent = 'FUNCIONÁRIO'; head.append(first);
  names.forEach((name, day) => { const th = document.createElement('th'); th.append(document.createTextNode(name.toLocaleUpperCase('pt-BR'))); const span = document.createElement('span'); span.className = 'date'; span.textContent = fmt(addDays(selected, day), { day: '2-digit', month: '2-digit' }); th.append(span); head.append(th); });
  thead.append(head);
  people.forEach(person => {
    const row = document.createElement('tr');
    const th = document.createElement('th'); th.scope = 'row'; th.textContent = person.toLocaleUpperCase('pt-BR'); row.append(th);
    names.forEach((_, day) => {
      const value = current?.entries?.[person]?.[day] || '';
      const td = document.createElement('td'); if (labels[value]) td.dataset.kind = value;
      if (editor) {
        const select = document.createElement('select');
        select.setAttribute('aria-label', `${person}, ${names[day]}, ${fmt(addDays(selected, day), { day: '2-digit', month: '2-digit' })}`);
        [['', '— Selecionar —'], ...shifts.map(x => [x, x]), ...Object.entries(labels)].forEach(([key, label]) => { const opt = document.createElement('option'); opt.value = key; opt.textContent = label; select.append(opt); });
        select.value = value;
        select.addEventListener('change', () => { current.entries[person] ||= {}; if (select.value) current.entries[person][day] = select.value; else delete current.entries[person][day]; dirty = true; render(); notice('Alterações ainda não salvas.'); });
        td.append(select);
      } else { const span = document.createElement('span'); span.textContent = labels[value] || value || '—'; td.append(span); }
      row.append(td);
    });
    tbody.append(row);
  });
}
async function loadWeek() {
  try {
    if (editor) {
      current = await api(`/api/week?week=${selected}`);
    } else {
      const value = await api(`/api/public?week=${selected}`);
      people = value.people; shifts = value.shifts; current = value;
    }
    dirty = false; render(); notice(current.published && current.updatedAt ? `Atualizada em ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(current.updatedAt))}.` : '');
  } catch (error) {
    if (viewing) { current = { start: selected, published: false, entries: {} }; people = []; shifts = []; render(); notice(error.message, true); }
    else notice(error.message, true);
  }
}
function showEditorWeek(data) {
  editor = true;
  people = data.people;
  shifts = data.shifts;
  current = data.week;
  dirty = false;
  showWorkspace();
  render();
  notice(current.published && current.updatedAt ? `Atualizada em ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(current.updatedAt))}.` : '');
}
async function setup() {
  if (viewing) { showWorkspace(); await loadWeek(); return; }
  const data = await api(`/api/bootstrap?week=${selected}`);
  if (!data.editor) { $('#login').hidden = false; return; }
  showEditorWeek(data);
}
$('#login-form').addEventListener('submit', async event => {
  event.preventDefault();
  try { const data = await api(`/api/login?week=${selected}`, { method: 'POST', body: JSON.stringify({ password: $('#password').value }) }); $('#password').value = ''; $('#login-error').textContent = ''; showEditorWeek(data); }
  catch (error) { $('#login-error').textContent = error.message; }
});
$('#previous').addEventListener('click', () => { selected = addDays(selected, -7); loadWeek(); });
$('#next').addEventListener('click', () => { selected = addDays(selected, 7); loadWeek(); });
$('#today').addEventListener('click', () => { selected = startOfWeek(dateKey(new Date())); loadWeek(); });
$('#calendar').addEventListener('change', event => { selected = startOfWeek(event.target.value); loadWeek(); });
$('#week-number').addEventListener('change', event => { selected = isoWeekStart(Number($('#week-year').value), Number(event.target.value)); loadWeek(); });
$('#week-year').addEventListener('change', event => {
  const year = Number(event.target.value);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) { notice('Escolha um ano entre 2000 e 2100.', true); render(); return; }
  const number = Math.min(Number($('#week-number').value), isoWeeksInYear(year));
  selected = isoWeekStart(year, number); loadWeek();
});
function openPasswordDialog() {
  if (dirty) return notice('Salve as alterações da escala antes de trocar a senha.', true);
  $('#password-form').reset(); $('#password-error').textContent = ''; $('#password-dialog').showModal();
}
$('#open-password-login').addEventListener('click', openPasswordDialog);
$('#open-password-editor').addEventListener('click', openPasswordDialog);
$('#close-password').addEventListener('click', () => $('#password-dialog').close());
$('#cancel-password').addEventListener('click', () => $('#password-dialog').close());
$('#password-form').addEventListener('submit', async event => {
  event.preventDefault();
  const currentPassword = $('#current-password').value, newPassword = $('#new-password').value;
  if (!/^[\p{L}\p{N}]{6,12}$/u.test(newPassword)) return $('#password-error').textContent = 'Use de 6 a 12 letras ou números, sem símbolos.';
  if (newPassword !== $('#confirm-password').value) return $('#password-error').textContent = 'A confirmação não corresponde à nova senha.';
  try {
    await api('/api/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) });
    $('#password-dialog').close();
    alert('Senha alterada. Entre novamente com a nova senha.');
    location.reload();
  } catch (error) { $('#password-error').textContent = error.message; }
});
$('#save').addEventListener('click', async () => {
  try { current = await api('/api/week', { method: 'PUT', body: JSON.stringify({ start: selected, entries: current.entries }) }); dirty = false; render(); notice('Escala salva.'); }
  catch (error) { notice(error.message, true); }
});
function updateCopyRange() {
  const source = $('#copy-source').value;
  const start = source ? startOfWeek(source) : null;
  $('#copy-source-range').textContent = start ? `Semana de ${fmt(start, { day: '2-digit', month: '2-digit' })} a ${fmt(addDays(start, 6), { day: '2-digit', month: '2-digit', year: 'numeric' })}` : '';
}
$('#copy').addEventListener('click', () => {
  if (dirty) return notice('Salve as alterações desta semana antes de copiar outra escala.', true);
  $('#copy-target').textContent = `${fmt(selected, { day: '2-digit', month: '2-digit' })} a ${fmt(addDays(selected, 6), { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
  $('#copy-source').value = addDays(selected, -7);
  $('#copy-form input[name="copy-mode"][value="fill"]').checked = true;
  $('#copy-error').textContent = '';
  updateCopyRange();
  $('#copy-dialog').showModal();
});
$('#copy-source').addEventListener('change', updateCopyRange);
$('#close-copy').addEventListener('click', () => $('#copy-dialog').close());
$('#cancel-copy').addEventListener('click', () => $('#copy-dialog').close());
$('#copy-form').addEventListener('submit', async event => {
  event.preventDefault();
  const source = $('#copy-source').value;
  if (startOfWeek(source) === selected) return $('#copy-error').textContent = 'Escolha uma semana diferente da semana atual.';
  const mode = $('#copy-form input[name="copy-mode"]:checked').value;
  try {
    const result = await api('/api/copy-week', { method: 'POST', body: JSON.stringify({ source, target: selected, mode }) });
    current = result; dirty = false; render(); $('#copy-dialog').close();
    notice(result.copiedCount ? `${result.copiedCount} marcações copiadas. ${result.published ? 'O link publicado já mostra a atualização.' : 'Revise a escala antes de publicar.'}` : 'Não havia dias vazios para preencher; a escala atual foi mantida.');
  } catch (error) {
    $('#copy-error').textContent = error.message === 'Não encontrado'
      ? 'O servidor está usando a versão anterior do app. Feche a janela do servidor, abra Iniciar Escala.cmd novamente e atualize esta página.'
      : error.message;
  }
});
$('#publish').addEventListener('click', async () => {
  try { current = await api('/api/week', { method: 'PUT', body: JSON.stringify({ start: selected, entries: current.entries }) }); current = await api('/api/publish', { method: 'POST', body: JSON.stringify({ start: selected }) }); dirty = false; render(); notice('Semana publicada. O link mostra esta versão.'); }
  catch (error) { notice(error.message, true); }
});
$('#share').addEventListener('click', async () => {
  const link = `${location.origin}/?week=${selected}`;
  try { await navigator.clipboard.writeText(link); notice('Link de visualização copiado.'); }
  catch { notice(`Copie o link: ${link}`); }
});
$('#logout').addEventListener('click', async () => { await api('/api/logout', { method: 'POST' }); location.reload(); });
$('#manage').addEventListener('click', () => { $('#people-list').value = people.join('\n'); $('#shifts-list').value = shifts.join('\n'); $('#manage-dialog').showModal(); });
$('#manage-dialog').addEventListener('close', async () => {
  if ($('#manage-dialog').returnValue !== 'save') return;
  const nextPeople = $('#people-list').value.split('\n').map(x => x.trim()).filter(Boolean);
  const nextShifts = $('#shifts-list').value.split('\n').map(x => x.trim()).filter(Boolean);
  try { const data = await api('/api/data', { method: 'PUT', body: JSON.stringify({ people: nextPeople, shifts: nextShifts }) }); people = data.people; shifts = data.shifts; render(); notice('Listas atualizadas.'); }
  catch (error) { notice(error.message, true); }
});
$('#pdf').addEventListener('click', () => window.print());
$('#png').addEventListener('click', () => {
  const scale = 2, cw = 178, nw = 230, rh = 50, hh = 136, width = nw + cw * 7, height = hh + rh * people.length + 52;
  const canvas = document.createElement('canvas'); canvas.width = width * scale; canvas.height = height * scale;
  const ctx = canvas.getContext('2d'); ctx.scale(scale, scale); ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#023441'; ctx.fillRect(0, 0, width, hh); ctx.fillStyle = '#ffffff'; ctx.font = 'bold 24px Georgia'; ctx.fillText('HOTEL TITANIC', 20, 34); ctx.font = '14px Arial'; ctx.fillText(`Escala semanal · ${$('#range').textContent}`, 20, 66);
  names.forEach((name, day) => { const x = nw + cw * day + 9; ctx.font = 'bold 14px Arial'; ctx.fillText(name.toLocaleUpperCase('pt-BR'), x, 102); ctx.font = 'bold 14px Arial'; ctx.fillText(fmt(addDays(selected, day), { day: '2-digit', month: '2-digit' }), x, 123); });
  people.forEach((person, r) => {
    const y = hh + r * rh;
    ctx.fillStyle = '#f5f6f4'; ctx.fillRect(0, y, nw, rh);
    ctx.fillStyle = '#18313a'; ctx.font = 'bold 16px Arial'; ctx.fillText(person.toLocaleUpperCase('pt-BR'), 15, y + rh / 2);
    names.forEach((_, day) => {
      const x = nw + cw * day, value = current?.entries?.[person]?.[day] || '';
      ctx.fillStyle = value === 'folga' ? '#cfe7d2' : value === 'ferias' ? '#f6dcab' : value === 'atestado' ? '#f3cbc2' : '#ffffff'; ctx.fillRect(x, y, cw, rh);
      ctx.fillStyle = value === 'folga' ? '#255a39' : value === 'ferias' ? '#80551d' : value === 'atestado' ? '#8c392c' : '#18313a';
      ctx.font = labels[value] ? 'bold 15px Arial' : '14px Arial'; ctx.fillText(labels[value] || value || '—', x + 9, y + rh / 2);
    });
  });
  ctx.strokeStyle = '#a5b8aa'; ctx.lineWidth = 1;
  for (let r = 0; r <= people.length; r++) { const y = hh + r * rh + .5; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
  for (let d = 0; d <= 7; d++) { const x = nw + d * cw + .5; ctx.beginPath(); ctx.moveTo(x, hh); ctx.lineTo(x, hh + rh * people.length); ctx.stroke(); }
  ctx.fillStyle = '#596c71'; ctx.font = '12px Arial'; ctx.fillText('Horários planejados · Hotel Titanic Penedo', 15, height - 22);
  const link = document.createElement('a'); link.download = `escala-${selected}.png`; link.href = canvas.toDataURL('image/png'); link.click(); notice('Imagem baixada.');
});
if (location.protocol === 'file:') $('#file-warning').hidden = false;
else setup().catch(error => { $('#login').hidden = false; $('#login-error').textContent = error.message; });
