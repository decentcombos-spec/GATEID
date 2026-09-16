/**
 * GATEID – Gate Identification & Truck Tracking System
 * Multi-site • Multi-user • License Plate Logging • Spreadsheet Export
 */

const STORAGE = {
  users: 'gateid_users',
  sites: 'gateid_sites',
  trucks: 'gateid_trucks',
  logs: 'gateid_logs',
  session: 'gateid_session',
  currentSite: 'gateid_current_site'
};

// ==================== DEFAULT DATA ====================
const DEFAULT_USERS = [
  { id: 'u1', username: 'admin', password: 'admin123', name: 'System Admin', role: 'admin', sites: ['*'], active: true },
  { id: 'u2', username: 'operator', password: 'op123', name: 'Gate Operator', role: 'operator', sites: ['s1', 's2'], active: true },
  { id: 'u3', username: 'viewer', password: 'view123', name: 'Office Viewer', role: 'viewer', sites: ['s1', 's2'], active: true }
];

const DEFAULT_SITES = [
  { id: 's1', name: 'North Quarry – Main Gate', code: 'NQ-MAIN', location: 'North Pit', active: true },
  { id: 's2', name: 'South Aggregate – Scale Gate', code: 'SA-SCALE', location: 'South Yard', active: true },
  { id: 's3', name: 'East Sand Pit – Exit', code: 'ES-EXIT', location: 'East Road', active: true }
];

const DEFAULT_TRUCKS = [
  { id: 't1', plate: 'ABC1234', unit: 'T-101', company: 'Rock Haulers LLC', driver: 'John Smith', tare: 28500, notes: 'Tri-axle' },
  { id: 't2', plate: 'XYZ9876', unit: 'T-205', company: 'Stone Transport', driver: 'Maria Lopez', tare: 31200, notes: '' },
  { id: 't3', plate: 'DEF4567', unit: 'U-88', company: 'Quarry Express', driver: 'Mike Chen', tare: 26800, notes: 'End dump' }
];

// ==================== STATE ====================
let state = {
  user: null,
  currentSiteId: null,
  sites: [],
  users: [],
  trucks: [],
  logs: [],
  stream: null,
  autoMode: false,
  autoInterval: null,
  lastDetectedPlate: null,
  lastDetectTime: 0
};

// ==================== HELPERS ====================
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

function save(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

function toast(msg, isError = false) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.toggle('error', isError);
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 2800);
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function nowParts() {
  const d = new Date();
  return {
    date: d.toISOString().slice(0, 10),
    time: d.toTimeString().slice(0, 8),
    iso: d.toISOString()
  };
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', () => {
  // Seed data if empty
  if (!localStorage.getItem(STORAGE.users)) save(STORAGE.users, DEFAULT_USERS);
  if (!localStorage.getItem(STORAGE.sites)) save(STORAGE.sites, DEFAULT_SITES);
  if (!localStorage.getItem(STORAGE.trucks)) save(STORAGE.trucks, DEFAULT_TRUCKS);
  if (!localStorage.getItem(STORAGE.logs)) save(STORAGE.logs, []);

  state.users = load(STORAGE.users, DEFAULT_USERS);
  state.sites = load(STORAGE.sites, DEFAULT_SITES);
  state.trucks = load(STORAGE.trucks, DEFAULT_TRUCKS);
  state.logs = load(STORAGE.logs, []);

  // Restore session
  const session = load(STORAGE.session, null);
  if (session) {
    const user = state.users.find(u => u.id === session.userId && u.active);
    if (user) {
      state.user = user;
      state.currentSiteId = load(STORAGE.currentSite, state.sites[0]?.id);
      showMainApp();
      return;
    }
  }
  showLogin();
});

