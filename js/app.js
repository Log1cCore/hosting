/* ============================================================
   Поликлиника - страница приложения (app.html)
   Доступна только после входа: если сессии нет, выполняется
   переход обратно на index.html. Выход тоже возвращает на
   страницу входа.
   ============================================================ */
'use strict';

/* ---------- Состояние ---------- */
const state = { patients: [], doctors: [], appts: [], session: null };
const patientById = (id) => state.patients.find((p) => p.id === id);
const doctorById = (id) => state.doctors.find((d) => d.id === id);

/* ---------- Загрузка справочников ---------- */
async function loadPatients({ silent = false } = {}) {
  try {
    state.patients = await api('/api/patients') || [];
    renderPatients();
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
    renderDoctors($('#doc-filter').value.trim());
    populateDoctorSelects();
    if (state.session && state.session.role === 'doctor') renderDoctorStatus();
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

/* ---------- Вкладки ---------- */
function activateTab(name) {
  const btn = document.querySelector(`#tabs .tab[data-tab="${name}"]:not(.hidden)`);
  if (!btn) return;
  document.querySelectorAll('#tabs .tab').forEach((t) => t.classList.toggle('active', t === btn));
  document.querySelectorAll('.tab-page').forEach((p) =>
    p.classList.toggle('active', p.id === 'tab-' + name));
  if (name === 'history') loadAppointments();
}

function initTabs() {
  $('#tabs').addEventListener('click', (ev) => {
    const btn = ev.target.closest('.tab');
    if (!btn || btn.classList.contains('hidden')) return;
    activateTab(btn.dataset.tab);
  });
}

/* ================= ВХОД / ВЫХОД ================= */
function enterApp() {
  const s = state.session;
  if (!s) return;

  document.body.classList.remove('role-admin', 'role-doctor', 'role-patient');
  document.body.classList.add('role-' + s.role);

  $('#userName').textContent = s.name;
  $('#userRole').textContent = ROLE_LABELS[s.role] || s.role;

  applyRoleUI();
  activateTab(s.role === 'doctor' ? 'history' : 'booking');
  toast(`Добро пожаловать, ${s.name}!`, 'ok');
}

function logout() {
  clearSession();
  // Возврат на страницу входа
  window.location.replace(LOGIN_PAGE);
}

/* Подстройка интерфейса под роль */
function applyRoleUI() {
  const role = state.session.role;

  // Показываем только разрешённые вкладки
  document.querySelectorAll('#tabs .tab').forEach((btn) => {
    const roles = (btn.dataset.roles || '').split(',');
    btn.classList.toggle('hidden', !roles.includes(role));
  });

  // Заголовок и подсказка раздела записей (и подпись самой вкладки)
  const headings = { admin: 'Все записи', doctor: 'Моё расписание', patient: 'Мои записи' };
  $('#ap-heading').textContent = headings[role] || 'Записи';
  const tabLabels = { admin: 'Все записи', doctor: 'Моё расписание', patient: 'Мои записи' };
  const histBtn = document.querySelector('#tabs .tab[data-tab="history"]');
  if (histBtn) histBtn.textContent = tabLabels[role] || 'Записи';
  const hints = {
    admin: 'Полный список талонов. Используйте фильтры, чтобы найти нужную запись.',
    doctor: 'Ваши приёмы. Если пациент не может прийти, отметьте себя недоступным - запись к вам закроется.',
    patient: 'Ваши записи к врачам.'
  };
  $('#ap-hint').textContent = hints[role] || '';

  // Форма записи: пациент записывается "на себя".
  // Важно: скрытый required-select блокирует отправку формы
  // (HTML5-валидация не может сфокусировать невидимый элемент),
  // поэтому для пациента select отключаем и required снимаем.
  const isPatient = role === 'patient';
  $('#bk-patient-label').classList.toggle('hidden', isPatient);
  $('#bk-patient-fixed').classList.toggle('hidden', !isPatient);
  $('#bk-patient').disabled = isPatient;
  if (isPatient) {
    $('#bk-patient').required = false;
    $('#bk-patient-fixed').innerHTML = `<b>Пациент:</b> ${esc(state.session.name)} - запись оформляется на вас`;
  } else {
    $('#bk-patient').required = true;
  }

  // Карточка статуса приёма врача
  if (role === 'doctor') renderDoctorStatus();
}

/* ================= ВРАЧИ ================= */
function renderDoctors(filter) {
  const list = $('#doc-list');
  const f = (filter || '').toLowerCase();
  const doctors = f
    ? state.doctors.filter((d) => (d.specialty || '').toLowerCase().includes(f))
    : state.doctors;
  $('#doc-count').textContent = doctors.length
    ? `${doctors.length} из ${state.doctors.length}`
    : '';

  if (!state.doctors.length) {
    list.innerHTML = '<div class="empty-note">Список врачей пуст - попросите администратора добавить врачей.</div>';
    return;
  }
  if (!doctors.length) {
    list.innerHTML = `<div class="empty-note">Врачи по специальности "${esc(filter)}" не найдены.</div>`;
    return;
  }

  list.innerHTML = doctors.map((d) => `
    <div class="doc-card ${d.isAvailable ? '' : 'off'}">
      <div class="doc-name">${esc(d.fullName)}</div>
      <span class="badge spec">${esc(d.specialty || '-')}</span>
      <span class="badge ${d.isAvailable ? 'up' : 'off'}">${d.isAvailable ? 'Принимает' : 'Не принимает'}</span>
      <div class="doc-meta">Кабинет: ${esc(d.cabinetNumber || '-')} - Тел: ${esc(d.phone || '-')}</div>
      <button class="btn ghost admin-only" data-toggle="${d.id}" data-cur="${d.isAvailable ? '1' : '0'}">
        ${d.isAvailable ? 'Отметить недоступным' : 'Вернуть на приём'}
      </button>
    </div>`).join('');
}

/* Карточка "Мой статус" в расписании врача */
function renderDoctorStatus() {
  const box = $('#doctor-status');
  if (!box) return;
  const me = doctorById(state.session && state.session.id);
  if (!me) { box.classList.add('hidden'); box.innerHTML = ''; return; }
  box.classList.remove('hidden');
  box.innerHTML = `
    <div class="status-row">
      <div>
        <div class="doc-name">${esc(me.fullName)} - ${esc(me.specialty || '')}</div>
        <div class="doc-meta">Кабинет: ${esc(me.cabinetNumber || '-')} -
          ${me.isAvailable ? 'Вы принимаете пациентов' : 'Вы отмечены недоступным: запись к вам закрыта'}</div>
      </div>
      <button class="btn ghost" data-toggle="${me.id}" data-cur="${me.isAvailable ? '1' : '0'}">
        ${me.isAvailable ? 'Отметить недоступным' : 'Вернуться на приём'}
      </button>
    </div>`;
}

async function toggleDoctorAvailability(id, cur) {
  const next = cur === '1' ? false : true;
  const d = doctorById(Number(id));
  try {
    await api(`/api/doctors/${id}/availability?available=${next}`, { method: 'PATCH' });
    toast(next
      ? `Врач ${d ? d.fullName : id} снова принимает`
      : `Врач ${d ? d.fullName : id} отмечен недоступным - запись к нему закрыта`,
      next ? 'ok' : '');
    await loadDoctors();
  } catch (e) {
    toast('Не удалось изменить доступность: ' + (e.message || ''), 'err');
  }
}

function initDoctorsTab() {
  $('#doc-refresh').addEventListener('click', () => loadDoctors({ silent: false }));
  $('#doc-filter').addEventListener('input', () => renderDoctors($('#doc-filter').value.trim()));
  $('#doc-list').addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-toggle]');
    if (btn) toggleDoctorAvailability(btn.dataset.toggle, btn.dataset.cur);
  });
  $('#doctor-status').addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-toggle]');
    if (btn) toggleDoctorAvailability(btn.dataset.toggle, btn.dataset.cur);
  });
  $('#doctorForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const payload = {
      fullName: $('#dr-name').value.trim(),
      specialty: $('#dr-spec').value.trim(),
      cabinetNumber: $('#dr-cab').value.trim() || null,
      phone: $('#dr-phone').value.trim() || null
    };
    const res = $('#dr-result');
    try {
      const saved = await api('/api/doctors', { method: 'POST', body: payload });
      setResult(res, 'ok', `Врач добавлен (id=${saved.id}). Теперь он появится в списке и сможет войти в свой кабинет.`);
      ev.target.reset();
      toast('Врач добавлен', 'ok');
      await loadDoctors();
    } catch (e) {
      setResult(res, 'err', errText(e));
    }
  });
}

