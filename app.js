/* GATEID – complete working app */
(function () {
  'use strict';

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  const KEYS = {
    users: 'gateid_users_v2',
    sites: 'gateid_sites_v2',
    trucks: 'gateid_trucks_v2',
    logs: 'gateid_logs_v2',
    session: 'gateid_session_v2',
    settings: 'gateid_settings_v2',
    currentSite: 'gateid_currentsite_v2'
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
      defaultDir: 'IN'
    }
  };

  let state = {
    user: null,
    users: [],
    sites: [],
    trucks: [],
    logs: [],
    settings: {},
    currentSiteId: null,
    stream: null,
    autoTimer: null,
    lastPlate: null,
    lastPlateAt: 0
  };

  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }
  function save(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
  }
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function esc(s) {
    if (!s) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function toast(msg, isErr) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.toggle('err', !!isErr);
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 2800);
  }
  function today() {
    return new Date().toISOString().slice(0, 10);
  }
  function nowTime() {
    return new Date().toTimeString().slice(0, 8);
  }

  /* ---------- INIT ---------- */
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

  /* ---------- AUTH ---------- */
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
    if (state.user.role !== 'admin') {
      $('#tab-users').classList.add('hidden');
    } else {
      $('#tab-users').classList.remove('hidden');
    }
    if (state.user.role === 'viewer') {
      $('#btn-start-cam').disabled = true;
      $('#btn-capture').disabled = true;
      $('#auto-detect').disabled = true;
      $('#btn-add-truck').style.display = 'none';
      $('#btn-add-site').style.display = 'none';
    }
    renderAll();
  }

  function doLogin(e) {
    e.preventDefault();
    const user = $('#login-user').value.trim().toLowerCase();
    const pass = $('#login-pass').value;
    const found = state.users.find(
      (u) => u.username.toLowerCase() === user && u.password === pass && u.active
    );
    if (!found) {
      toast('Invalid username or password', true);
      return;
    }
    state.user = found;
    save(KEYS.session, { userId: found.id });
    const allowed = found.sites.includes('*')
      ? state.sites
      : state.sites.filter((s) => found.sites.includes(s.id));
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

  /* ---------- NAV ---------- */
  function switchTab(name) {
    $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
    $$('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + name));
    if (name === 'log') renderLog();
    if (name === 'trucks') renderTrucks();
    if (name === 'sites') renderSites();
    if (name === 'users') renderUsers();
    if (name === 'dash') renderDash();
    if (name === 'settings') loadSettingsForm();
  }

  /* ---------- SETTINGS ---------- */
  function applySettings() {
    const n = state.settings.name || 'GATEID';
    $('#brand-name').textContent = n;
    $('#app-title').textContent = n;
    document.title = n;
    const dl = $('#mat-dl');
    if (dl) {
      dl.innerHTML = (state.settings.materials || [])
        .map((m) => '<option value="' + esc(m) + '">')
        .join('');
    }
  }

  function loadSettingsForm() {
    $('#set-name').value = state.settings.name || 'GATEID';
    $('#set-materials').value = (state.settings.materials || []).join('\n');
    $('#set-dir').value = state.settings.defaultDir || 'IN';
  }

  function saveSettings() {
    state.settings.name = $('#set-name').value.trim() || 'GATEID';
    state.settings.materials = $('#set-materials').value
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    state.settings.defaultDir = $('#set-dir').value;
    save(KEYS.settings, state.settings);
    applySettings();
    toast('Settings saved');
  }

  function resetDemo() {
    if (!confirm('Reset ALL data to demo? This cannot be undone.')) return;
    save(KEYS.users, DEFAULTS.users);
    save(KEYS.sites, DEFAULTS.sites);
    save(KEYS.trucks, DEFAULTS.trucks);
    save(KEYS.logs, []);
    save(KEYS.settings, DEFAULTS.settings);
    state.users = DEFAULTS.users.slice();
    state.sites = DEFAULTS.sites.slice();
    state.trucks = DEFAULTS.trucks.slice();
    state.logs = [];
    state.settings = Object.assign({}, DEFAULTS.settings);
    applySettings();
    renderAll();
    toast('Demo data restored');
  }

  /* ---------- CAMERA ---------- */
  async function startCamera() {
    try {
      state.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
        audio: false
      });
      const video = $('#video');
      video.srcObject = state.stream;
      $('#cam-overlay').classList.add('hidden');
      $('#btn-start-cam').classList.add('hidden');
      $('#btn-stop-cam').classList.remove('hidden');
      toast('Camera started');
    } catch (err) {
      toast('Camera error: ' + (err.message || 'permission denied'), true);
    }
  }

  function stopCamera() {
    if (state.stream) {
      state.stream.getTracks().forEach((t) => t.stop());
      state.stream = null;
    }
    if (state.autoTimer) {
      clearInterval(state.autoTimer);
      state.autoTimer = null;
    }
    const video = $('#video');
    if (video) video.srcObject = null;
    const overlay = $('#cam-overlay');
    if (overlay) overlay.classList.remove('hidden');
    const start = $('#btn-start-cam');
    if (start) start.classList.remove('hidden');
    const stop = $('#btn-stop-cam');
    if (stop) stop.classList.add('hidden');
    const ad = $('#auto-detect');
    if (ad) ad.checked = false;
    const banner = $('#plate-banner');
    if (banner) banner.classList.add('hidden');
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
    const canvas = $('#canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);

    if (!silent) {
      $('#ocr-bar').classList.remove('hidden');
      $('#ocr-msg').textContent = 'Reading plate…';
    }

    try {
      if (typeof Tesseract === 'undefined') throw new Error('OCR library not loaded');
      const result = await Tesseract.recognize(canvas, 'eng', {
        logger: () => {}
      });
      const plate = cleanPlate(result.data.text);
      $('#ocr-bar').classList.add('hidden');
      if (plate && plate.length >= 4) {
        const now = Date.now();
        if (silent && plate === state.lastPlate && now - state.lastPlateAt < 12000) return;
        state.lastPlate = plate;
        state.lastPlateAt = now;
        $('#plate-text').textContent = plate;
        $('#plate-banner').classList.remove('hidden');
        openQuickLog(plate);
        if (!silent) toast('Plate: ' + plate);
      } else if (!silent) {
        toast('No plate found – try again or use Manual Entry', true);
      }
    } catch (err) {
      $('#ocr-bar').classList.add('hidden');
      if (!silent) toast('OCR failed: ' + err.message, true);
    }
  }

  function toggleAuto(e) {
    if (e.target.checked) {
      if (!state.stream) {
        toast('Start camera first', true);
        e.target.checked = false;
        return;
      }
      toast('Auto Detect ON');
      state.autoTimer = setInterval(() => capturePlate(true), 4000);
    } else {
      if (state.autoTimer) clearInterval(state.autoTimer);
      state.autoTimer = null;
      toast('Auto Detect OFF');
    }
  }

  /* ---------- QUICK LOG ---------- */
  function openQuickLog(plate) {
    const matched = state.trucks.find(
      (t) => t.plate.replace(/[\s\-]/g, '') === (plate || '').replace(/[\s\-]/g, '')
    );
    $('#q-plate').value = plate || '';
    $('#q-dir').value = state.settings.defaultDir || 'IN';
    $('#q-truck').value = matched ? matched.unit : '';
    $('#q-company').value = matched ? matched.company : '';
    $('#q-driver').value = matched ? matched.driver : '';
    $('#q-material').value = '';
    $('#q-notes').value = plate ? 'Auto-detected' : 'Manual entry';
    const dl = $('#truck-dl');
    dl.innerHTML = state.trucks
      .map((t) => '<option value="' + esc(t.unit) + '">' + esc(t.plate) + ' – ' + esc(t.company) + '</option>')
      .join('');
    $('#quick-log').classList.remove('hidden');
    $('#quick-log').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function cancelQuickLog() {
    $('#quick-log').classList.add('hidden');
    $('#plate-banner').classList.add('hidden');
  }

  function saveLog() {
    const plate = $('#q-plate').value.trim().toUpperCase().replace(/\s+/g, '');
    if (!plate || plate.length < 3) {
      toast('Enter a valid plate', true);
      return;
    }
    const site = state.sites.find((s) => s.id === state.currentSiteId);
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
      notes: $('#q-notes').value.trim(),
      loggedBy: state.user.username,
      loggedByName: state.user.name
    };
    state.logs.unshift(entry);
    save(KEYS.logs, state.logs);

    // auto-add to truck registry if new
    if (!state.trucks.some((t) => t.plate.replace(/[\s\-]/g, '') === plate) && entry.truck) {
      state.trucks.push({
        id: uid(),
        plate,
        unit: entry.truck,
        company: entry.company,
        driver: entry.driver,
        tare: 0,
        notes: 'Auto-added from gate'
      });
      save(KEYS.trucks, state.trucks);
    }

    cancelQuickLog();
    toast('Logged ' + plate + ' (' + entry.direction + ')');
    renderRecent();
    renderLog();
    renderDash();
  }

  /* ---------- RENDER HELPERS ---------- */
  function updateSitePill() {
    const site = state.sites.find((s) => s.id === state.currentSiteId);
    $('#site-pill').textContent = site ? site.code : '—';
  }

  function renderRecent() {
    const el = $('#recent-list');
    const list = state.logs.filter((l) => l.siteId === state.currentSiteId).slice(0, 8);
    if (!list.length) {
      el.innerHTML = '<div class="empty">No detections yet at this gate</div>';
      return;
    }
    el.innerHTML = list
      .map(
        (l) =>
          '<div class="feed-item"><span><span class="plate">' +
          esc(l.plate) +
          '</span> · ' +
          l.direction +
          ' · ' +
          esc(l.truck || l.company || '') +
          '</span><span>' +
          esc(l.time) +
          '</span></div>'
      )
      .join('');
  }

  function getFilteredLogs() {
    const q = ($('#log-search')?.value || '').toLowerCase();
    const siteF = $('#log-site-filter')?.value || 'all';
    return state.logs.filter((l) => {
      if (siteF !== 'all' && l.siteId !== siteF) return false;
      if (!state.user.sites.includes('*') && !state.user.sites.includes(l.siteId)) return false;
      if (!q) return true;
      const hay = [l.plate, l.truck, l.company, l.driver, l.material, l.siteCode, l.loggedBy]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }

  function renderLog() {
    const sel = $('#log-site-filter');
    if (sel && sel.options.length <= 1) {
      const allowed = state.user.sites.includes('*')
        ? state.sites
        : state.sites.filter((s) => state.user.sites.includes(s.id));
      allowed.forEach((s) => {
        const o = document.createElement('option');
        o.value = s.id;
        o.textContent = s.code;
        sel.appendChild(o);
      });
    }
    const logs = getFilteredLogs();
    const tbody = $('#log-body');
    if (!logs.length) {
      tbody.innerHTML = '<tr><td colspan="11" class="empty">No records</td></tr>';
    } else {
      tbody.innerHTML = logs
        .map(
          (l) =>
            '<tr>' +
            '<td>' + esc(l.date) + '</td>' +
            '<td>' + esc(l.time) + '</td>' +
            '<td>' + esc(l.siteCode) + '</td>' +
            '<td class="plate-cell">' + esc(l.plate) + '</td>' +
            '<td class="' + (l.direction === 'IN' ? 'dir-in' : 'dir-out') + '">' + l.direction + '</td>' +
            '<td>' + esc(l.truck) + '</td>' +
            '<td>' + esc(l.company) + '</td>' +
            '<td>' + esc(l.driver) + '</td>' +
            '<td>' + esc(l.material) + '</td>' +
            '<td>' + esc(l.loggedByName || l.loggedBy) + '</td>' +
            '<td>' +
            (state.user.role !== 'viewer'
              ? '<button class="btn btn-ghost btn-sm" data-del-log="' + l.id + '">✕</button>'
              : '') +
            '</td></tr>'
        )
        .join('');
    }
    $('#log-count').textContent = logs.length + ' record' + (logs.length !== 1 ? 's' : '');
  }

  function deleteLog(id) {
    if (!confirm('Delete this entry?')) return;
    state.logs = state.logs.filter((l) => l.id !== id);
    save(KEYS.logs, state.logs);
    renderLog();
    renderRecent();
    renderDash();
    toast('Entry deleted');
  }

  function exportCSV() {
    const logs = getFilteredLogs();
    if (!logs.length) {
      toast('Nothing to export', true);
      return;
    }
    const headers = [
      'Date', 'Time', 'Site', 'Site Code', 'Plate', 'Direction', 'Truck',
      'Company', 'Driver', 'Material', 'Notes', 'Logged By', 'Timestamp'
    ];
    const rows = logs.map((l) =>
      [l.date, l.time, l.siteName, l.siteCode, l.plate, l.direction, l.truck,
        l.company, l.driver, l.material, l.notes, l.loggedByName, l.timestamp]
        .map((v) => '"' + String(v ?? '').replace(/"/g, '""') + '"')
        .join(',')
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
    if (!logs.length) {
      toast('Nothing to export', true);
      return;
    }
    if (typeof XLSX === 'undefined') {
      toast('Excel library not loaded', true);
      return;
    }
    const data = logs.map((l) => ({
      Date: l.date,
      Time: l.time,
      Site: l.siteName,
      'Site Code': l.siteCode,
      Plate: l.plate,
      Direction: l.direction,
      Truck: l.truck,
      Company: l.company,
      Driver: l.driver,
      Material: l.material,
      Notes: l.notes,
      'Logged By': l.loggedByName,
      Timestamp: l.timestamp
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Gate Log');
    XLSX.writeFile(wb, 'GATEID-log-' + today() + '.xlsx');
    toast('Excel downloaded');
  }

  /* ---------- TRUCKS ---------- */
  function renderTrucks() {
    const tbody = $('#trucks-body');
    if (!state.trucks.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty">No trucks yet</td></tr>';
      return;
    }
    tbody.innerHTML = state.trucks
      .map(
        (t) =>
          '<tr>' +
          '<td class="plate-cell">' + esc(t.plate) + '</td>' +
          '<td>' + esc(t.unit) + '</td>' +
          '<td>' + esc(t.company) + '</td>' +
          '<td>' + esc(t.driver) + '</td>' +
          '<td>' + (t.tare ? t.tare.toLocaleString() : '—') + '</td>' +
          '<td>' + esc(t.notes) + '</td>' +
          '<td>' +
          (state.user.role !== 'viewer'
            ? '<button class="btn btn-ghost btn-sm" data-edit-truck="' + t.id + '">Edit</button> ' +
              '<button class="btn btn-ghost btn-sm" data-del-truck="' + t.id + '">✕</button>'
            : '') +
          '</td></tr>'
      )
      .join('');
  }

  function openTruckModal(truck) {
    const isEdit = !!truck;
    $('#modal-title').textContent = isEdit ? 'Edit Truck' : 'Add Truck';
    $('#modal-body').innerHTML =
      '<div class="field"><label>License Plate *</label><input id="m-plate" class="plate-input" value="' +
      esc(truck?.plate || '') +
      '"></div>' +
      '<div class="field"><label>Unit / Truck #</label><input id="m-unit" value="' +
      esc(truck?.unit || '') +
      '"></div>' +
      '<div class="field"><label>Company</label><input id="m-company" value="' +
      esc(truck?.company || '') +
      '"></div>' +
      '<div class="field"><label>Driver</label><input id="m-driver" value="' +
      esc(truck?.driver || '') +
      '"></div>' +
      '<div class="field"><label>Tare (lbs)</label><input id="m-tare" type="number" value="' +
      (truck?.tare || '') +
      '"></div>' +
      '<div class="field"><label>Notes</label><input id="m-notes" value="' +
      esc(truck?.notes || '') +
      '"></div>';
    $('#modal-foot').innerHTML =
      '<button class="btn btn-ghost" id="m-cancel">Cancel</button>' +
      '<button class="btn btn-primary" id="m-save">' +
      (isEdit ? 'Update' : 'Add') +
      '</button>';
    $('#modal').classList.remove('hidden');
    $('#m-cancel').onclick = closeModal;
    $('#m-save').onclick = () => {
      const plate = $('#m-plate').value.trim().toUpperCase().replace(/\s+/g, '');
      if (!plate) {
        toast('Plate required', true);
        return;
      }
      const data = {
        plate,
        unit: $('#m-unit').value.trim(),
        company: $('#m-company').value.trim(),
        driver: $('#m-driver').value.trim(),
        tare: parseInt($('#m-tare').value, 10) || 0,
        notes: $('#m-notes').value.trim()
      };
      if (isEdit) {
        Object.assign(truck, data);
      } else {
        state.trucks.push(Object.assign({ id: uid() }, data));
      }
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

  /* ---------- SITES ---------- */
  function renderSites() {
    const grid = $('#sites-grid');
    const allowed = state.user.sites.includes('*')
      ? state.sites
      : state.sites.filter((s) => state.user.sites.includes(s.id));
    grid.innerHTML = allowed
      .map(
        (s) =>
          '<div class="site-card' +
          (s.id === state.currentSiteId ? ' active' : '') +
          '" data-site="' +
          s.id +
          '">' +
          '<h4>' +
          esc(s.name) +
          '</h4>' +
          '<p>' +
          esc(s.code) +
          ' · ' +
          esc(s.location || '') +
          '</p>' +
          '<p style="margin-top:8px;font-size:0.8rem;color:var(--green)">' +
          (s.active ? '● Active' : '○ Inactive') +
          '</p></div>'
      )
      .join('');
  }

  function openSiteModal(site) {
    const isEdit = !!site;
    $('#modal-title').textContent = isEdit ? 'Edit Site' : 'Add Site';
    $('#modal-body').innerHTML =
      '<div class="field"><label>Site Name *</label><input id="m-sname" value="' +
      esc(site?.name || '') +
      '"></div>' +
      '<div class="field"><label>Code *</label><input id="m-scode" value="' +
      esc(site?.code || '') +
      '" placeholder="e.g. NQ-MAIN"></div>' +
      '<div class="field"><label>Location</label><input id="m-sloc" value="' +
      esc(site?.location || '') +
      '"></div>';
    $('#modal-foot').innerHTML =
      '<button class="btn btn-ghost" id="m-cancel">Cancel</button>' +
      '<button class="btn btn-primary" id="m-save">Save</button>';
    $('#modal').classList.remove('hidden');
    $('#m-cancel').onclick = closeModal;
    $('#m-save').onclick = () => {
      const name = $('#m-sname').value.trim();
      const code = $('#m-scode').value.trim().toUpperCase();
      if (!name || !code) {
        toast('Name and code required', true);
        return;
      }
      if (isEdit) {
        site.name = name;
        site.code = code;
        site.location = $('#m-sloc').value.trim();
      } else {
        state.sites.push({
          id: uid(),
          name,
          code,
          location: $('#m-sloc').value.trim(),
          active: true
        });
      }
      save(KEYS.sites, state.sites);
      closeModal();
      renderSites();
      toast('Site saved');
    };
  }

  /* ---------- USERS ---------- */
  function renderUsers() {
    if (state.user.role !== 'admin') return;
    const tbody = $('#users-body');
    tbody.innerHTML = state.users
      .map(
        (u) =>
          '<tr>' +
          '<td>' + esc(u.username) + '</td>' +
          '<td>' + esc(u.name) + '</td>' +
          '<td>' + u.role + '</td>' +
          '<td>' +
          (u.sites.includes('*')
            ? 'All Sites'
            : u.sites.map((id) => state.sites.find((s) => s.id === id)?.code || id).join(', ')) +
          '</td>' +
          '<td>' + (u.active ? 'Active' : 'Disabled') + '</td>' +
          '<td>' +
          '<button class="btn btn-ghost btn-sm" data-edit-user="' + u.id + '">Edit</button> ' +
          (u.username !== 'admin'
            ? '<button class="btn btn-ghost btn-sm" data-toggle-user="' + u.id + '">' +
              (u.active ? 'Disable' : 'Enable') +
              '</button>'
            : '') +
          '</td></tr>'
      )
      .join('');
  }

  function openUserModal(user) {
    const isEdit = !!user;
    const siteOpts = state.sites
      .map(
        (s) =>
          '<label style="display:block;margin:4px 0"><input type="checkbox" class="m-site-cb" value="' +
          s.id +
          '" ' +
          (user?.sites?.includes(s.id) || user?.sites?.includes('*') ? 'checked' : '') +
          '> ' +
          esc(s.code) +
          ' – ' +
          esc(s.name) +
          '</label>'
      )
      .join('');
    $('#modal-title').textContent = isEdit ? 'Edit User' : 'Add User';
    $('#modal-body').innerHTML =
      '<div class="field"><label>Username *</label><input id="m-uname" value="' +
      esc(user?.username || '') +
      '" ' +
      (isEdit ? 'readonly' : '') +
      '></div>' +
      '<div class="field"><label>Full Name</label><input id="m-name" value="' +
      esc(user?.name || '') +
      '"></div>' +
      '<div class="field"><label>Password ' +
      (isEdit ? '(leave blank to keep)' : '*') +
      '</label><input id="m-pass" type="password"></div>' +
      '<div class="field"><label>Role</label><select id="m-role">' +
      '<option value="operator"' +
      (user?.role === 'operator' ? ' selected' : '') +
      '>Operator</option>' +
      '<option value="viewer"' +
      (user?.role === 'viewer' ? ' selected' : '') +
      '>Viewer</option>' +
      '<option value="admin"' +
      (user?.role === 'admin' ? ' selected' : '') +
      '>Admin</option></select></div>' +
      '<div class="field"><label>Site Access</label>' +
      '<label style="display:block;margin:4px 0"><input type="checkbox" id="m-all-sites" ' +
      (user?.sites?.includes('*') ? 'checked' : '') +
      '> All Sites</label>' +
      '<div id="m-sites-list">' +
      siteOpts +
      '</div></div>';
    $('#modal-foot').innerHTML =
      '<button class="btn btn-ghost" id="m-cancel">Cancel</button>' +
      '<button class="btn btn-primary" id="m-save">Save</button>';
    $('#modal').classList.remove('hidden');
    $('#m-all-sites').onchange = (e) => {
      $$('.m-site-cb').forEach((cb) => (cb.disabled = e.target.checked));
    };
    $('#m-cancel').onclick = closeModal;
    $('#m-save').onclick = () => {
      const username = $('#m-uname').value.trim().toLowerCase();
      const name = $('#m-name').value.trim();
      const pass = $('#m-pass').value;
      const role = $('#m-role').value;
      const allSites = $('#m-all-sites').checked;
      const sites = allSites
        ? ['*']
        : $$('.m-site-cb')
            .filter((c) => c.checked)
            .map((c) => c.value);
      if (!username) {
        toast('Username required', true);
        return;
      }
      if (!isEdit && !pass) {
        toast('Password required', true);
        return;
      }
      if (isEdit) {
        user.name = name;
        user.role = role;
        user.sites = sites;
        if (pass) user.password = pass;
      } else {
        if (state.users.some((u) => u.username === username)) {
          toast('Username already exists', true);
          return;
        }
        state.users.push({
          id: uid(),
          username,
          password: pass,
          name,
          role,
          sites,
          active: true
        });
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

  /* ---------- DASHBOARD ---------- */
  function renderDash() {
    const t = today();
    const allowed = state.logs.filter((l) => {
      if (!state.user.sites.includes('*') && !state.user.sites.includes(l.siteId)) return false;
      return true;
    });
    const todayLogs = allowed.filter((l) => l.date === t);
    $('#s-today').textContent = todayLogs.length;
    $('#s-in').textContent = todayLogs.filter((l) => l.direction === 'IN').length;
    $('#s-out').textContent = todayLogs.filter((l) => l.direction === 'OUT').length;
    $('#s-unique').textContent = new Set(todayLogs.map((l) => l.plate)).size;

    const bySite = {};
    todayLogs.forEach((l) => {
      bySite[l.siteCode] = (bySite[l.siteCode] || 0) + 1;
    });
    const siteEl = $('#dash-sites');
    if (!Object.keys(bySite).length) {
      siteEl.innerHTML = '<div class="empty">No activity today</div>';
    } else {
      siteEl.innerHTML = Object.entries(bySite)
        .map(
          ([code, count]) =>
            '<div class="feed-item"><span>' + esc(code) + '</span><span>' + count + ' entries</span></div>'
        )
        .join('');
    }

    const recent = allowed.slice(0, 10);
    const dashRecent = $('#dash-recent');
    if (!recent.length) {
      dashRecent.innerHTML = '<div class="empty">No logs yet</div>';
    } else {
      dashRecent.innerHTML = recent
        .map(
          (l) =>
            '<div class="feed-item"><span><span class="plate">' +
            esc(l.plate) +
            '</span> ' +
            l.direction +
            ' @ ' +
            esc(l.siteCode) +
            '</span><span>' +
            esc(l.date) +
            ' ' +
            esc(l.time) +
            '</span></div>'
        )
        .join('');
    }
  }

  function renderAll() {
    renderRecent();
    renderLog();
    renderTrucks();
    renderSites();
    renderUsers();
    renderDash();
  }

  function closeModal() {
    $('#modal').classList.add('hidden');
  }

  /* ---------- EVENT BINDING ---------- */
  function bind() {
    $('#form-login').addEventListener('submit', doLogin);
    $('#btn-logout').addEventListener('click', doLogout);

    $$('.tab').forEach((tab) => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    $('#btn-start-cam').addEventListener('click', startCamera);
    $('#btn-stop-cam').addEventListener('click', stopCamera);
    $('#btn-capture').addEventListener('click', () => capturePlate(false));
    $('#btn-manual').addEventListener('click', () => openQuickLog(''));
    $('#auto-detect').addEventListener('change', toggleAuto);

    $('#btn-save-log').addEventListener('click', saveLog);
    $('#btn-cancel-log').addEventListener('click', cancelQuickLog);

    $('#log-search').addEventListener('input', renderLog);
    $('#log-site-filter').addEventListener('change', renderLog);
    $('#btn-export-csv').addEventListener('click', exportCSV);
    $('#btn-export-xlsx').addEventListener('click', exportXLSX);

    $('#btn-add-truck').addEventListener('click', () => openTruckModal(null));
    $('#btn-add-site').addEventListener('click', () => {
      if (state.user.role !== 'admin' && state.user.role !== 'operator') return;
      openSiteModal(null);
    });
    $('#btn-add-user').addEventListener('click', () => openUserModal(null));

    $('#btn-save-settings').addEventListener('click', saveSettings);
    $('#btn-reset-demo').addEventListener('click', resetDemo);

    $('#modal-x').addEventListener('click', closeModal);
    $('#modal-bg').addEventListener('click', closeModal);

    // delegated clicks for dynamic buttons
    document.addEventListener('click', (e) => {
      const delLog = e.target.closest('[data-del-log]');
      if (delLog) deleteLog(delLog.dataset.delLog);

      const editTruck = e.target.closest('[data-edit-truck]');
      if (editTruck) {
        const t = state.trucks.find((x) => x.id === editTruck.dataset.editTruck);
        if (t) openTruckModal(t);
      }
      const delTruck = e.target.closest('[data-del-truck]');
      if (delTruck) deleteTruck(delTruck.dataset.delTruck);

      const siteCard = e.target.closest('[data-site]');
      if (siteCard) {
        state.currentSiteId = siteCard.dataset.site;
        save(KEYS.currentSite, state.currentSiteId);
        updateSitePill();
        renderSites();
        renderRecent();
        toast('Switched to ' + (state.sites.find((s) => s.id === state.currentSiteId)?.code || ''));
      }

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