// ==================== AUTH ====================
function showLogin() {
  $('#login-screen').classList.remove('hidden');
  $('#main-app').classList.add('hidden');
  $('#login-form').onsubmit = (e) => {
    e.preventDefault();
    const user = $('#login-user').value.trim().toLowerCase();
    const pass = $('#login-pass').value;
    const found = state.users.find(u => u.username.toLowerCase() === user && u.password === pass && u.active);
    if (!found) {
      toast('Invalid username or password', true);
      return;
    }
    state.user = found;
    save(STORAGE.session, { userId: found.id });
    // Set default site
    const allowed = found.sites.includes('*') ? state.sites : state.sites.filter(s => found.sites.includes(s.id));
    state.currentSiteId = allowed[0]?.id || state.sites[0]?.id;
    save(STORAGE.currentSite, state.currentSiteId);
    showMainApp();
    toast(`Welcome, ${found.name}`);
  };
}

function showMainApp() {
  $('#login-screen').classList.add('hidden');
  $('#main-app').classList.remove('hidden');
  $('#current-user').textContent = `${state.user.name} (${state.user.role})`;
  updateSiteBadge();
  setupNav();
  setupCamera();
  setupLogView();
  setupTrucksView();
  setupSitesView();
  setupUsersView();
  setupDashboard();
  // Role restrictions
  if (state.user.role === 'viewer') {
    $('#btn-start-cam')?.setAttribute('disabled', true);
    $('#btn-capture-plate')?.setAttribute('disabled', true);
    $('#auto-mode')?.setAttribute('disabled', true);
  }
  if (state.user.role !== 'admin') {
    $('#nav-users')?.classList.add('hidden');
  }
  renderAll();
}

function logout() {
  stopCamera();
  state.user = null;
  save(STORAGE.session, null);
  showLogin();
  $('#login-user').value = '';
  $('#login-pass').value = '';
}

$('#btn-logout')?.addEventListener('click', logout);

// ==================== NAV ====================
function setupNav() {
  $$('.nav-item').forEach(btn => {
    btn.onclick = () => {
      $$('.nav-item').forEach(b => b.classList.remove('active'));
      $$('.view').forEach(v => v.classList.remove('active'));
      btn.classList.add('active');
      $(`#view-${btn.dataset.view}`).classList.add('active');
      if (btn.dataset.view === 'log') renderLogTable();
      if (btn.dataset.view === 'dashboard') updateDashboard();
      if (btn.dataset.view === 'trucks') renderTrucks();
      if (btn.dataset.view === 'sites') renderSites();
      if (btn.dataset.view === 'users') renderUsers();
    };
  });
}

function updateSiteBadge() {
  const site = state.sites.find(s => s.id === state.currentSiteId);
  $('#current-site-name').textContent = site ? site.code : '—';
}

// ==================== CAMERA & ANPR ====================
function setupCamera() {
  const video = $('#gate-video');
  const overlay = $('#camera-overlay');

  $('#btn-start-cam').onclick = async () => {
    try {
      state.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
      video.srcObject = state.stream;
      overlay.classList.add('hidden');
      $('#btn-start-cam').classList.add('hidden');
      $('#btn-stop-cam').classList.remove('hidden');
      toast('Camera started');
    } catch (err) {
      toast('Camera access denied or unavailable', true);
      console.error(err);
    }
  };

  $('#btn-stop-cam').onclick = () => stopCamera();

  $('#btn-capture-plate').onclick = () => {
    if (!state.stream) {
      toast('Start the camera first', true);
      return;
    }
    captureAndReadPlate();
  };

  $('#btn-manual-entry').onclick = () => {
    openQuickLog({ plate: '', confidence: 0, manual: true });
  };

  $('#auto-mode').onchange = (e) => {
    state.autoMode = e.target.checked;
    if (state.autoMode) {
      if (!state.stream) {
        toast('Start camera before enabling Auto Detect', true);
        e.target.checked = false;
        state.autoMode = false;
        return;
      }
      toast('Auto Detect ON – will scan every 4 seconds');
      state.autoInterval = setInterval(() => {
        if (state.autoMode && state.stream) captureAndReadPlate(true);
      }, 4000);
    } else {
      clearInterval(state.autoInterval);
      state.autoInterval = null;
      toast('Auto Detect OFF');
    }
  };

  $('#btn-confirm-log').onclick = confirmLog;
  $('#btn-cancel-log').onclick = () => {
    $('#quick-log').classList.add('hidden');
    $('#plate-result').classList.add('hidden');
  };
}