/* ================= ПАЦИЕНТЫ ================= */
function renderPatients() {
  const tb = $('#pat-table tbody');
  $('#pat-count').textContent = state.patients.length ? String(state.patients.length) : '';
  if (!state.patients.length) {
    tb.innerHTML = '<tr><td colspan="6" class="empty-note">Пациентов пока нет - зарегистрируйте первого ниже.</td></tr>';
    return;
  }
  tb.innerHTML = state.patients.map((p) => `
    <tr>
      <td>${p.id}</td>
      <td><b>${esc(p.fullName)}</b></td>
      <td>${fmtDate(p.birthDate)}</td>
      <td>${esc(p.policyNumber || '-')}</td>
      <td>${esc(p.email || '-')}</td>
      <td>${esc(p.phone || '-')}</td>
    </tr>`).join('');
}

function populatePatientSelects() {
  const options = state.patients.map((p) =>
    `<option value="${p.id}">${esc(p.fullName)} (полис ${esc(p.policyNumber || '-')})</option>`);
  $('#bk-patient').innerHTML = '<option value="" disabled selected>- выберите пациента -</option>' + options.join('');
  $('#ap-filter-patient').innerHTML = '<option value="">Все пациенты</option>' +
    state.patients.map((p) => `<option value="${p.id}">${esc(p.fullName)}</option>`).join('');
}

