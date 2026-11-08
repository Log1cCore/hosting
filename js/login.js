/* ============================================================
   Поликлиника - страница входа (index.html)
   После успешного входа выполняется переход на app.html.
   Вход раздельный: администратор (логин/пароль), врач и пациент
   (выбор себя из списка).
   ============================================================ */
'use strict';

/* ---------- Состояние (только справочники для входа) ---------- */
const state = { patients: [], doctors: [], session: null };
const patientById = (id) => state.patients.find((p) => p.id === id);
const doctorById = (id) => state.doctors.find((d) => d.id === id);

/* ---------- Загрузка справочников ---------- */
async function loadPatients({ silent = false } = {}) {
  try {
    state.patients = await api('/api/patients') || [];
    populatePatientSelects();
    return true;
  } catch (e) {
    if (!silent) toast('Не удалось загрузить пациентов: ' + (e.message || ''), 'err');
    return false;
  }
}

async function loadDoctors({ silent = false } = {}) {
  try {
    state.doctors = await api('/api/doctors') || [];
    populateDoctorSelects();
    return true;
  } catch (e) {
    if (!silent) toast('Не удалось загрузить врачей: ' + (e.message || ''), 'err');
    return false;
  }
}

async function loadAllReference({ silent = true } = {}) {
  const results = await Promise.all([loadPatients({ silent }), loadDoctors({ silent })]);
  return results.every(Boolean);
}

/* ================= ВХОД ПО РОЛЯМ ================= */
function setLoginRole(role) {
  document.querySelectorAll('.login-role').forEach((b) =>
    b.classList.toggle('active', b.dataset.role === role));
  $('#login-admin-form').classList.toggle('hidden', role !== 'admin');
  $('#login-doctor-form').classList.toggle('hidden', role !== 'doctor');
  $('#login-patient-form').classList.toggle('hidden', role !== 'patient');
  hideLoginError();
}

function showLoginError(html) {
  const box = $('#login-error');
  box.innerHTML = html;
  box.classList.remove('hidden');
}

function hideLoginError() {
  $('#login-error').classList.add('hidden');
}

function fillLoginSelects() {
  const mk = (list) => '<option value="" disabled selected>- выберите себя -</option>' +
    list.map((x) => `<option value="${x.id}">${esc(x.fullName)}${x.specialty ? ' - ' + esc(x.specialty) : ''}</option>`).join('');
  $('#lg-doctor').innerHTML = mk(state.doctors);
  $('#lg-patient').innerHTML = mk(state.patients);
}

function populatePatientSelects() {
  $('#lg-patient').innerHTML = '<option value="" disabled selected>- выберите себя -</option>' +
    state.patients.map((p) => `<option value="${p.id}">${esc(p.fullName)}</option>`).join('');
}

function populateDoctorSelects() {
  $('#lg-doctor').innerHTML = '<option value="" disabled selected>- выберите себя -</option>' +
    state.doctors.map((d) => `<option value="${d.id}">${esc(d.fullName)}${d.specialty ? ' - ' + esc(d.specialty) : ''}</option>`).join('');
}

async function loadReferenceForLogin() {
  const note = $('#login-load-note');
  const reload = $('#login-reload');
  reload.classList.add('hidden');
  note.textContent = 'Загрузка справочников...';
  hideLoginError();
  const ok = await loadAllReference({ silent: true });
  if (ok) {
    fillLoginSelects();
    if (!state.doctors.length && !state.patients.length) {
      note.innerHTML = 'Справочники пусты: сначала войдите как <b>администратор</b> и добавьте врачей и пациентов.';
    } else {
      note.textContent = 'Списки загружены - выберите вкладку и войдите.';
    }
  } else {
    note.textContent = 'Не удалось получить списки врачей и пациентов.';
    reload.classList.remove('hidden');
    showLoginError('Сервер поликлиники недоступен. Запустите сервисы (см. README, раздел "Запуск") и нажмите "Обновить списки".');
  }
}

function initLogin() {
  document.querySelectorAll('.login-role').forEach((btn) =>
    btn.addEventListener('click', () => setLoginRole(btn.dataset.role)));

  $('#login-admin-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const login = $('#lg-user').value.trim();
    const pass = $('#lg-pass').value;
    if (login !== ADMIN_LOGIN || pass !== ADMIN_PASSWORD) {
      showLoginError('Неверный логин или пароль администратора.');
      return;
    }
    doLogin({ role: 'admin', id: null, name: 'Администратор' });
  });

  $('#login-doctor-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const id = Number($('#lg-doctor').value);
    const me = doctorById(id);
    if (!me) { showLoginError('Выберите врача из списка.'); return; }
    doLogin({ role: 'doctor', id, name: me.fullName });
  });

  $('#login-patient-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const id = Number($('#lg-patient').value);
    const me = patientById(id);
    if (!me) { showLoginError('Выберите пациента из списка.'); return; }
    doLogin({ role: 'patient', id, name: me.fullName });
  });

  $('#login-reload').addEventListener('click', loadReferenceForLogin);
}

function doLogin(session) {
  saveSession(session);
  // Переход на отдельную страницу приложения
  window.location.replace(APP_PAGE);
}

/* ---------- Старт ---------- */
document.addEventListener('DOMContentLoaded', async () => {
  // Уже вошли - сразу на страницу приложения, без повторного входа
  if (readSession()) {
    window.location.replace(APP_PAGE);
    return;
  }

  initLogin();

  // Справочники нужны для входа врача и пациента (выбор себя из списка)
  await loadAllReference({ silent: true });
  fillLoginSelects();
  const ok = state.doctors.length || state.patients.length;
  $('#login-load-note').textContent = ok
    ? 'Списки загружены - выберите вкладку и войдите.'
    : 'Не удалось получить списки врачей и пациентов.';
  $('#login-reload').classList.toggle('hidden', !!ok);
  if (!ok) {
    showLoginError('Сервер поликлиники недоступен. Запустите сервисы (см. README, раздел "Запуск") и нажмите "Обновить списки".');
  }
});