function stopCamera() {
  if (state.stream) {
    state.stream.getTracks().forEach(t => t.stop());
    state.stream = null;
  }
  clearInterval(state.autoInterval);
  state.autoInterval = null;
  state.autoMode = false;
  $('#auto-mode').checked = false;
  $('#gate-video').srcObject = null;
  $('#camera-overlay').classList.remove('hidden');
  $('#btn-start-cam').classList.remove('hidden');
  $('#btn-stop-cam').classList.add('hidden');
  $('#plate-result').classList.add('hidden');
}

async function captureAndReadPlate(isAuto = false) {
  // Cooldown to avoid spam in auto mode
  const now = Date.now();
  if (isAuto && now - state.lastDetectTime < 3500) return;
  state.lastDetectTime = now;

  const video = $('#gate-video');
  const canvas = $('#gate-canvas');
  if (!video.videoWidth) return;

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0);

  // Show progress
  const progress = $('#ocr-progress');
  progress.classList.remove('hidden');
  $('#ocr-text').textContent = isAuto ? 'Auto-scanning for plate...' : 'Reading license plate...';

  try {
    // Convert canvas to blob for Tesseract
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.9));

    const worker = await Tesseract.createWorker('eng', 1, {
      logger: () => {}
    });

    // Focus on alphanumeric for plates
    await worker.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -',
      tessedit_pageseg_mode: '7' // single line / single word style
    });

    const { data: { text, confidence } } = await worker.recognize(blob);
    await worker.terminate();

    progress.classList.add('hidden');

    const plate = cleanPlate(text);
    if (plate && plate.length >= 4) {
      // Avoid logging same plate repeatedly in auto mode
      if (isAuto && plate === state.lastDetectedPlate && now - state.lastDetectTime < 15000) {
        return;
      }
      state.lastDetectedPlate = plate;
      showPlateResult(plate, confidence);
      openQuickLog({ plate, confidence, auto: isAuto });
      if (!isAuto) toast(`Plate detected: ${plate}`);
    } else {
      if (!isAuto) toast('No clear plate detected. Try again or use Manual Entry.', true);
    }
  } catch (err) {
    console.error(err);
    progress.classList.add('hidden');
    if (!isAuto) toast('OCR failed. Use Manual Entry.', true);
  }
}

function cleanPlate(raw) {
  if (!raw) return '';
  // Take the best looking token that looks like a plate
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9\s\-]/g, ' ').trim();
  const candidates = cleaned.split(/\s+/).filter(t => t.length >= 4 && t.length <= 10);
  // Prefer ones with mix of letters and numbers
  candidates.sort((a, b) => {
    const score = (s) => (/[A-Z]/.test(s) && /[0-9]/.test(s) ? 10 : 0) + s.length;
    return score(b) - score(a);
  });
  return candidates[0] || cleaned.replace(/\s/g, '').slice(0, 10);
}

function showPlateResult(plate, confidence) {
  const el = $('#plate-result');
  $('#detected-plate').textContent = plate;
  $('#plate-meta').textContent = confidence ? `Confidence ~${Math.round(confidence)}%` : '';
  el.classList.remove('hidden');
}