function initPatientsTab() {
  $('#pat-refresh').addEventListener('click', () => loadPatients({ silent: false }));
  $('#patientForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const payload = {
      fullName: $('#pt-name').value.trim(),
      birthDate: $('#pt-birth').value || null,
      policyNumber: $('#pt-policy').value.trim(),
      email: $('#pt-email').value.trim() || null,
      phone: $('#pt-phone').value.trim() || null
    };
    const res = $('#pt-result');
    try {
      const saved = await api('/api/patients', { method: 'POST', body: payload });
      setResult(res, 'ok', `Пациент зарегистрирован (id=${saved.id}). Теперь он может войти как пациент и записаться к врачу.`);
      ev.target.reset();
      toast('Пациент зарегистрирован', 'ok');
      await loadPatients();
    } catch (e) {
      setResult(res, 'err', errText(e) +
        (e.status === 500 ? '<br><small>Частая причина: такой номер полиса уже существует (поле policyNumber уникальное).</small>' : ''));
    }
  });
}

/* ================= ЗАПИСЬ НА ПРИЁМ ================= */
function populateDoctorSelects() {
  const opts = state.doctors.map((d) =>
    `<option value="${d.id}">${d.isAvailable ? '' : '[не принимает] '}${esc(d.fullName)} - ${esc(d.specialty || '')}</option>`);
  $('#bk-doctor').innerHTML = '<option value="" disabled selected>- выберите врача -</option>' + opts.join('');
  $('#ap-filter-doctor').innerHTML = '<option value="">Все врачи</option>' +
    state.doctors.map((d) => `<option value="${d.id}">${esc(d.fullName)} - ${esc(d.specialty || '')}</option>`).join('');
}

function initBookingTab() {
  const dateInput = $('#bk-date');
  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
  dateInput.min = tomorrow.toISOString().slice(0, 10);
  dateInput.value = dateInput.min; // по умолчанию завтра (дата должна быть в будущем)

  $('#bookingForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = $('#bk-submit');
    const res = $('#bk-result');
    const payload = {
      patientId: state.session && state.session.role === 'patient'
        ? state.session.id
        : Number($('#bk-patient').value),
      doctorId: Number($('#bk-doctor').value),
      appointmentDate: $('#bk-date').value,
      appointmentTime: $('#bk-time').value,
      reason: $('#bk-reason').value.trim()
    };
    if (!payload.patientId || !payload.doctorId) {
      setResult(res, 'warn', 'Выберите пациента и врача.');
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Оформляем запись...';
    try {
      const saved = await api('/api/appointments', { method: 'POST', body: payload });
      const p = patientById(saved.patientId);
      const d = doctorById(saved.doctorId);
      setResult(res, 'ok',
        `Талон подтверждён\n\n` +
        `Талон № ${saved.id}\n` +
        `Пациент: ${esc(p ? p.fullName : saved.patientId)}\n` +
        `Врач: ${esc(d ? d.fullName : saved.doctorId)}${d && d.specialty ? ' - ' + esc(d.specialty) : ''}\n` +
        `Когда: ${fmtDate(saved.appointmentDate)} в ${fmtTime(saved.appointmentTime)}\n` +
        `Причина: ${esc(saved.reason)}\n` +
        `Статус: ${STATUS_RU[saved.status] || saved.status}\n\n` +
        `Талон сохранён - он появится в вашем списке записей.`);
      toast('Запись оформлена', 'ok');
      ev.target.reset();
      dateInput.value = dateInput.min;
      $('#bk-time').value = '09:00';
      loadAppointments();
    } catch (e) {
      let extra = '';
      if (e.status === 503) extra = '\n\nСистема поликлиники временно не может проверить запись. Попробуйте повторить через минуту.';
      if (e.status === 409) extra = '\n\nЭтот врач сейчас не принимает. Выберите другого врача или попробуйте позже.';
      if (e.status === 404) extra = '\n\nПациент или врач не найдены. Проверьте выбор в форме.';
      setResult(res, 'err', errText(e) + extra);
      toast('Не удалось оформить запись', 'err');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Записать';
    }
  });
}

