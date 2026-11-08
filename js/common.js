/* ============================================================
   Поликлиника - общие утилиты для страниц входа и приложения
   Все запросы идут на тот же origin (API Gateway :8080):
   - /api/patients, /api/doctors, /api/appointments - бизнес-API
   ============================================================ */
'use strict';

/* ---------- Утилиты ---------- */
const $ = (sel) => document.querySelector(sel);

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

let toastTimer;
function toast(msg, type = '') {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
}

function fmtDate(iso) {
  if (!iso) return '-';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

function fmtTime(t) {
  return t ? t.slice(0, 5) : '-';
}

const STATUS_RU = { PLANNED: 'Запланирован', COMPLETED: 'Завершён', CANCELLED: 'Отменён' };
const ROLE_LABELS = { admin: 'Администратор', doctor: 'Врач', patient: 'Пациент' };
const SESSION_KEY = 'clinic.session';
const LOGIN_PAGE = 'index.html';
const APP_PAGE = 'app.html';
const ADMIN_LOGIN = 'admin';
const ADMIN_PASSWORD = 'admin';

/* ---------- Сессия (общая для обеих страниц) ---------- */
function saveSession(session) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch (_) { /* ignore */ }
}

function readSession() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY));
    return saved && saved.role ? saved : null;
  } catch (_) { return null; }
}

function clearSession() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch (_) { /* ignore */ }
}

/* ---------- Обёртка над API ----------
   Ошибки сервисов приходят в JSON вида
   {timestamp, status, error, message} - message показываем пользователю. */
async function api(path, { method = 'GET', body = null } = {}) {
  const opts = { method, headers: { 'Accept': 'application/json' } };
  if (body !== null) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  let resp;
  try {
    resp = await fetch(path, opts);
  } catch (e) {
    throw { status: 0, message: 'Сервер поликлиники недоступен. Убедитесь, что система запущена, и попробуйте снова.' };
  }
  if (resp.ok) {
    if (resp.status === 204) return null;
    const ct = resp.headers.get('content-type') || '';
    return ct.includes('json') ? resp.json() : resp.text();
  }
  // Разбор ошибки: берём message из JSON либо текст как есть
  let message = `HTTP ${resp.status}`;
  let errors = null;
  try {
    const text = await resp.text();
    try {
      const data = JSON.parse(text);
      message = data.message || data.error || message;
      if (Array.isArray(data.errors)) {
        errors = data.errors.map((e) => e.defaultMessage || e.message).filter(Boolean);
      }
    } catch (_) { if (text) message = text.slice(0, 300); }
  } catch (_) { /* ignore */ }
  throw { status: resp.status, message, errors };
}

function errText(e) {
  let s = `<span class="code-chip">${e.status || '?'}</span>${esc(e.message || 'Ошибка')}`;
  if (e.errors && e.errors.length) {
    s += '<br>- ' + e.errors.map(esc).join('<br>- ');
  }
  return s;
}

function setResult(el, cls, html) {
  el.className = 'result ' + cls;
  el.innerHTML = html;
}