function openQuickLog({ plate, confidence, auto, manual }) {
  const matched = state.trucks.find(t => t.plate.replace(/[\s\-]/g, '') === plate.replace(/[\s\-]/g, ''));
  $('#log-plate').value = plate || '';
  $('#log-direction').value = 'IN';
  $('#log-truck').value = matched ? matched.unit : '';
  $('#log-company').value = matched ? matched.company : '';
  $('#log-driver').value = matched ? matched.driver : '';
  $('#log-material').value = '';
  $('#log-notes').value = auto ? 'Auto-detected' : (manual ? 'Manual entry' : '');
  // Fill datalist
  const dl = $('#truck-list');
  dl.innerHTML = state.trucks.map(t => `<option value="${escapeHtml(t.unit)}">${escapeHtml(t.plate)} – ${escapeHtml(t.company)}</option>`).join('');
  $('#quick-log').classList.remove('hidden');
  // Auto-scroll into view on mobile
  $('#quick-log').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function confirmLog() {
  const plate = $('#log-plate').value.trim().toUpperCase().replace(/\s+/g, '');
  if (!plate || plate.length < 3) {
    toast('Enter a valid plate', true);
    return;
  }

  const site = state.sites.find(s => s.id === state.currentSiteId);
  const t = nowParts();

  const entry = {
    id: uid(),
    date: t.date,
    time: t.time,
    timestamp: t.iso,
    siteId: state.currentSiteId,
    siteName: site?.name || 'Unknown',
    siteCode: site?.code || '',
    plate,
    direction: $('#log-direction').value,
    truck: $('#log-truck').value.trim(),
    company: $('#log-company').value.trim(),
    driver: $('#log-driver').value.trim(),
    material: $('#log-material').value.trim(),
    notes: $('#log-notes').value.trim(),
    loggedBy: state.user.username,
    loggedByName: state.user.name
  };

  state.logs.unshift(entry);
  save(STORAGE.logs, state.logs);

  // If plate not in registry, optionally offer to add (simple auto-add for now)
  const exists = state.trucks.some(tr => tr.plate.replace(/[\s\-]/g, '') === plate);
  if (!exists && entry.truck) {
    state.trucks.push({
      id: uid(),
      plate,
      unit: entry.truck,
      company: entry.company,
      driver: entry.driver,
      tare: 0,
      notes: 'Auto-added from gate'
    });
    save(STORAGE.trucks, state.trucks);
  }

  $('#quick-log').classList.add('hidden');
  $('#plate-result').classList.add('hidden');
  toast(`Logged ${plate} (${entry.direction}) → Spreadsheet`);
  renderRecentDetections();
  renderLogTable();
  updateDashboard();
}

// ==================== RECENT DETECTIONS ====================
function renderRecentDetections() {
  const el = $('#recent-detections');
  const recent = state.logs.filter(l => l.siteId === state.currentSiteId).slice(0, 8);
  if (!recent.length) {
    el.innerHTML = '<p class="empty-state">No detections yet at this gate</p>';
    return;
  }
  el.innerHTML = recent.map(l => `
    <div class="feed-item">
      <span><span class="plate">${escapeHtml(l.plate)}</span> · ${l.direction} · ${escapeHtml(l.truck || l.company || '')}</span>
      <span class="feed-meta">${l.time}</span>
    </div>
  `).join('');
}

// ==================== SPREADSHEET / LOG ====================
function setupLogView() {
  $('#log-search').oninput = () => renderLogTable();
  $('#log-filter-site').onchange = () => renderLogTable();
  $('#btn-export-xlsx').onclick = () => exportExcel();
  $('#btn-export-csv').onclick = () => exportCSV();
}

function getFilteredLogs() {
  const q = ($('#log-search')?.value || '').toLowerCase();
  const siteFilter = $('#log-filter-site')?.value || 'all';
  return state.logs.filter(l => {
    if (siteFilter !== 'all' && l.siteId !== siteFilter) return false;
    // Permission: only show sites user can access
    if (!state.user.sites.includes('*') && !state.user.sites.includes(l.siteId)) return false;
    if (!q) return true;
    const hay = `${l.plate} ${l.truck} ${l.company} ${l.driver} ${l.material} ${l.siteCode} ${l.loggedBy}`.toLowerCase();
    return hay.includes(q);
  });
}

function renderLogTable() {
  // Populate site filter
  const sel = $('#log-filter-site');
  if (sel && sel.options.length <= 1) {
    const allowed = state.user.sites.includes('*') ? state.sites : state.sites.filter(s => state.user.sites.includes(s.id));
    allowed.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.code;
      sel.appendChild(opt);
    });
  }

  const logs = getFilteredLogs();
  const tbody = $('#log-tbody');
  if (!logs.length) {
    tbody.innerHTML = `<tr><td colspan="11" class="empty-state">No records found</td></tr>`;
  } else {
    tbody.innerHTML = logs.map(l => `
      <tr>
        <td>${l.date}</td>
        <td>${l.time}</td>
        <td>${escapeHtml(l.siteCode)}</td>
        <td class="plate-cell">${escapeHtml(l.plate)}</td>
        <td class="${l.direction === 'IN' ? 'dir-in' : 'dir-out'}">${l.direction}</td>
        <td>${escapeHtml(l.truck)}</td>
        <td>${escapeHtml(l.company)}</td>
        <td>${escapeHtml(l.driver)}</td>
        <td>${escapeHtml(l.material)}</td>
        <td>${escapeHtml(l.loggedByName || l.loggedBy)}</td>
        <td>
          ${state.user.role !== 'viewer' ? `<button class="btn btn-ghost btn-sm" onclick="deleteLog('${l.id}')">✕</button>` : ''}
        </td>
      </tr>
    `).join('');
  }
  $('#log-count').textContent = `${logs.length} record${logs.length !== 1 ? 's' : ''}`;
}