/* ================= ЗАПИСИ (история / расписание / мои записи) ================= */
function renderHistory(appts) {
  const tb = $('#ap-table tbody');
  const empty = $('#ap-empty');
  $('#ap-count').textContent = appts.length ? String(appts.length) : '';
  empty.classList.toggle('hidden', appts.length > 0);
  if (!appts.length) { tb.innerHTML = ''; return; }

  const statusCls = { PLANNED: 'up', COMPLETED: 'spec', CANCELLED: 'off' };
  tb.innerHTML = appts.map((a) => {
    const p = patientById(a.patientId);
    const d = doctorById(a.doctorId);
    return `
      <tr>
        <td>${a.id}</td>
        <td>${fmtDate(a.appointmentDate)}</td>
        <td>${fmtTime(a.appointmentTime)}</td>
        <td>${esc(p ? p.fullName : '-')}</td>
        <td>${esc(d ? d.fullName + ' - ' + (d.specialty || '') : '-')}</td>
        <td>${esc(a.reason || '-')}</td>
        <td><span class="badge ${statusCls[a.status] || 'spec'}">${esc(STATUS_RU[a.status] || a.status || '-')}</span></td>
      </tr>`;
  }).join('');
}

async function loadAppointments() {
  if (!state.session) return; // до входа записи не показываем
  const role = state.session.role;
  let qs = '';
  if (role === 'doctor' && state.session.id) {
    qs = '?doctorId=' + state.session.id;
  } else if (role === 'patient' && state.session.id) {
    qs = '?patientId=' + state.session.id;
  } else {
    // Администратор может фильтровать вручную
    const pid = $('#ap-filter-patient').value;
    const did = $('#ap-filter-doctor').value;
    const params = [];
    if (pid) params.push('patientId=' + pid);
    if (did) params.push('doctorId=' + did);
    if (params.length) qs = '?' + params.join('&');
  }
  try {
    state.appts = await api('/api/appointments' + qs) || [];
    renderHistory(state.appts);
  } catch (e) {
    toast('Не удалось загрузить записи: ' + (e.message || ''), 'err');
  }
}

function initHistoryTab() {
  $('#ap-refresh').addEventListener('click', loadAppointments);
  $('#ap-filter-patient').addEventListener('change', loadAppointments);
  $('#ap-filter-doctor').addEventListener('change', loadAppointments);
}

/* ---------- Старт ---------- */
document.addEventListener('DOMContentLoaded', async () => {
  // Защита страницы: без действующей сессии - на страницу входа
  const saved = readSession();
  const valid = saved && (
    saved.role === 'admin' ||
    (saved.role === 'doctor' && typeof saved.id === 'number') ||
    (saved.role === 'patient' && typeof saved.id === 'number'));
  if (!valid) {
    clearSession();
    window.location.replace(LOGIN_PAGE);
    return;
  }
  state.session = saved;

  initTabs();
  initDoctorsTab();
  initPatientsTab();
  initBookingTab();
  initHistoryTab();
  $('#btnLogout').addEventListener('click', logout);

  // Интерфейс под роль настраиваем сразу, данные подгрузятся следом
  enterApp();

  // Справочники для работы сайта
  await loadAllReference({ silent: true });
  if (state.session.role === 'doctor') renderDoctorStatus();
  if (document.querySelector('#tab-history.active')) loadAppointments();
});
