/* GATEID v2 – full feature set */
(function () {
  'use strict';
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => [...(el || document).querySelectorAll(s)];

  const KEYS = {
    users: 'gateid_v2_users',
    sites: 'gateid_v2_sites',
    trucks: 'gateid_v2_trucks',
    logs: 'gateid_v2_logs',
    session: 'gateid_v2_session',
    settings: 'gateid_v2_settings',
    currentSite: 'gateid_v2_site',
    shiftLocked: 'gateid_v2_shiftlock'
  };

  const DEFAULTS = {
    users: [
      { id: 'u1', username: 'admin', password: 'admin123', name: 'System Admin', role: 'admin', sites: ['*'], active: true },
      { id: 'u2', username: 'operator', password: 'op123', name: 'Gate Operator', role: 'operator', sites: ['s1', 's2'], active: true },
      { id: 'u3', username: 'viewer', password: 'view123', name: 'Office Viewer', role: 'viewer', sites: ['s1', 's2'], active: true }
    ],
    sites: [
      { id: 's1', name: 'North Quarry – Main Gate', code: 'NQ-MAIN', location: 'North Pit', active: true },
      { id: 's2', name: 'South Aggregate – Scale', code: 'SA-SCALE', location: 'South Yard', active: true },
      { id: 's3', name: 'East Sand Pit – Exit', code: 'ES-EXIT', location: 'East Road', active: true }
    ],
    trucks: [
      { id: 't1', plate: 'ABC1234', unit: 'T-101', company: 'Rock Haulers LLC', driver: 'John Smith', tare: 28500, notes: 'Tri-axle' },
      { id: 't2', plate: 'XYZ9876', unit: 'T-205', company: 'Stone Transport', driver: 'Maria Lopez', tare: 31200, notes: '' },
      { id: 't3', plate: 'DEF4567', unit: 'U-88', company: 'Quarry Express', driver: 'Mike Chen', tare: 26800, notes: 'End dump' }
    ],
    settings: {
      name: 'GATEID',
      materials: ['#57 Stone', '3/4" Gravel', 'Sand', 'Class 2 Base', 'Rip Rap', 'Fill Dirt', 'Crushed Concrete'],
      defaultDir: 'IN',
      warnUnknown: true
    }
  };

  let state = {
    user: null, users: [], sites: [], trucks: [], logs: [], settings: {},
    currentSiteId: null, stream: null, autoTimer: null,
    lastPlate: null, lastPlateAt: 0, pendingPhoto: null, lastSavedLog: null,
    shiftLocked: false
  };

  function load(k, fb) {
    try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : fb; } catch { return fb; }
  }
  function save(k, d) { localStorage.setItem(k, JSON.stringify(d)); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function toast(msg, err) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.toggle('err', !!err);
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 2800);
  }
  function today() { return new Date().toISOString().slice(0, 10); }
  function nowTime() { return new Date().toTimeString().slice(0, 8); }
  function normPlate(p) { return (p || '').toUpperCase().replace(/[\s\-]/g, ''); }
  function isKnownPlate(plate) {
    const n = normPlate(plate);
    return state.trucks.some((t) => normPlate(t.plate) === n);
  }
  function canEdit() {
    return state.user && state.user.role !== 'viewer' && !state.shiftLocked;
  }

  /* INIT */
  function init() {
    if (!localStorage.getItem(KEYS.users)) save(KEYS.users, DEFAULTS.users);
    if (!localStorage.getItem(KEYS.sites)) save(KEYS.sites, DEFAULTS.sites);
    if (!localStorage.getItem(KEYS.trucks)) save(KEYS.trucks, DEFAULTS.trucks);
    if (!localStorage.getItem(KEYS.logs)) save(KEYS.logs, []);
    if (!localStorage.getItem(KEYS.settings)) save(KEYS.settings, DEFAULTS.settings);

    state.users = load(KEYS.users, DEFAULTS.users);
    state.sites = load(KEYS.sites, DEFAULTS.sites);
    state.trucks = load(KEYS.trucks, DEFAULTS.trucks);
    state.logs = load(KEYS.logs, []);
    state.settings = load(KEYS.settings, DEFAULTS.settings);
    state.shiftLocked = !!load(KEYS.shiftLocked, false);

    const session = load(KEYS.session, null);
    if (session) {
      const u = state.users.find((x) => x.id === session.userId && x.active);
      if (u) {
        state.user = u;
        state.currentSiteId = load(KEYS.currentSite, state.sites[0]?.id);
        showMain();
        return;
      }
    }
    showLogin();
  }

  function showLogin() {
    $('#screen-login').classList.remove('hidden');
    $('#screen-main').classList.add('hidden');
    stopCamera();
  }

  function showMain() {
    $('#screen-login').classList.add('hidden');
    $('#screen-main').classList.remove('hidden');
    $('#user-chip').textContent = state.user.name + ' (' + state.user.role + ')';
    applySettings();
    updateSitePill();
    updateShiftBadge();
    $('#tab-users').classList.toggle('hidden', state.user.role !== 'admin');
    if (state.user.role === 'viewer') {
      $('#btn-start-cam').disabled = true;
      $('#btn-capture').disabled = true;
      $('#auto-detect').disabled = true;
      $('#btn-add-truck').style.display = 'none';
      $('#btn-add-site').style.display = 'none';
    } else {
      $('#btn-add-truck').style.display = '';
      $('#btn-add-site').style.display = '';
    }
    $('#report-date').value = today();
    renderAll();
  }

  function doLogin(e) {
    e.preventDefault();
    const user = $('#login-user').value.trim().toLowerCase();
    const pass = $('#login-pass').value;
    const found = state.users.find((u) => u.username.toLowerCase() === user && u.password === pass && u.active);
    if (!found) { toast('Invalid username or password', true); return; }
    state.user = found;
    save(KEYS.session, { userId: found.id });
    const allowed = found.sites.includes('*') ? state.sites : state.sites.filter((s) => found.sites.includes(s.id));
    state.currentSiteId = allowed[0]?.id || state.sites[0]?.id;
    save(KEYS.currentSite, state.currentSiteId);
    showMain();
    toast('Welcome, ' + found.name);
  }

  function doLogout() {
    stopCamera();
    state.user = null;
    save(KEYS.session, null);
    $('#login-user').value = '';
    $('#login-pass').value = '';
    showLogin();
  }

  function switchTab(name) {
    $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
    $$('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + name));
    if (name === 'log') renderLog();
    if (name === 'trucks') renderTrucks();
    if (name === 'sites') renderSites();
    if (name === 'users') renderUsers();
    if (name === 'dash') renderDash();
    if (name === 'settings') loadSettingsForm();
    if (name === 'reports') { /* ready */ }
  }

  function applySettings() {
    const n = state.settings.name || 'GATEID';
    $('#brand-name').textContent = n;
    $('#app-title').textContent = n;
    document.title = n;
    const dl = $('#mat-dl');
    if (dl) dl.innerHTML = (state.settings.materials || []).map((m) => '<option value="' + esc(m) + '">').join('');
    const wu = $('#warn-unknowns');
    if (wu) wu.checked = state.settings.warnUnknown !== false;
  }

  function loadSettingsForm() {
    $('#set-name').value = state.settings.name || 'GATEID';
    $('#set-materials').value = (state.settings.materials || []).join('\n');
    $('#set-dir').value = state.settings.defaultDir || 'IN';
    $('#set-warn-unknown').checked = state.settings.warnUnknown !== false;
  }

  function saveSettings() {
    state.settings.name = $('#set-name').value.trim() || 'GATEID';
    state.settings.materials = $('#set-materials').value.split('\n').map((s) => s.trim()).filter(Boolean);
    state.settings.defaultDir = $('#set-dir').value;
    state.settings.warnUnknown = $('#set-warn-unknown').checked;
    save(KEYS.settings, state.settings);
    applySettings();
    toast('Settings saved');
  }

  function resetDemo() {
    if (!confirm('Reset ALL data to demo?')) return;
    save(KEYS.users, DEFAULTS.users);
    save(KEYS.sites, DEFAULTS.sites);
    save(KEYS.trucks, DEFAULTS.trucks);
    save(KEYS.logs, []);
    save(KEYS.settings, DEFAULTS.settings);
    save(KEYS.shiftLocked, false);
    state.users = DEFAULTS.users.slice();
    state.sites = DEFAULTS.sites.slice();
    state.trucks = DEFAULTS.trucks.slice();
    state.logs = [];
    state.settings = Object.assign({}, DEFAULTS.settings);
    state.shiftLocked = false;
    applySettings();
    updateShiftBadge();
    renderAll();
    toast('Demo data restored');
  }

  /* CAMERA */
  async function startCamera() {
    try {
      state.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
        audio: false
      });
      $('#video').srcObject = state.stream;
      $('#cam-overlay').classList.add('hidden');
      $('#btn-start-cam').classList.add('hidden');
      $('#btn-stop-cam').classList.remove('hidden');
      toast('Camera started');
    } catch (err) {
      toast('Camera error: ' + (err.message || 'denied'), true);
    }
  }

  function stopCamera() {
    if (state.stream) { state.stream.getTracks().forEach((t) => t.stop()); state.stream = null; }
    if (state.autoTimer) { clearInterval(state.autoTimer); state.autoTimer = null; }
    const v = $('#video'); if (v) v.srcObject = null;
    const o = $('#cam-overlay'); if (o) o.classList.remove('hidden');
    const s = $('#btn-start-cam'); if (s) s.classList.remove('hidden');
    const st = $('#btn-stop-cam'); if (st) st.classList.add('hidden');
    const ad = $('#auto-detect'); if (ad) ad.checked = false;
    const b = $('#plate-banner'); if (b) b.classList.add('hidden');
    const u = $('#unknown-warn'); if (u) u.classList.add('hidden');
  }

  function grabPhotoDataUrl() {
    const video = $('#video');
    if (!video || !state.stream || video.readyState < 2) return null;
    const canvas = $('#canvas');
    const maxW = 640;
    const scale = Math.min(1, maxW / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.65);
  }

  function cleanPlate(raw) {
    if (!raw) return '';
    const cleaned = raw.toUpperCase().replace(/[^A-Z0-9\s\-]/g, ' ').trim();
    const tokens = cleaned.split(/\s+/).filter((t) => t.length >= 4 && t.length <= 10);
    tokens.sort((a, b) => {
      const score = (s) => (/[A-Z]/.test(s) && /[0-9]/.test(s) ? 10 : 0) + s.length;
      return score(b) - score(a);
    });
    return (tokens[0] || cleaned.replace(/\s/g, '').slice(0, 10)).replace(/[\s\-]/g, '');
  }

  async function capturePlate(silent) {
    const video = $('#video');
    if (!video || !state.stream || video.readyState < 2) {
      if (!silent) toast('Start the camera first', true);
      return;
    }
    const photo = grabPhotoDataUrl();
    const canvas = $('#canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    if (!silent) {
      $('#ocr-bar').classList.remove('hidden');
      $('#ocr-msg').textContent = 'Reading plate…';
    }
    try {
      if (typeof Tesseract === 'undefined') throw new Error('OCR not loaded');
      const result = await Tesseract.recognize(canvas, 'eng', { logger: () => {} });
      const plate = cleanPlate(result.data.text);
      $('#ocr-bar').classList.add('hidden');
      if (plate && plate.length >= 4) {
        const now = Date.now();
        if (silent && plate === state.lastPlate && now - state.lastPlateAt < 12000) return;
        state.lastPlate = plate;
        state.lastPlateAt = now;
        state.pendingPhoto = photo;
        $('#plate-text').textContent = plate;
        $('#plate-banner').classList.remove('hidden');
        const known = isKnownPlate(plate);
        $('#unknown-warn').classList.toggle('hidden', known || state.settings.warnUnknown === false);
        openQuickLog(plate, photo);
        if (!silent) toast('Plate: ' + plate + (known ? '' : ' (unknown)'));
      } else if (!silent) {
        toast('No plate found – try Manual Entry', true);
      }
    } catch (err) {
      $('#ocr-bar').classList.add('hidden');
      if (!silent) toast('OCR failed: ' + err.message, true);
    }
  }

  function toggleAuto(e) {
    if (e.target.checked) {
      if (!state.stream) { toast('Start camera first', true); e.target.checked = false; return; }
      toast('Auto Detect ON');
      state.autoTimer = setInterval(() => capturePlate(true), 4000);
    } else {
      if (state.autoTimer) clearInterval(state.autoTimer);
      state.autoTimer = null;
      toast('Auto Detect OFF');
    }
  }

  /* QUICK LOG */
  function openQuickLog(plate, photo) {
    if (state.shiftLocked && state.user.role !== 'admin') {
      toast('Shift is locked – ask admin to unlock', true);
      return;
    }
    const matched = state.trucks.find((t) => normPlate(t.plate) === normPlate(plate));
    $('#q-plate').value = plate || '';
    $('#q-dir').value = state.settings.defaultDir || 'IN';
    $('#q-truck').value = matched ? matched.unit : '';
    $('#q-company').value = matched ? matched.company : '';
    $('#q-driver').value = matched ? matched.driver : '';
    $('#q-material').value = '';
    $('#q-ticket').value = '';
    $('#q-gross').value = '';
    $('#q-tare').value = matched && matched.tare ? matched.tare : '';
    $('#q-net').value = '';
    $('#q-notes').value = plate ? 'Auto-detected' : 'Manual entry';
    state.pendingPhoto = photo || state.pendingPhoto || null;
    if (state.pendingPhoto) {
      $('#ql-photo-img').src = state.pendingPhoto;
      $('#ql-photo-preview').classList.remove('hidden');
    } else {
      $('#ql-photo-preview').classList.add('hidden');
    }
    const known = !plate || isKnownPlate(plate);
    $('#ql-unknown-msg').classList.toggle('hidden', known || state.settings.warnUnknown === false);
    $('#truck-dl').innerHTML = state.trucks
      .map((t) => '<option value="' + esc(t.unit) + '">' + esc(t.plate) + ' – ' + esc(t.company) + '</option>')
      .join('');
    $('#btn-print-ticket').disabled = true;
    state.lastSavedLog = null;
    $('#quick-log').classList.remove('hidden');
    $('#quick-log').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function cancelQuickLog() {
    $('#quick-log').classList.add('hidden');
    $('#plate-banner').classList.add('hidden');
    $('#unknown-warn').classList.add('hidden');
    state.pendingPhoto = null;
  }

  function updateNet() {
    const g = parseFloat($('#q-gross').value) || 0;
    const t = parseFloat($('#q-tare').value) || 0;
    $('#q-net').value = g > 0 ? Math.max(0, g - t) : '';
  }

  function saveLog() {
    if (state.shiftLocked && state.user.role !== 'admin') {
      toast('Shift is locked', true);
      return;
    }
    const plate = normPlate($('#q-plate').value);
    if (!plate || plate.length < 3) { toast('Enter a valid plate', true); return; }
    const site = state.sites.find((s) => s.id === state.currentSiteId);
    const gross = parseFloat($('#q-gross').value) || 0;
    const tare = parseFloat($('#q-tare').value) || 0;
    const net = gross > 0 ? Math.max(0, gross - tare) : (parseFloat($('#q-net').value) || 0);
    const entry = {
      id: uid(),
      date: today(),
      time: nowTime(),
      timestamp: new Date().toISOString(),
      siteId: state.currentSiteId,
      siteName: site ? site.name : '',
      siteCode: site ? site.code : '',
      plate,
      direction: $('#q-dir').value,
      truck: $('#q-truck').value.trim(),
      company: $('#q-company').value.trim(),
      driver: $('#q-driver').value.trim(),
      material: $('#q-material').value.trim(),
      ticket: $('#q-ticket').value.trim(),
      gross, tare, net,
      notes: $('#q-notes').value.trim(),
      photo: state.pendingPhoto || null,
      known: isKnownPlate(plate),
      loggedBy: state.user.username,
      loggedByName: state.user.name,
      history: [{ action: 'created', by: state.user.username, at: new Date().toISOString() }]
    };
    state.logs.unshift(entry);
    // keep photos lean – strip old photos if too many (localStorage limits)
    if (state.logs.length > 200) {
      state.logs.slice(150).forEach((l) => { if (l.photo) l.photo = null; });
    }
    save(KEYS.logs, state.logs);

    if (!isKnownPlate(plate) && entry.truck) {
      state.trucks.push({
        id: uid(), plate, unit: entry.truck, company: entry.company,
        driver: entry.driver, tare: tare || 0, notes: 'Auto-added from gate'
      });
      save(KEYS.trucks, state.trucks);
    }

    state.lastSavedLog = entry;
    $('#btn-print-ticket').disabled = false;
    cancelQuickLog();
    toast('Logged ' + plate + ' (' + entry.direction + ')' + (net ? ' · ' + net + ' lbs' : ''));
    renderRecent();
    renderLog();
    renderDash();
  }

  function printTicket(log) {
    const L = log || state.lastSavedLog;
    if (!L) { toast('No ticket to print', true); return; }
    const html =
      '<div style="font-family:sans-serif;max-width:400px;margin:0 auto">' +
      '<h2 style="margin:0 0 8px">' + esc(state.settings.name || 'GATEID') + ' Ticket</h2>' +
      '<p style="margin:0 0 12px;color:#555">' + esc(L.siteName) + ' · ' + esc(L.siteCode) + '</p>' +
      '<table style="width:100%;border-collapse:collapse;font-size:14px">' +
      '<tr><td style="padding:4px 0;color:#666">Plate</td><td style="text-align:right;font-weight:700;font-size:18px">' + esc(L.plate) + '</td></tr>' +
      '<tr><td style="padding:4px 0;color:#666">Direction</td><td style="text-align:right">' + L.direction + '</td></tr>' +
      '<tr><td style="padding:4px 0;color:#666">Date / Time</td><td style="text-align:right">' + esc(L.date) + ' ' + esc(L.time) + '</td></tr>' +
      '<tr><td style="padding:4px 0;color:#666">Truck</td><td style="text-align:right">' + esc(L.truck) + '</td></tr>' +
      '<tr><td style="padding:4px 0;color:#666">Company</td><td style="text-align:right">' + esc(L.company) + '</td></tr>' +
      '<tr><td style="padding:4px 0;color:#666">Driver</td><td style="text-align:right">' + esc(L.driver) + '</td></tr>' +
      '<tr><td style="padding:4px 0;color:#666">Material</td><td style="text-align:right">' + esc(L.material) + '</td></tr>' +
      '<tr><td style="padding:4px 0;color:#666">Ticket #</td><td style="text-align:right">' + esc(L.ticket) + '</td></tr>' +
      '<tr><td style="padding:4px 0;color:#666">Gross</td><td style="text-align:right">' + (L.gross || '—') + '</td></tr>' +
      '<tr><td style="padding:4px 0;color:#666">Tare</td><td style="text-align:right">' + (L.tare || '—') + '</td></tr>' +
      '<tr><td style="padding:4px 0;color:#666">Net</td><td style="text-align:right;font-weight:700">' + (L.net || '—') + ' lbs</td></tr>' +
      '<tr><td style="padding:4px 0;color:#666">Logged by</td><td style="text-align:right">' + esc(L.loggedByName) + '</td></tr>' +
      '</table>' +
      (L.photo ? '<img src="' + L.photo + '" style="max-width:100%;margin-top:16px;border:1px solid #ccc">' : '') +
      '<p style="margin-top:16px;font-size:11px;color:#999">ID: ' + L.id + '</p></div>';
    const w = window.open('', '_blank', 'width=420,height=640');
    if (!w) { toast('Allow pop-ups to print', true); return; }
    w.document.write('<html><head><title>Ticket ' + esc(L.plate) + '</title></head><body onload="window.print()">' + html + '</body></html>');
    w.document.close();
  }

  /* RENDER */
  function updateSitePill() {
    const site = state.sites.find((s) => s.id === state.currentSiteId);
    $('#site-pill').textContent = site ? site.code : '—';
  }
  function updateShiftBadge() {
    $('#shift-badge').classList.toggle('hidden', !state.shiftLocked);
  }

  function renderRecent() {
    const el = $('#recent-list');
    const list = state.logs.filter((l) => l.siteId === state.currentSiteId).slice(0, 8);
    if (!list.length) { el.innerHTML = '<div class="empty">No detections yet at this gate</div>'; return; }
    el.innerHTML = list.map((l) =>
      '<div class="feed-item"><span><span class="plate">' + esc(l.plate) + '</span> · ' +
      l.direction + (l.net ? ' · ' + l.net + ' lbs' : '') +
      '</span><span>' + esc(l.time) + '</span></div>'
    ).join('');
  }

  function getFilteredLogs() {
    const q = ($('#log-search')?.value || '').toLowerCase();
    const siteF = $('#log-site-filter')?.value || 'all';
    return state.logs.filter((l) => {
      if (siteF !== 'all' && l.siteId !== siteF) return false;
      if (!state.user.sites.includes('*') && !state.user.sites.includes(l.siteId)) return false;
      if (!q) return true;
      return [l.plate, l.truck, l.company, l.driver, l.material, l.siteCode, l.ticket, l.loggedBy]
        .join(' ').toLowerCase().includes(q);
    });
  }

  function renderLog() {
    const sel = $('#log-site-filter');
    if (sel && sel.options.length <= 1) {
      const allowed = state.user.sites.includes('*') ? state.sites : state.sites.filter((s) => state.user.sites.includes(s.id));
      allowed.forEach((s) => {
        const o = document.createElement('option');
        o.value = s.id; o.textContent = s.code; sel.appendChild(o);
      });
    }
    const logs = getFilteredLogs();
    const tbody = $('#log-body');
    if (!logs.length) {
      tbody.innerHTML = '<tr><td colspan="12" class="empty">No records</td></tr>';
    } else {
      tbody.innerHTML = logs.map((l) =>
        '<tr>' +
        '<td>' + (l.photo ? '<img class="thumb" src="' + l.photo + '" data-view-photo="' + l.id + '" title="View photo">' : '') + '</td>' +
        '<td>' + esc(l.date) + '</td><td>' + esc(l.time) + '</td><td>' + esc(l.siteCode) + '</td>' +
        '<td class="plate-cell">' + esc(l.plate) + (!l.known && state.settings.warnUnknown !== false ? ' ⚠' : '') + '</td>' +
        '<td class="' + (l.direction === 'IN' ? 'dir-in' : 'dir-out') + '">' + l.direction + '</td>' +
        '<td>' + esc(l.truck) + '</td><td>' + esc(l.company) + '</td>' +
        '<td>' + (l.net ? l.net.toLocaleString() : '—') + '</td>' +
        '<td>' + esc(l.material) + '</td><td>' + esc(l.loggedByName || l.loggedBy) + '</td>' +
        '<td>' +
        (canEdit() ? '<button class="btn btn-ghost btn-sm" data-edit-log="' + l.id + '">Edit</button> ' : '') +
        (canEdit() ? '<button class="btn btn-ghost btn-sm" data-del-log="' + l.id + '">✕</button> ' : '') +
        '<button class="btn btn-ghost btn-sm" data-print-log="' + l.id + '">Ticket</button>' +
        '</td></tr>'
      ).join('');
    }
    $('#log-count').textContent = logs.length + ' record' + (logs.length !== 1 ? 's' : '');
  }

  function deleteLog(id) {
    if (!canEdit()) { toast('Cannot edit – shift locked or view-only', true); return; }
    if (!confirm('Delete this entry?')) return;
    const log = state.logs.find((l) => l.id === id);
    if (log) {
      log.history = log.history || [];
      log.history.push({ action: 'deleted', by: state.user.username, at: new Date().toISOString() });
    }
    state.logs = state.logs.filter((l) => l.id !== id);
    save(KEYS.logs, state.logs);
    renderLog(); renderRecent(); renderDash();
    toast('Entry deleted');
  }

  function openEditLog(id) {
    if (!canEdit()) { toast('Cannot edit – shift locked or view-only', true); return; }
    const log = state.logs.find((l) => l.id === id);
    if (!log) return;
    $('#modal-title').textContent = 'Edit Log Entry';
    $('#modal-body').innerHTML =
      '<div class="field"><label>Plate</label><input id="e-plate" class="plate-input" value="' + esc(log.plate) + '"></div>' +
      '<div class="field"><label>Direction</label><select id="e-dir"><option value="IN"' + (log.direction === 'IN' ? ' selected' : '') + '>IN</option><option value="OUT"' + (log.direction === 'OUT' ? ' selected' : '') + '>OUT</option></select></div>' +
      '<div class="field"><label>Truck</label><input id="e-truck" value="' + esc(log.truck) + '"></div>' +
      '<div class="field"><label>Company</label><input id="e-company" value="' + esc(log.company) + '"></div>' +
      '<div class="field"><label>Driver</label><input id="e-driver" value="' + esc(log.driver) + '"></div>' +
      '<div class="field"><label>Material</label><input id="e-material" value="' + esc(log.material) + '"></div>' +
      '<div class="field"><label>Ticket #</label><input id="e-ticket" value="' + esc(log.ticket) + '"></div>' +
      '<div class="field"><label>Gross</label><input type="number" id="e-gross" value="' + (log.gross || '') + '"></div>' +
      '<div class="field"><label>Tare</label><input type="number" id="e-tare" value="' + (log.tare || '') + '"></div>' +
      '<div class="field"><label>Notes</label><input id="e-notes" value="' + esc(log.notes) + '"></div>';
    $('#modal-foot').innerHTML =
      '<button class="btn btn-ghost" id="m-cancel">Cancel</button><button class="btn btn-primary" id="m-save">Update</button>';
    $('#modal').classList.remove('hidden');
    $('#m-cancel').onclick = closeModal;
    $('#m-save').onclick = () => {
      const g = parseFloat($('#e-gross').value) || 0;
      const t = parseFloat($('#e-tare').value) || 0;
      log.plate = normPlate($('#e-plate').value);
      log.direction = $('#e-dir').value;
      log.truck = $('#e-truck').value.trim();
      log.company = $('#e-company').value.trim();
      log.driver = $('#e-driver').value.trim();
      log.material = $('#e-material').value.trim();
      log.ticket = $('#e-ticket').value.trim();
      log.gross = g; log.tare = t; log.net = g > 0 ? Math.max(0, g - t) : log.net;
      log.notes = $('#e-notes').value.trim();
      log.known = isKnownPlate(log.plate);
      log.history = log.history || [];
      log.history.push({ action: 'edited', by: state.user.username, at: new Date().toISOString() });
      save(KEYS.logs, state.logs);
      closeModal();
      renderLog(); renderRecent(); renderDash();
      toast('Entry updated');
    };
  }

  function exportCSV() {
    const logs = getFilteredLogs();
    if (!logs.length) { toast('Nothing to export', true); return; }
    const headers = ['Date','Time','Site','Site Code','Plate','Direction','Truck','Company','Driver','Material','Ticket','Gross','Tare','Net','Notes','Known','Logged By','Timestamp'];
    const rows = logs.map((l) =>
      [l.date,l.time,l.siteName,l.siteCode,l.plate,l.direction,l.truck,l.company,l.driver,l.material,l.ticket,l.gross,l.tare,l.net,l.notes,l.known?'Yes':'No',l.loggedByName,l.timestamp]
        .map((v) => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(',')
    );
    const blob = new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'GATEID-log-' + today() + '.csv';
    a.click();
    toast('CSV downloaded');
  }

  function exportXLSX() {
    const logs = getFilteredLogs();
    if (!logs.length) { toast('Nothing to export', true); return; }
    if (typeof XLSX === 'undefined') { toast('Excel library missing', true); return; }
    const data = logs.map((l) => ({
      Date: l.date, Time: l.time, Site: l.siteName, 'Site Code': l.siteCode, Plate: l.plate,
      Direction: l.direction, Truck: l.truck, Company: l.company, Driver: l.driver,
      Material: l.material, Ticket: l.ticket, Gross: l.gross, Tare: l.tare, Net: l.net,
      Notes: l.notes, Known: l.known ? 'Yes' : 'No', 'Logged By': l.loggedByName, Timestamp: l.timestamp
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Gate Log');
    XLSX.writeFile(wb, 'GATEID-log-' + today() + '.xlsx');
    toast('Excel downloaded');
  }

  /* TRUCKS */
  function renderTrucks() {
    const tbody = $('#trucks-body');
    if (!state.trucks.length) { tbody.innerHTML = '<tr><td colspan="7" class="empty">No trucks yet</td></tr>'; return; }
    tbody.innerHTML = state.trucks.map((t) =>
      '<tr><td class="plate-cell">' + esc(t.plate) + '</td><td>' + esc(t.unit) + '</td><td>' + esc(t.company) +
      '</td><td>' + esc(t.driver) + '</td><td>' + (t.tare ? t.tare.toLocaleString() : '—') +
      '</td><td>' + esc(t.notes) + '</td><td>' +
      (state.user.role !== 'viewer'
        ? '<button class="btn btn-ghost btn-sm" data-edit-truck="' + t.id + '">Edit</button> ' +
          '<button class="btn btn-ghost btn-sm" data-del-truck="' + t.id + '">✕</button>'
        : '') + '</td></tr>'
    ).join('');
  }

  function openTruckModal(truck) {
    const isEdit = !!truck;
    $('#modal-title').textContent = isEdit ? 'Edit Truck' : 'Add Truck';
    $('#modal-body').innerHTML =
      '<div class="field"><label>License Plate *</label><input id="m-plate" class="plate-input" value="' + esc(truck?.plate || '') + '"></div>' +
      '<div class="field"><label>Unit / Truck #</label><input id="m-unit" value="' + esc(truck?.unit || '') + '"></div>' +
      '<div class="field"><label>Company</label><input id="m-company" value="' + esc(truck?.company || '') + '"></div>' +
      '<div class="field"><label>Driver</label><input id="m-driver" value="' + esc(truck?.driver || '') + '"></div>' +
      '<div class="field"><label>Tare (lbs)</label><input id="m-tare" type="number" value="' + (truck?.tare || '') + '"></div>' +
      '<div class="field"><label>Notes</label><input id="m-notes" value="' + esc(truck?.notes || '') + '"></div>';
    $('#modal-foot').innerHTML =
      '<button class="btn btn-ghost" id="m-cancel">Cancel</button><button class="btn btn-primary" id="m-save">' + (isEdit ? 'Update' : 'Add') + '</button>';
    $('#modal').classList.remove('hidden');
    $('#m-cancel').onclick = closeModal;
    $('#m-save').onclick = () => {
      const plate = normPlate($('#m-plate').value);
      if (!plate) { toast('Plate required', true); return; }
      const data = {
        plate, unit: $('#m-unit').value.trim(), company: $('#m-company').value.trim(),
        driver: $('#m-driver').value.trim(), tare: parseInt($('#m-tare').value, 10) || 0,
        notes: $('#m-notes').value.trim()
      };
      if (isEdit) Object.assign(truck, data);
      else state.trucks.push(Object.assign({ id: uid() }, data));
      save(KEYS.trucks, state.trucks);
      closeModal();
      renderTrucks();
      toast(isEdit ? 'Truck updated' : 'Truck added');
    };
  }

  function deleteTruck(id) {
    if (!confirm('Remove this truck?')) return;
    state.trucks = state.trucks.filter((t) => t.id !== id);
    save(KEYS.trucks, state.trucks);
    renderTrucks();
    toast('Truck removed');
  }

  /* SITES – full CRUD */
  function renderSites() {
    const grid = $('#sites-grid');
    const allowed = state.user.sites.includes('*')
      ? state.sites
      : state.sites.filter((s) => state.user.sites.includes(s.id));
    if (!allowed.length) {
      grid.innerHTML = '<div class="empty">No sites</div>';
      return;
    }
    grid.innerHTML = allowed.map((s) =>
      '<div class="site-card' + (s.id === state.currentSiteId ? ' active' : '') + '">' +
      '<h4>' + esc(s.name) + '</h4>' +
      '<p>' + esc(s.code) + ' · ' + esc(s.location || '') + '</p>' +
      '<p style="margin-top:6px;font-size:0.8rem;color:' + (s.active ? 'var(--green)' : 'var(--muted)') + '">' +
      (s.active ? '● Active' : '○ Inactive') + '</p>' +
      '<div class="site-actions">' +
      '<button class="btn btn-primary btn-sm" data-select-site="' + s.id + '">Use Gate</button>' +
      (state.user.role === 'admin' || state.user.role === 'operator'
        ? '<button class="btn btn-ghost btn-sm" data-edit-site="' + s.id + '">Edit</button>'
        : '') +
      (state.user.role === 'admin'
        ? '<button class="btn btn-ghost btn-sm" data-del-site="' + s.id + '">Delete</button>'
        : '') +
      '</div></div>'
    ).join('');
  }

  function openSiteModal(site) {
    const isEdit = !!site;
    $('#modal-title').textContent = isEdit ? 'Edit Site' : 'Add Site';
    $('#modal-body').innerHTML =
      '<div class="field"><label>Site Name *</label><input id="m-sname" value="' + esc(site?.name || '') + '"></div>' +
      '<div class="field"><label>Code *</label><input id="m-scode" value="' + esc(site?.code || '') + '" placeholder="e.g. NQ-MAIN"></div>' +
      '<div class="field"><label>Location</label><input id="m-sloc" value="' + esc(site?.location || '') + '"></div>' +
      (isEdit
        ? '<div class="field"><label><input type="checkbox" id="m-sactive" ' + (site.active !== false ? 'checked' : '') + '> Active</label></div>'
        : '');
    $('#modal-foot').innerHTML =
      '<button class="btn btn-ghost" id="m-cancel">Cancel</button><button class="btn btn-primary" id="m-save">Save</button>';
    $('#modal').classList.remove('hidden');
    $('#m-cancel').onclick = closeModal;
    $('#m-save').onclick = () => {
      const name = $('#m-sname').value.trim();
      const code = $('#m-scode').value.trim().toUpperCase();
      if (!name || !code) { toast('Name and code required', true); return; }
      if (isEdit) {
        site.name = name;
        site.code = code;
        site.location = $('#m-sloc').value.trim();
        site.active = $('#m-sactive') ? $('#m-sactive').checked : true;
      } else {
        state.sites.push({
          id: uid(), name, code, location: $('#m-sloc').value.trim(), active: true
        });
      }
      save(KEYS.sites, state.sites);
      closeModal();
      renderSites();
      updateSitePill();
      toast('Site saved');
    };
  }

  function deleteSite(id) {
    if (state.sites.length <= 1) { toast('Keep at least one site', true); return; }
    if (!confirm('Delete this site? Logs stay but site link may show old code.')) return;
    state.sites = state.sites.filter((s) => s.id !== id);
    if (state.currentSiteId === id) {
      state.currentSiteId = state.sites[0].id;
      save(KEYS.currentSite, state.currentSiteId);
    }
    save(KEYS.sites, state.sites);
    renderSites();
    updateSitePill();
    toast('Site deleted');
  }

  /* USERS */
  function renderUsers() {
    if (state.user.role !== 'admin') return;
    $('#users-body').innerHTML = state.users.map((u) =>
      '<tr><td>' + esc(u.username) + '</td><td>' + esc(u.name) + '</td><td>' + u.role + '</td><td>' +
      (u.sites.includes('*') ? 'All Sites' : u.sites.map((id) => state.sites.find((s) => s.id === id)?.code || id).join(', ')) +
      '</td><td>' + (u.active ? 'Active' : 'Disabled') + '</td><td>' +
      '<button class="btn btn-ghost btn-sm" data-edit-user="' + u.id + '">Edit</button> ' +
      (u.username !== 'admin' ? '<button class="btn btn-ghost btn-sm" data-toggle-user="' + u.id + '">' + (u.active ? 'Disable' : 'Enable') + '</button>' : '') +
      '</td></tr>'
    ).join('');
  }

  function openUserModal(user) {
    const isEdit = !!user;
    const siteOpts = state.sites.map((s) =>
      '<label style="display:block;margin:4px 0"><input type="checkbox" class="m-site-cb" value="' + s.id + '" ' +
      (user?.sites?.includes(s.id) || user?.sites?.includes('*') ? 'checked' : '') + '> ' + esc(s.code) + ' – ' + esc(s.name) + '</label>'
    ).join('');
    $('#modal-title').textContent = isEdit ? 'Edit User' : 'Add User';
    $('#modal-body').innerHTML =
      '<div class="field"><label>Username *</label><input id="m-uname" value="' + esc(user?.username || '') + '" ' + (isEdit ? 'readonly' : '') + '></div>' +
      '<div class="field"><label>Full Name</label><input id="m-name" value="' + esc(user?.name || '') + '"></div>' +
      '<div class="field"><label>Password ' + (isEdit ? '(blank = keep)' : '*') + '</label><input id="m-pass" type="password"></div>' +
      '<div class="field"><label>Role</label><select id="m-role">' +
      '<option value="operator"' + (user?.role === 'operator' ? ' selected' : '') + '>Operator</option>' +
      '<option value="viewer"' + (user?.role === 'viewer' ? ' selected' : '') + '>Viewer</option>' +
      '<option value="admin"' + (user?.role === 'admin' ? ' selected' : '') + '>Admin</option></select></div>' +
      '<div class="field"><label>Site Access</label>' +
      '<label style="display:block;margin:4px 0"><input type="checkbox" id="m-all-sites" ' + (user?.sites?.includes('*') ? 'checked' : '') + '> All Sites</label>' +
      '<div id="m-sites-list">' + siteOpts + '</div></div>';
    $('#modal-foot').innerHTML =
      '<button class="btn btn-ghost" id="m-cancel">Cancel</button><button class="btn btn-primary" id="m-save">Save</button>';
    $('#modal').classList.remove('hidden');
    $('#m-all-sites').onchange = (e) => { $$('.m-site-cb').forEach((cb) => (cb.disabled = e.target.checked)); };
    $('#m-cancel').onclick = closeModal;
    $('#m-save').onclick = () => {
      const username = $('#m-uname').value.trim().toLowerCase();
      const name = $('#m-name').value.trim();
      const pass = $('#m-pass').value;
      const role = $('#m-role').value;
      const allSites = $('#m-all-sites').checked;
      const sites = allSites ? ['*'] : $$('.m-site-cb').filter((c) => c.checked).map((c) => c.value);
      if (!username) { toast('Username required', true); return; }
      if (!isEdit && !pass) { toast('Password required', true); return; }
      if (isEdit) {
        user.name = name; user.role = role; user.sites = sites;
        if (pass) user.password = pass;
      } else {
        if (state.users.some((u) => u.username === username)) { toast('Username exists', true); return; }
        state.users.push({ id: uid(), username, password: pass, name, role, sites, active: true });
      }
      save(KEYS.users, state.users);
      closeModal();
      renderUsers();
      toast('User saved');
    };
  }

  function toggleUser(id) {
    const u = state.users.find((x) => x.id === id);
    if (!u || u.username === 'admin') return;
    u.active = !u.active;
    save(KEYS.users, state.users);
    renderUsers();
    toast(u.active ? 'User enabled' : 'User disabled');
  }

  /* DASHBOARD */
  function renderDash() {
    const t = today();
    const allowed = state.logs.filter((l) => state.user.sites.includes('*') || state.user.sites.includes(l.siteId));
    const todayLogs = allowed.filter((l) => l.date === t);
    $('#s-today').textContent = todayLogs.length;
    $('#s-in').textContent = todayLogs.filter((l) => l.direction === 'IN').length;
    $('#s-out').textContent = todayLogs.filter((l) => l.direction === 'OUT').length;
    const tons = todayLogs.reduce((sum, l) => sum + (l.net || 0), 0) / 2000;
    $('#s-tons').textContent = tons.toFixed(1);

    const bySite = {};
    todayLogs.forEach((l) => { bySite[l.siteCode] = (bySite[l.siteCode] || 0) + 1; });
    const siteEl = $('#dash-sites');
    siteEl.innerHTML = Object.keys(bySite).length
      ? Object.entries(bySite).map(([c, n]) => '<div class="feed-item"><span>' + esc(c) + '</span><span>' + n + ' entries</span></div>').join('')
      : '<div class="empty">No activity today</div>';

    const recent = allowed.slice(0, 10);
    $('#dash-recent').innerHTML = recent.length
      ? recent.map((l) =>
          '<div class="feed-item"><span><span class="plate">' + esc(l.plate) + '</span> ' + l.direction + ' @ ' + esc(l.siteCode) +
          '</span><span>' + esc(l.date) + ' ' + esc(l.time) + '</span></div>'
        ).join('')
      : '<div class="empty">No logs yet</div>';
  }

  /* REPORTS */
  function runReport() {
    const d = $('#report-date').value || today();
    const allowed = state.logs.filter((l) => {
      if (l.date !== d) return false;
      return state.user.sites.includes('*') || state.user.sites.includes(l.siteId);
    });
    const ins = allowed.filter((l) => l.direction === 'IN').length;
    const outs = allowed.filter((l) => l.direction === 'OUT').length;
    const netLbs = allowed.reduce((s, l) => s + (l.net || 0), 0);
    const plates = new Set(allowed.map((l) => l.plate)).size;
    const byMat = {};
    allowed.forEach((l) => {
      const m = l.material || '(none)';
      byMat[m] = (byMat[m] || 0) + 1;
    });
    const bySite = {};
    allowed.forEach((l) => {
      bySite[l.siteCode] = bySite[l.siteCode] || { n: 0, net: 0 };
      bySite[l.siteCode].n++;
      bySite[l.siteCode].net += l.net || 0;
    });

    let html =
      '<div class="report-print">' +
      '<h2 style="margin:0 0 4px">' + esc(state.settings.name || 'GATEID') + ' – Daily Report</h2>' +
      '<p style="color:var(--muted);margin:0 0 16px">' + esc(d) + ' · Generated ' + new Date().toLocaleString() + '</p>' +
      '<div class="stats" style="margin-bottom:16px">' +
      '<div class="stat"><div class="stat-n">' + allowed.length + '</div><div class="stat-l">Total</div></div>' +
      '<div class="stat"><div class="stat-n green">' + ins + '</div><div class="stat-l">IN</div></div>' +
      '<div class="stat"><div class="stat-n amber">' + outs + '</div><div class="stat-l">OUT</div></div>' +
      '<div class="stat"><div class="stat-n">' + (netLbs / 2000).toFixed(1) + '</div><div class="stat-l">Tons</div></div>' +
      '</div>' +
      '<p><b>Unique plates:</b> ' + plates + '</p>' +
      '<h3>By Site</h3><table><thead><tr><th>Site</th><th>Loads</th><th>Net lbs</th></tr></thead><tbody>' +
      Object.entries(bySite).map(([c, v]) => '<tr><td>' + esc(c) + '</td><td>' + v.n + '</td><td>' + v.net.toLocaleString() + '</td></tr>').join('') +
      '</tbody></table>' +
      '<h3>By Material</h3><table><thead><tr><th>Material</th><th>Loads</th></tr></thead><tbody>' +
      Object.entries(byMat).map(([m, n]) => '<tr><td>' + esc(m) + '</td><td>' + n + '</td></tr>').join('') +
      '</tbody></table>' +
      '<h3>Detail</h3><table><thead><tr><th>Time</th><th>Site</th><th>Plate</th><th>Dir</th><th>Net</th><th>Material</th></tr></thead><tbody>' +
      allowed.map((l) =>
        '<tr><td>' + esc(l.time) + '</td><td>' + esc(l.siteCode) + '</td><td class="plate-cell">' + esc(l.plate) +
        '</td><td>' + l.direction + '</td><td>' + (l.net || '—') + '</td><td>' + esc(l.material) + '</td></tr>'
      ).join('') +
      '</tbody></table></div>';

    if (!allowed.length) html = '<div class="empty">No loads on ' + esc(d) + '</div>';
    $('#report-out').innerHTML = html;
  }

  function printReport() {
    const content = $('#report-out').innerHTML;
    if (!content || content.includes('Select a date')) { toast('Generate a report first', true); return; }
    const w = window.open('', '_blank');
    if (!w) { toast('Allow pop-ups', true); return; }
    w.document.write('<html><head><title>Report</title><style>body{font-family:sans-serif;padding:20px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px;text-align:left}h2,h3{margin-top:16px}</style></head><body onload="window.print()">' + content + '</body></html>');
    w.document.close();
  }

  function lockShift() {
    if (state.user.role !== 'admin' && state.user.role !== 'operator') return;
    if (!confirm('Lock today’s shift? Further log edits will be blocked until unlocked.')) return;
    state.shiftLocked = true;
    save(KEYS.shiftLocked, true);
    updateShiftBadge();
    toast('Shift locked');
  }

  function unlockShift() {
    if (state.user.role !== 'admin') { toast('Only admin can unlock', true); return; }
    state.shiftLocked = false;
    save(KEYS.shiftLocked, false);
    updateShiftBadge();
    toast('Shift unlocked');
  }

  /* BACKUP */
  function exportJSON() {
    const payload = {
      version: 2,
      exportedAt: new Date().toISOString(),
      users: state.users,
      sites: state.sites,
      trucks: state.trucks,
      logs: state.logs.map((l) => Object.assign({}, l, { photo: l.photo ? '[photo omitted for size]' : null })),
      settings: state.settings
    };
    // include photos in a separate lighter export option – for full backup strip oversized
    const full = {
      version: 2,
      exportedAt: payload.exportedAt,
      users: state.users,
      sites: state.sites,
      trucks: state.trucks,
      logs: state.logs,
      settings: state.settings,
      shiftLocked: state.shiftLocked
    };
    const blob = new Blob([JSON.stringify(full)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'GATEID-backup-' + today() + '.json';
    a.click();
    toast('Backup downloaded');
  }

  function importJSON(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data.users || !data.sites) throw new Error('Invalid backup file');
        if (!confirm('Import will replace current users, sites, trucks, logs and settings. Continue?')) return;
        state.users = data.users;
        state.sites = data.sites;
        state.trucks = data.trucks || [];
        state.logs = data.logs || [];
        state.settings = data.settings || DEFAULTS.settings;
        state.shiftLocked = !!data.shiftLocked;
        save(KEYS.users, state.users);
        save(KEYS.sites, state.sites);
        save(KEYS.trucks, state.trucks);
        save(KEYS.logs, state.logs);
        save(KEYS.settings, state.settings);
        save(KEYS.shiftLocked, state.shiftLocked);
        applySettings();
        updateShiftBadge();
        renderAll();
        toast('Backup imported');
      } catch (err) {
        toast('Import failed: ' + err.message, true);
      }
    };
    reader.readAsText(file);
  }

  function renderAll() {
    renderRecent();
    renderLog();
    renderTrucks();
    renderSites();
    renderUsers();
    renderDash();
  }

  function closeModal() { $('#modal').classList.add('hidden'); }

  function bind() {
    $('#form-login').addEventListener('submit', doLogin);
    $('#btn-logout').addEventListener('click', doLogout);
    $$('.tab').forEach((tab) => tab.addEventListener('click', () => switchTab(tab.dataset.tab)));

    $('#btn-start-cam').addEventListener('click', startCamera);
    $('#btn-stop-cam').addEventListener('click', stopCamera);
    $('#btn-capture').addEventListener('click', () => capturePlate(false));
    $('#btn-manual').addEventListener('click', () => openQuickLog(''));
    $('#auto-detect').addEventListener('change', toggleAuto);

    $('#btn-save-log').addEventListener('click', saveLog);
    $('#btn-cancel-log').addEventListener('click', cancelQuickLog);
    $('#btn-clear-photo').addEventListener('click', () => {
      state.pendingPhoto = null;
      $('#ql-photo-preview').classList.add('hidden');
    });
    $('#btn-print-ticket').addEventListener('click', () => printTicket());
    $('#q-gross').addEventListener('input', updateNet);
    $('#q-tare').addEventListener('input', updateNet);
    $('#q-plate').addEventListener('input', () => {
      const known = isKnownPlate($('#q-plate').value);
      $('#ql-unknown-msg').classList.toggle('hidden', known || state.settings.warnUnknown === false);
    });

    $('#log-search').addEventListener('input', renderLog);
    $('#log-site-filter').addEventListener('change', renderLog);
    $('#btn-export-csv').addEventListener('click', exportCSV);
    $('#btn-export-xlsx').addEventListener('click', exportXLSX);

    $('#btn-add-truck').addEventListener('click', () => openTruckModal(null));
    $('#btn-add-site').addEventListener('click', () => openSiteModal(null));
    $('#btn-add-user').addEventListener('click', () => openUserModal(null));
    $('#warn-unknowns').addEventListener('change', (e) => {
      state.settings.warnUnknown = e.target.checked;
      save(KEYS.settings, state.settings);
    });

    $('#btn-save-settings').addEventListener('click', saveSettings);
    $('#btn-reset-demo').addEventListener('click', resetDemo);
    $('#btn-run-report').addEventListener('click', runReport);
    $('#btn-print-report').addEventListener('click', printReport);
    $('#btn-lock-shift').addEventListener('click', lockShift);
    $('#btn-unlock-shift').addEventListener('click', unlockShift);
    $('#btn-export-json').addEventListener('click', exportJSON);
    $('#import-json').addEventListener('change', (e) => {
      if (e.target.files[0]) importJSON(e.target.files[0]);
      e.target.value = '';
    });

    $('#modal-x').addEventListener('click', closeModal);
    $('#modal-bg').addEventListener('click', closeModal);

    document.addEventListener('click', (e) => {
      const delLog = e.target.closest('[data-del-log]');
      if (delLog) deleteLog(delLog.dataset.delLog);
      const editLog = e.target.closest('[data-edit-log]');
      if (editLog) openEditLog(editLog.dataset.editLog);
      const printLog = e.target.closest('[data-print-log]');
      if (printLog) {
        const log = state.logs.find((l) => l.id === printLog.dataset.printLog);
        if (log) printTicket(log);
      }
      const viewPhoto = e.target.closest('[data-view-photo]');
      if (viewPhoto) {
        const log = state.logs.find((l) => l.id === viewPhoto.dataset.viewPhoto);
        if (log?.photo) {
          const w = window.open('');
          if (w) { w.document.write('<img src="' + log.photo + '" style="max-width:100%">'); w.document.close(); }
        }
      }
      const editTruck = e.target.closest('[data-edit-truck]');
      if (editTruck) {
        const t = state.trucks.find((x) => x.id === editTruck.dataset.editTruck);
        if (t) openTruckModal(t);
      }
      const delTruck = e.target.closest('[data-del-truck]');
      if (delTruck) deleteTruck(delTruck.dataset.delTruck);

      const selSite = e.target.closest('[data-select-site]');
      if (selSite) {
        state.currentSiteId = selSite.dataset.selectSite;
        save(KEYS.currentSite, state.currentSiteId);
        updateSitePill();
        renderSites();
        renderRecent();
        toast('Switched to ' + (state.sites.find((s) => s.id === state.currentSiteId)?.code || ''));
      }
      const editSite = e.target.closest('[data-edit-site]');
      if (editSite) {
        const s = state.sites.find((x) => x.id === editSite.dataset.editSite);
        if (s) openSiteModal(s);
      }
      const delSite = e.target.closest('[data-del-site]');
      if (delSite) deleteSite(delSite.dataset.delSite);

      const editUser = e.target.closest('[data-edit-user]');
      if (editUser) {
        const u = state.users.find((x) => x.id === editUser.dataset.editUser);
        if (u) openUserModal(u);
      }
      const toggleU = e.target.closest('[data-toggle-user]');
      if (toggleU) toggleUser(toggleU.dataset.toggleUser);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    bind();
    init();
  });
})();