function deleteLog(id) {
  if (!confirm('Delete this log entry?')) return;
  state.logs = state.logs.filter(l => l.id !== id);
  save(STORAGE.logs, state.logs);
  renderLogTable();
  renderRecentDetections();
  updateDashboard();
  toast('Entry deleted');
}

// Make deleteLog global for onclick
window.deleteLog = deleteLog;

function exportCSV() {
  const logs = getFilteredLogs();
  if (!logs.length) { toast('Nothing to export', true); return; }
  const headers = ['Date','Time','Site','Site Code','Plate','Direction','Truck','Company','Driver','Material','Notes','Logged By','Timestamp'];
  const rows = logs.map(l => [l.date,l.time,l.siteName,l.siteCode,l.plate,l.direction,l.truck,l.company,l.driver,l.material,l.notes,l.loggedByName,l.timestamp]
    .map(v => `"${String(v??'').replace(/"/g,'""')}"`).join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  downloadBlob(csv, `GATEID-log-${new Date().toISOString().slice(0,10)}.csv`, 'text/csv');
  toast('CSV downloaded');
}

function exportExcel() {
  const logs = getFilteredLogs();
  if (!logs.length) { toast('Nothing to export', true); return; }
  const data = logs.map(l => ({
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
  XLSX.writeFile(wb, `GATEID-log-${new Date().toISOString().slice(0,10)}.xlsx`);
  toast('Excel file downloaded');
}

function downloadBlob(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ==================== TRUCKS ====================
function setupTrucksView() {
  $('#btn-add-truck').onclick = () => openTruckModal();
}

function renderTrucks() {
  const tbody = $('#trucks-tbody');
  if (!state.trucks.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No trucks registered yet</td></tr>`;
    return;
  }
  tbody.innerHTML = state.trucks.map(t => `
    <tr>
      <td class="plate-cell">${escapeHtml(t.plate)}</td>
      <td>${escapeHtml(t.unit)}</td>
      <td>${escapeHtml(t.company)}</td>
      <td>${escapeHtml(t.driver)}</td>
      <td>${t.tare ? t.tare.toLocaleString() : '—'}</td>
      <td>${escapeHtml(t.notes)}</td>
      <td>
        ${state.user.role !== 'viewer' ? `
          <button class="btn btn-ghost btn-sm" onclick="editTruck('${t.id}')">Edit</button>
          <button class="btn btn-ghost btn-sm" onclick="deleteTruck('${t.id}')">✕</button>
        ` : ''}
      </td>
    </tr>
  `).join('');
}

window.editTruck = (id) => openTruckModal(state.trucks.find(t => t.id === id));
window.deleteTruck = (id) => {
  if (!confirm('Remove this truck from registry?')) return;
  state.trucks = state.trucks.filter(t => t.id !== id);
  save(STORAGE.trucks, state.trucks);
  renderTrucks();
  toast('Truck removed');
};

function openTruckModal(truck = null) {
  const isEdit = !!truck;
  $('#modal-title').textContent = isEdit ? 'Edit Truck' : 'Add Truck';
  $('#modal-body').innerHTML = `
    <div class="form-group"><label>License Plate *</label><input id="m-plate" value="${escapeHtml(truck?.plate||'')}" class="plate-input" required></div>
    <div class="form-group"><label>Unit / Truck #</label><input id="m-unit" value="${escapeHtml(truck?.unit||'')}"></div>
    <div class="form-group"><label>Company / Hauler</label><input id="m-company" value="${escapeHtml(truck?.company||'')}"></div>
    <div class="form-group"><label>Default Driver</label><input id="m-driver" value="${escapeHtml(truck?.driver||'')}"></div>
    <div class="form-group"><label>Tare Weight (lbs)</label><input id="m-tare" type="number" value="${truck?.tare||''}"></div>
    <div class="form-group"><label>Notes</label><input id="m-notes" value="${escapeHtml(truck?.notes||'')}"></div>
  `;
  $('#modal-footer').innerHTML = `
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" id="m-save-truck">${isEdit ? 'Update' : 'Add'}</button>
  `;
  $('#modal').classList.remove('hidden');
  $('#m-save-truck').onclick = () => {
    const plate = $('#m-plate').value.trim().toUpperCase().replace(/\s+/g,'');
    if (!plate) { toast('Plate is required', true); return; }
    const data = {
      plate,
      unit: $('#m-unit').value.trim(),
      company: $('#m-company').value.trim(),
      driver: $('#m-driver').value.trim(),
      tare: parseInt($('#m-tare').value) || 0,
      notes: $('#m-notes').value.trim()
    };
    if (isEdit) {
      Object.assign(truck, data);
    } else {
      state.trucks.push({ id: uid(), ...data });
    }
    save(STORAGE.trucks, state.trucks);
    closeModal();
    renderTrucks();
    toast(isEdit ? 'Truck updated' : 'Truck added');
  };
}

// ==================== SITES ====================
function setupSitesView() {
  $('#btn-add-site')?.addEventListener('click', () => {
    if (state.user.role !== 'admin') return;
    openSiteModal();
  });
}

function renderSites() {
  const grid = $('#sites-grid');
  const allowed = state.user.sites.includes('*') ? state.sites : state.sites.filter(s => state.user.sites.includes(s.id));
  grid.innerHTML = allowed.map(s => `
    <div class="site-card ${s.id === state.currentSiteId ? 'active' : ''}" data-id="${s.id}">
      <h4>${escapeHtml(s.name)}</h4>
      <p>${escapeHtml(s.code)} · ${escapeHtml(s.location || '')}</p>
      <div class="site-status">${s.active ? '● Active' : '○ Inactive'}</div>
    </div>
  `).join('');

  grid.querySelectorAll('.site-card').forEach(card => {
    card.onclick = () => {
      state.currentSiteId = card.dataset.id;
      save(STORAGE.currentSite, state.currentSiteId);
      updateSiteBadge();
      renderSites();
      renderRecentDetections();
      toast(`Switched to ${state.sites.find(s=>s.id===state.currentSiteId)?.code}`);
    };
  });
}

function openSiteModal(site = null) {
  const isEdit = !!site;
  $('#modal-title').textContent = isEdit ? 'Edit Site' : 'Add Site';
  $('#modal-body').innerHTML = `
    <div class="form-group"><label>Site Name *</label><input id="m-sname" value="${escapeHtml(site?.name||'')}"></div>
    <div class="form-group"><label>Code *</label><input id="m-scode" value="${escapeHtml(site?.code||'')}" placeholder="e.g. NQ-MAIN"></div>
    <div class="form-group"><label>Location</label><input id="m-sloc" value="${escapeHtml(site?.location||'')}"></div>
  `;
  $('#modal-footer').innerHTML = `
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" id="m-save-site">Save</button>
  `;
  $('#modal').classList.remove('hidden');
  $('#m-save-site').onclick = () => {
    const name = $('#m-sname').value.trim();
    const code = $('#m-scode').value.trim().toUpperCase();
    if (!name || !code) { toast('Name and code required', true); return; }
    if (isEdit) {
      site.name = name; site.code = code; site.location = $('#m-sloc').value.trim();
    } else {
      state.sites.push({ id: uid(), name, code, location: $('#m-sloc').value.trim(), active: true });
    }
    save(STORAGE.sites, state.sites);
    closeModal();
    renderSites();
    toast('Site saved');
  };
}

// ==================== USERS ====================
function setupUsersView() {
  $('#btn-add-user')?.addEventListener('click', () => openUserModal());
}

function renderUsers() {
  if (state.user.role !== 'admin') return;
  const tbody = $('#users-tbody');
  tbody.innerHTML = state.users.map(u => `
    <tr>
      <td>${escapeHtml(u.username)}</td>
      <td>${escapeHtml(u.name)}</td>
      <td>${u.role}</td>
      <td>${u.sites.includes('*') ? 'All Sites' : u.sites.map(id => state.sites.find(s=>s.id===id)?.code || id).join(', ')}</td>
      <td>${u.active ? 'Active' : 'Disabled'}</td>
      <td>
        <button class="btn btn-ghost btn-sm" onclick="editUser('${u.id}')">Edit</button>
        ${u.username !== 'admin' ? `<button class="btn btn-ghost btn-sm" onclick="toggleUser('${u.id}')">${u.active ? 'Disable' : 'Enable'}</button>` : ''}
      </td>
    </tr>
  `).join('');
}

window.editUser = (id) => openUserModal(state.users.find(u => u.id === id));
window.toggleUser = (id) => {
  const u = state.users.find(x => x.id === id);
  if (!u || u.username === 'admin') return;
  u.active = !u.active;
  save(STORAGE.users, state.users);
  renderUsers();
  toast(u.active ? 'User enabled' : 'User disabled');
};

function openUserModal(user = null) {
  const isEdit = !!user;
  const siteOptions = state.sites.map(s => 
    `<label style="display:block;margin:4px 0"><input type="checkbox" value="${s.id}" class="m-site-cb" ${user?.sites?.includes(s.id) || user?.sites?.includes('*') ? 'checked' : ''}> ${escapeHtml(s.code)} – ${escapeHtml(s.name)}</label>`
  ).join('');

  $('#modal-title').textContent = isEdit ? 'Edit Employee' : 'Add Employee';
  $('#modal-body').innerHTML = `
    <div class="form-group"><label>Username *</label><input id="m-uname" value="${escapeHtml(user?.username||'')}" ${isEdit?'readonly':''}></div>
    <div class="form-group"><label>Full Name</label><input id="m-name" value="${escapeHtml(user?.name||'')}"></div>
    <div class="form-group"><label>Password ${isEdit ? '(leave blank to keep)' : '*'}</label><input id="m-pass" type="password"></div>
    <div class="form-group"><label>Role</label>
      <select id="m-role">
        <option value="operator" ${user?.role==='operator'?'selected':''}>Operator (scan & log)</option>
        <option value="viewer" ${user?.role==='viewer'?'selected':''}>Viewer (read only)</option>
        <option value="admin" ${user?.role==='admin'?'selected':''}>Admin (full access)</option>
      </select>
    </div>
    <div class="form-group"><label>Site Access</label>
      <label style="display:block;margin:4px 0"><input type="checkbox" id="m-all-sites" ${user?.sites?.includes('*')?'checked':''}> All Sites</label>
      <div id="m-sites-list">${siteOptions}</div>
    </div>
  `;
  $('#modal-footer').innerHTML = `
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" id="m-save-user">Save</button>
  `;
  $('#modal').classList.remove('hidden');

  $('#m-all-sites').onchange = (e) => {
    $$('.m-site-cb').forEach(cb => cb.disabled = e.target.checked);
  };

  $('#m-save-user').onclick = () => {
    const username = $('#m-uname').value.trim().toLowerCase();
    const name = $('#m-name').value.trim();
    const pass = $('#m-pass').value;
    const role = $('#m-role').value;
    const allSites = $('#m-all-sites').checked;
    const sites = allSites ? ['*'] : [...$$('.m-site-cb')].filter(c => c.checked).map(c => c.value);

    if (!username) { toast('Username required', true); return; }
    if (!isEdit && !pass) { toast('Password required', true); return; }

    if (isEdit) {
      user.name = name;
      user.role = role;
      user.sites = sites;
      if (pass) user.password = pass;
    } else {
      if (state.users.some(u => u.username === username)) {
        toast('Username already exists', true);
        return;
      }
      state.users.push({ id: uid(), username, password: pass, name, role, sites, active: true });
    }
    save(STORAGE.users, state.users);
    closeModal();
    renderUsers();
    toast('Employee saved');
  };
}

// ==================== DASHBOARD ====================
function setupDashboard() {}

function updateDashboard() {
  const today = new Date().toISOString().slice(0, 10);
  const allowedLogs = state.logs.filter(l => {
    if (!state.user.sites.includes('*') && !state.user.sites.includes(l.siteId)) return false;
    return true;
  });
  const todayLogs = allowedLogs.filter(l => l.date === today);

  $('#stat-today').textContent = todayLogs.length;
  $('#stat-in').textContent = todayLogs.filter(l => l.direction === 'IN').length;
  $('#stat-out').textContent = todayLogs.filter(l => l.direction === 'OUT').length;
  $('#stat-unique').textContent = new Set(todayLogs.map(l => l.plate)).size;

  // By site
  const bySite = {};
  todayLogs.forEach(l => {
    bySite[l.siteCode] = (bySite[l.siteCode] || 0) + 1;
  });
  const siteEl = $('#site-activity');
  if (!Object.keys(bySite).length) {
    siteEl.innerHTML = '<p class="empty-state">No activity today</p>';
  } else {
    siteEl.innerHTML = Object.entries(bySite).map(([code, count]) => `
      <div class="feed-item"><span>${escapeHtml(code)}</span><span>${count} entries</span></div>
    `).join('');
  }

  // Recent
  const recent = allowedLogs.slice(0, 10);
  const dashRecent = $('#dash-recent');
  if (!recent.length) {
    dashRecent.innerHTML = '<p class="empty-state">No logs yet</p>';
  } else {
    dashRecent.innerHTML = recent.map(l => `
      <div class="feed-item">
        <span><span class="plate">${escapeHtml(l.plate)}</span> ${l.direction} @ ${escapeHtml(l.siteCode)}</span>
        <span class="feed-meta">${l.date} ${l.time}</span>
      </div>
    `).join('');
  }
}

// ==================== MODAL ====================
function closeModal() {
  $('#modal').classList.add('hidden');
}
window.closeModal = closeModal;
$('#modal-close')?.addEventListener('click', closeModal);
$('#modal-backdrop')?.addEventListener('click', closeModal);

// ==================== RENDER ALL ====================
function renderAll() {
  renderRecentDetections();
  renderLogTable();
  renderTrucks();
  renderSites();
  renderUsers();
  updateDashboard();
}
