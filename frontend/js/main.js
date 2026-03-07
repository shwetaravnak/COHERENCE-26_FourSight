/* ============================================================
   ClinMatch AI — Shared JavaScript Utilities + Page Logic
   ============================================================ */

'use strict';

// Use same origin when served from /app/, else fallback to localhost
const API = (typeof window !== 'undefined' && window.location.port === '8000')
  ? window.location.origin
  : 'http://localhost:8000';

/* ══════════════════════════════════════════════════════════════
   SESSION  (localStorage-backed so it survives page navigation)
   ══════════════════════════════════════════════════════════════ */
const _sessionKeys = ['user_id','role','full_name','patient_hash','ocr_data'];

window._session = new Proxy({}, {
  get(_, key) {
    if (key === 'ocr_data') {
      try { return JSON.parse(localStorage.getItem('cm_ocr_data')); } catch { return null; }
    }
    return localStorage.getItem('cm_' + key) || null;
  },
  set(_, key, value) {
    if (value === null || value === undefined) {
      localStorage.removeItem('cm_' + key);
    } else if (key === 'ocr_data') {
      localStorage.setItem('cm_ocr_data', JSON.stringify(value));
    } else {
      localStorage.setItem('cm_' + key, value);
    }
    return true;
  }
});

/* ══════════════════════════════════════════════════════════════
   API HELPERS
   ══════════════════════════════════════════════════════════════ */
async function apiFetch(path, options = {}) {
  try {
    const res = await fetch(`${API}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
    let data;
    try {
      data = await res.json();
    } catch (_) {
      throw new Error(res.status === 500 ? 'Server error. Check backend is running.' : `Request failed (${res.status})`);
    }
    if (!res.ok) {
      const msg = Array.isArray(data.detail) ? data.detail.map(d => d.msg || d).join(', ') : (data.detail || 'Request failed');
      throw new Error(msg);
    }
    return data;
  } catch (e) {
    console.error(`API error [${path}]:`, e.message);
    throw e;
  }
}

/* ── AUTH ────────────────────────────────────────────────────── */
async function apiRegister(email, password, full_name, role, institution) {
  return apiFetch('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, full_name, role: role.toLowerCase(), institution })
  });
}

async function apiLogin(email, password, role) {
  const data = await apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password, role: role.toLowerCase() })
  });
  window._session.user_id   = data.user_id;
  window._session.role      = data.role;
  window._session.full_name = data.full_name;
  return data;
}

/* ── TRIALS ──────────────────────────────────────────────────── */
async function apiGetTrials(filters = {}) {
  const p = new URLSearchParams();
  if (filters.location)     p.append('location',     filters.location);
  if (filters.phase)        p.append('phase',        filters.phase);
  if (filters.disease_area) p.append('disease_area', filters.disease_area);
  return apiFetch(`/trials?${p}`);
}

async function apiAddTrial(trialData) {
  return apiFetch('/trials/add', { method: 'POST', body: JSON.stringify(trialData) });
}

/* ── PATIENT ─────────────────────────────────────────────────── */
async function apiSubmitPatientForm(formData) {
  const data = await apiFetch('/patient/submit-form', {
    method: 'POST',
    body: JSON.stringify(formData)
  });
  window._session.patient_hash = data.patient_hash;
  return data;
}

async function apiUploadFile(file) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API}/patient/upload-file`, { method: 'POST', body: form });
  let data;
  try {
    data = await res.json();
  } catch (_) {
    throw new Error(res.status === 500 ? 'Upload failed. Is the backend running?' : `Upload failed (${res.status})`);
  }
  if (!res.ok) throw new Error(data.detail || 'Upload failed');
  return data;
}

async function apiGetMatches(patient_hash) {
  return apiFetch(`/patient/${patient_hash}/matches`);
}

async function apiGetExplanation(patient_hash, trial_id) {
  return apiFetch(`/explain/${patient_hash}/${trial_id}`);
}

/* ── INQUIRIES ───────────────────────────────────────────────── */
async function apiSendInquiry(patient_hash, trial_id, patient_note = '') {
  return apiFetch('/inquiry/send', {
    method: 'POST',
    body: JSON.stringify({ patient_hash, trial_id, patient_note })
  });
}

async function apiGetPatientInquiries(patient_hash) {
  return apiFetch(`/inquiry/patient/${patient_hash}`);
}

async function apiGetResearcherInquiries(trial_id) {
  return apiFetch(`/inquiry/researcher/${trial_id}`);
}

async function apiAcceptInquiry(inquiry_id, researcher_note = '') {
  return apiFetch(`/inquiry/accept/${inquiry_id}`, {
    method: 'POST', body: JSON.stringify({ researcher_note })
  });
}

async function apiDeclineInquiry(inquiry_id, researcher_note = '') {
  return apiFetch(`/inquiry/decline/${inquiry_id}`, {
    method: 'POST', body: JSON.stringify({ researcher_note })
  });
}

/* ── RESEARCHER ──────────────────────────────────────────────── */
async function apiGetMatchedPatients(trial_id) {
  return apiFetch(`/researcher/trial/${trial_id}/patients`);
}

/* ── ADMIN ───────────────────────────────────────────────────── */
async function apiGetStats()    { return apiFetch('/admin/stats'); }
async function apiGetAllUsers() { return apiFetch('/admin/users'); }

/* ── LOGOUT ──────────────────────────────────────────────────── */
function logout() {
  ['cm_user_id','cm_role','cm_full_name','cm_patient_hash','cm_ocr_data'].forEach(k => localStorage.removeItem(k));
  window.location.href = 'login.html';
}


/* ══════════════════════════════════════════════════════════════
   UI UTILITIES  (shared across all pages)
   ══════════════════════════════════════════════════════════════ */

/* ── Modal ───────────────────────────────────────────────────── */
function openModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('open');
  document.body.style.overflow = '';
}

/* ── Password helpers ────────────────────────────────────────── */
function togglePwd(fieldId = 'pwdField') {
  const f = document.getElementById(fieldId);
  if (f) f.type = f.type === 'password' ? 'text' : 'password';
}

function checkStrength(input) {
  const fill = document.getElementById('strengthFill');
  if (!fill) return;
  const v = input.value;
  let s = 0;
  if (v.length >= 8)          s++;
  if (/[A-Z]/.test(v))        s++;
  if (/[0-9]/.test(v))        s++;
  if (/[^A-Za-z0-9]/.test(v)) s++;
  const colors = ['', '#f87171','#fbbf24','#34d399','#00e5cc'];
  const widths  = ['0%','25%','50%','75%','100%'];
  fill.style.width      = widths[s];
  fill.style.background = colors[s];
}

/* ── Role selector / tabs ────────────────────────────────────── */
let _currentRole = 'Patient';

function selectRole(el, role) {
  document.querySelectorAll('.role-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  _currentRole = role;
  const btn = document.getElementById('loginBtn');
  if (btn) btn.textContent = 'Login as ' + role;
}

function switchRegTab(el, type) {
  document.querySelectorAll('.role-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  _currentRole = type;
  const inst = document.getElementById('instField');
  if (inst) inst.classList.toggle('show', type === 'researcher');
}

/* ── Radio pills ─────────────────────────────────────────────── */
function selectPill(el) {
  el.closest('.radio-pills').querySelectorAll('.radio-pill')
    .forEach(p => p.classList.remove('selected'));
  el.classList.add('selected');
}

/* ── Chip input ──────────────────────────────────────────────── */
function addChip(btn, label = 'Item') {
  const name = prompt(`Enter ${label}:`);
  if (!name || !name.trim()) return;
  const chip = document.createElement('div');
  chip.className = 'chip';
  chip.innerHTML = `${name.trim()} <span class="chip-remove" onclick="this.parentElement.remove()">×</span>`;
  btn.parentElement.insertBefore(chip, btn);
}

function getChips(containerId) {
  return [...document.querySelectorAll(`#${containerId} .chip`)]
    .map(c => c.textContent.replace('×','').trim())
    .filter(Boolean);
}

/* ── Upload ──────────────────────────────────────────────────── */
function simulateUpload(redirectFn) {
  const zone   = document.getElementById('uploadZone');
  const loader = document.getElementById('uploadLoader');
  const bar    = document.getElementById('uploadProgress');
  if (!zone || !loader || !bar) return;
  zone.style.display   = 'none';
  loader.style.display = 'block';
  let pct = 0;
  const iv = setInterval(() => {
    pct += Math.random() * 18;
    if (pct >= 100) {
      pct = 100;
      clearInterval(iv);
      if (typeof redirectFn === 'function') setTimeout(redirectFn, 400);
    }
    bar.style.width = pct + '%';
  }, 200);
}

function handleDrop(e, redirectFn) {
  e.preventDefault();
  const zone = document.getElementById('uploadZone');
  if (zone) zone.classList.remove('dragover');
  simulateUpload(redirectFn);
}

/* ── Parsed rules preview ────────────────────────────────────── */
function toggleParsedOutput() {
  const el = document.getElementById('parsedOutput');
  if (!el) return;
  el.style.display = el.style.display === 'block' ? 'none' : 'block';
}

/* ── Toast notification ──────────────────────────────────────── */
function showToast(msg, type = 'success') {
  let toast = document.getElementById('_toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = '_toast';
    toast.style.cssText = `
      position:fixed; bottom:24px; right:24px; z-index:9999;
      padding:12px 20px; border-radius:8px; font-size:14px;
      font-family:'IBM Plex Sans',sans-serif; font-weight:500;
      transition:opacity .3s; max-width:320px;
    `;
    document.body.appendChild(toast);
  }
  const colors = { success:'#34d399', error:'#f87171', info:'#00e5cc' };
  toast.style.background = colors[type] || colors.info;
  toast.style.color      = '#0f172a';
  toast.style.opacity    = '1';
  toast.textContent      = msg;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 3000);
}

/* ── Score color ─────────────────────────────────────────────── */
function scoreColor(pct) {
  if (pct >= 80) return 'var(--success)';
  if (pct >= 60) return 'var(--warning)';
  return 'var(--error)';
}

function scoreLabel(pct) {
  if (pct >= 80) return '🟢';
  if (pct >= 60) return '🟡';
  return '🔴';
}


/* ══════════════════════════════════════════════════════════════
   PAGE: LOGIN
   ══════════════════════════════════════════════════════════════ */
async function loginRedirect() {
  const emailEl = document.querySelector('input[type="email"]');
  const passEl  = document.querySelector('input[type="password"]');
  const btn     = document.getElementById('loginBtn');

  if (!emailEl || !passEl) {
    if      (_currentRole === 'Researcher') window.location.href = 'researcher-dashboard.html';
    else if (_currentRole === 'Admin')      window.location.href = 'admin-dashboard.html';
    else                                    window.location.href = 'patient-method.html';
    return;
  }

  const email    = emailEl.value.trim();
  const password = passEl.value;

  if (!email || !password) { showToast('Please enter email and password', 'error'); return; }

  btn.textContent = 'Logging in...';
  btn.disabled    = true;

  // clear any previous session before new login
  ['cm_user_id','cm_role','cm_full_name','cm_patient_hash'].forEach(k => localStorage.removeItem(k));

  try {
    const data = await apiLogin(email, password, _currentRole);
    showToast(`Welcome back, ${data.full_name}!`);
    setTimeout(() => {
      if      (data.role === 'researcher') window.location.href = 'researcher-dashboard.html';
      else if (data.role === 'admin')      window.location.href = 'admin-dashboard.html';
      else                                 window.location.href = 'patient-method.html';
    }, 800);
  } catch (e) {
    showToast(e.message, 'error');
    btn.textContent = 'Login as ' + _currentRole;
    btn.disabled    = false;
  }
}


/* ══════════════════════════════════════════════════════════════
   PAGE: REGISTER
   ══════════════════════════════════════════════════════════════ */
async function handleRegister() {
  const nameEl   = document.querySelector('input[placeholder="Your full name"]');
  const emailEl  = document.querySelector('input[type="email"]');
  const passEls  = document.querySelectorAll('input[type="password"]');
  const instEl   = document.querySelector('input[placeholder*="Institution"]');

  const full_name   = nameEl?.value.trim();
  const email       = emailEl?.value.trim();
  const password    = passEls[0]?.value;
  const confirm     = passEls[1]?.value;
  const institution = instEl?.value.trim() || null;

  if (!full_name || !email || !password) { showToast('Please fill all fields', 'error'); return; }
  if (password !== confirm)              { showToast('Passwords do not match', 'error'); return; }

  try {
    await apiRegister(email, password, full_name, _currentRole, institution);
    showToast('Account created! Redirecting to login...');
    setTimeout(() => window.location.href = 'login.html', 1200);
  } catch(e) {
    showToast(e.message, 'error');
  }
}


/* ══════════════════════════════════════════════════════════════
   AUTO-CALCULATE BMI FROM HEIGHT & WEIGHT
   ══════════════════════════════════════════════════════════════ */
function autoCalcBMI() {
  const h = parseFloat(document.getElementById('heightInput')?.value);
  const w = parseFloat(document.getElementById('weightInput')?.value);
  const bmiEl = document.getElementById('bmiInput');
  if (bmiEl && h > 0 && w > 0) {
    const heightM = h / 100;
    const bmi = (w / (heightM * heightM)).toFixed(1);
    bmiEl.value = bmi;
  } else if (bmiEl) {
    bmiEl.value = '';
  }
}


/* ══════════════════════════════════════════════════════════════
   PAGE: PATIENT FORM
   ══════════════════════════════════════════════════════════════ */
async function submitPatientForm() {
  // ── CHECK LOGIN FIRST ─────────────────────────────
  const userId = window._session.user_id;
  if (!userId) {
    showToast('Please log in before submitting your health details', 'error');
    setTimeout(() => window.location.href = 'login.html', 1500);
    return;
  }

  const ageEl      = document.getElementById('ageInput');
  const cityEl     = document.getElementById('citySelect');
  const diagEl     = document.getElementById('diagSelect');
  const genderEl   = document.querySelector('.radio-pill.selected');
  const heightEl   = document.getElementById('heightInput');
  const weightEl   = document.getElementById('weightInput');
  const hba1cEl    = document.getElementById('hba1cInput');
  const bmiEl      = document.getElementById('bmiInput');
  const creatEl    = document.getElementById('creatinineInput');
  const bpSysEl    = document.getElementById('bpSysInput');
  const bpDiaEl    = document.getElementById('bpDiaInput');
  const hemoEl     = document.getElementById('hemoglobinInput');

  const history = [...document.querySelectorAll('.checkbox-item input:checked')]
    .map(cb => cb.closest('label').textContent.trim());

  const meds = getChips('medChips');

  // ── MANDATORY FIELD VALIDATION ───────────────────
  const errors = [];
  const markErr = (el) => { if (el) el.style.borderColor = 'var(--error)'; };
  const clearErr = (el) => { if (el) el.style.borderColor = ''; };

  // Personal details
  if (!ageEl?.value || isNaN(parseInt(ageEl.value)) || parseInt(ageEl.value) < 1) {
    errors.push('Age is required'); markErr(ageEl);
  } else clearErr(ageEl);

  if (!genderEl) errors.push('Please select a gender');

  if (!heightEl?.value || parseFloat(heightEl.value) < 50) {
    errors.push('Height is required'); markErr(heightEl);
  } else clearErr(heightEl);

  if (!weightEl?.value || parseFloat(weightEl.value) < 10) {
    errors.push('Weight is required'); markErr(weightEl);
  } else clearErr(weightEl);

  if (!cityEl?.value) {
    errors.push('Please select a city'); markErr(cityEl);
  } else clearErr(cityEl);

  // Medical info
  if (!diagEl?.value) {
    errors.push('Please select a diagnosis'); markErr(diagEl);
  } else clearErr(diagEl);

  if (meds.length === 0) {
    errors.push('Please add at least one medication');
  }

  // Lab values
  if (!hba1cEl?.value) {
    errors.push('HbA1c is required'); markErr(hba1cEl);
  } else clearErr(hba1cEl);

  if (!creatEl?.value) {
    errors.push('Creatinine is required'); markErr(creatEl);
  } else clearErr(creatEl);

  if (!bpSysEl?.value || !bpDiaEl?.value) {
    errors.push('Blood Pressure is required'); markErr(bpSysEl); markErr(bpDiaEl);
  } else { clearErr(bpSysEl); clearErr(bpDiaEl); }

  if (!hemoEl?.value) {
    errors.push('Hemoglobin is required'); markErr(hemoEl);
  } else clearErr(hemoEl);

  if (errors.length > 0) {
    showToast(errors[0], 'error');
    return;
  }

  // gender: M / F / Other → normalise to M or F
  const genderRaw = genderEl.textContent.trim();
  const gender    = genderRaw === 'F' ? 'F' : 'M';

  const formData = {
    user_id:         userId,
    age:             parseInt(ageEl.value),
    gender:          gender,
    diagnoses:       [diagEl.value],
    medications:     meds,
    lab_values: {
      HbA1c:          parseFloat(hba1cEl.value),
      BMI:            parseFloat(bmiEl?.value) || null,
      creatinine:     parseFloat(creatEl.value),
      blood_pressure: bpSysEl.value + '/' + bpDiaEl.value,
      hemoglobin:     parseFloat(hemoEl.value),
      height_cm:      parseFloat(heightEl.value),
      weight_kg:      parseFloat(weightEl.value)
    },
    medical_history: history,
    location_city:   cityEl.value,
    location_state:  'India'
  };

  // remove null lab values
  Object.keys(formData.lab_values).forEach(k => {
    if (formData.lab_values[k] === null || formData.lab_values[k] === undefined) delete formData.lab_values[k];
  });

  const btn = document.querySelector('a[href="patient-results.html"]');
  if (btn) { btn.style.pointerEvents = 'none'; btn.textContent = 'Finding matches...'; }

  try {
    showToast('Finding your matches...', 'info');
    const result = await apiSubmitPatientForm(formData);
    showToast(`Found ${result.matches_found} matches!`);
    setTimeout(() => window.location.href = 'patient-results.html', 900);
  } catch(e) {
    showToast(e.message, 'error');
    if (btn) { btn.style.pointerEvents = ''; btn.textContent = 'Find My Trials →'; }
  }
}


/* ══════════════════════════════════════════════════════════════
   PAGE: PATIENT UPLOAD
   ══════════════════════════════════════════════════════════════ */
async function handleFileUpload(file) {
  const zone   = document.getElementById('uploadZone');
  const loader = document.getElementById('uploadLoader');
  const bar    = document.getElementById('uploadProgress');
  if (zone)   zone.style.display   = 'none';
  if (loader) loader.style.display = 'block';

  // animate progress bar
  let pct = 0;
  const iv = setInterval(() => {
    pct = Math.min(pct + 10, 85);
    if (bar) bar.style.width = pct + '%';
  }, 200);

  try {
    const result = await apiUploadFile(file);
    clearInterval(iv);
    if (bar) bar.style.width = '100%';

    const extracted = result.extracted;

    // ── CHECK IMAGE QUALITY ────────────────────────
    if (extracted.quality_warning) {
      // Show alert for poor quality images
      const alertMsg = extracted.quality_warning;
      if (extracted.fields_extracted <= 1) {
        // Very poor quality — alert and let them re-upload
        if (loader) loader.style.display = 'none';
        if (zone)   zone.style.display = 'block';
        alert('⚠️ Poor Image Quality\n\n' + alertMsg + '\n\nExtracted ' + extracted.fields_extracted + ' of ' + extracted.fields_total + ' fields.');
        showToast('Image quality too low. Please try again.', 'error');
        return;
      }
      // Medium quality — warn but continue
      showToast('⚠️ ' + alertMsg, 'info');
    }

    // store extracted data for OCR confirm page
    window._session.ocr_data = extracted;
    showToast('Report read successfully!');
    setTimeout(() => window.location.href = 'patient-ocr-confirm.html', 600);
  } catch(e) {
    clearInterval(iv);
    if (loader) loader.style.display = 'none';
    if (zone)   zone.style.display   = 'block';
    showToast(e.message, 'error');
  }
}

// Hook file input and drop zone on upload page
function initUploadPage() {
  const fileInput = document.getElementById('fileInput') || document.querySelector('input[type="file"]');
  if (fileInput) {
    fileInput.addEventListener('change', e => {
      const file = e.target.files[0];
      if (file) handleFileUpload(file);
    });
  }

  const zone = document.getElementById('uploadZone');
  if (zone) {
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('dragover');
      const file = e.dataTransfer?.files?.[0];
      if (file) handleFileUpload(file);
    });
  }
}


/* ══════════════════════════════════════════════════════════════
   PAGE: OCR CONFIRM — populate table from extracted data
   ══════════════════════════════════════════════════════════════ */
function populateOcrTable() {
  const ocr = window._session.ocr_data;
  if (!ocr) return;  // no data, keep static HTML

  // Show quality warning if present
  const warningEl = document.getElementById('ocrQualityWarning');
  if (warningEl && ocr.quality_warning) {
    warningEl.textContent = '⚠️ ' + ocr.quality_warning;
    warningEl.style.display = 'block';
  }

  // Update status banner based on quality
  const bannerEl = document.getElementById('ocrStatusBanner');
  if (bannerEl && ocr.fields_extracted !== undefined) {
    bannerEl.innerHTML = `✅ Extracted ${ocr.fields_extracted} of ${ocr.fields_total} fields &nbsp;·&nbsp; Please review and fill in any missing information`;
  }

  const rows = {
    'Age':            ocr.age,
    'Gender':         ocr.gender,
    'Diagnosis':      (ocr.diagnoses || []).join(', '),
    'HbA1c':          ocr.lab_values?.HbA1c,
    'BMI':            ocr.lab_values?.BMI,
    'Medications':    (ocr.medications || []).join(', '),
    'Creatinine':     ocr.lab_values?.creatinine,
    'Blood Pressure': ocr.lab_values?.blood_pressure,
    'Hemoglobin':     ocr.lab_values?.hemoglobin,
    'City':           ocr.location_city
  };

  const confMap = ocr.confidence || {};
  const tbody = document.querySelector('.ocr-table tbody');
  if (!tbody) return;

  const hasMissing = Object.values(rows).some(v => v === null || v === undefined || v === '' || v === 0);

  tbody.innerHTML = Object.entries(rows).map(([field, val]) => {
    const isEmpty = val === null || val === undefined || val === '' || val === 0;
    const conf     = isEmpty ? 'low' : (confMap[field.toLowerCase()] || confMap['lab_values'] || 'medium');
    const confColor = conf === 'high' ? 'var(--success)' : conf === 'low' ? 'var(--error)' : 'var(--warning)';
    const confText  = conf.charAt(0).toUpperCase() + conf.slice(1);
    const rowClass = isEmpty ? ' class="low-conf"' : '';
    // For missing fields, show an editable input so patient can fill them
    const displayVal = isEmpty
      ? `<input type="text" class="input-field ocr-fill-input" data-field="${field}" placeholder="Enter ${field}" style="padding:4px 8px;font-size:13px;height:32px;border-color:var(--error);">`
      : `<span class="ocr-value" data-field="${field}">${val}</span>`;
    return `<tr${rowClass}>
      <td>${field}${isEmpty ? ' <span style="color:var(--error);font-weight:700;">*</span>' : ''}</td>
      <td>${displayVal}</td>
      <td><span class="conf-dot" style="background:${confColor};"></span>${confText}</td>
      <td><button class="edit-btn" onclick="inlineEdit(this,'${field}')">✏️</button></td>
    </tr>`;
  }).join('');

  // Show help text if missing fields
  if (hasMissing) {
    const helpDiv = document.getElementById('ocrMissingHelp');
    if (helpDiv) {
      helpDiv.style.display = 'block';
      helpDiv.innerHTML = '⚠️ <strong>Some fields are missing.</strong> Please fill in the highlighted fields marked with <span style="color:var(--error);font-weight:700;">*</span> before proceeding.';
    }
  }
}

function inlineEdit(btn, fieldName) {
  const td = btn.closest('tr').querySelector('td:nth-child(2)');
  // Check if there's already an input (for missing fields)
  const existingInput = td.querySelector('input');
  if (existingInput) {
    existingInput.focus();
    return;
  }
  const spanEl = td.querySelector('.ocr-value');
  const currentVal = spanEl ? spanEl.textContent.trim() : td.textContent.trim();
  const newVal = prompt(`Edit ${fieldName}:`, currentVal === '— Not Found' ? '' : currentVal);
  if (newVal !== null && newVal.trim()) {
    if (spanEl) {
      spanEl.textContent = newVal.trim();
    } else {
      td.innerHTML = `<span class="ocr-value" data-field="${fieldName}">${newVal.trim()}</span>`;
    }
    // Update OCR data in session
    updateOcrField(fieldName, newVal.trim());
  }
}

function updateOcrField(fieldName, value) {
  const ocr = window._session.ocr_data;
  if (!ocr) return;
  switch(fieldName) {
    case 'Age': ocr.age = parseInt(value) || null; break;
    case 'Gender': ocr.gender = value; break;
    case 'Diagnosis': ocr.diagnoses = value.split(',').map(s => s.trim()).filter(Boolean); break;
    case 'HbA1c': if (!ocr.lab_values) ocr.lab_values = {}; ocr.lab_values.HbA1c = parseFloat(value) || null; break;
    case 'BMI': if (!ocr.lab_values) ocr.lab_values = {}; ocr.lab_values.BMI = parseFloat(value) || null; break;
    case 'Medications': ocr.medications = value.split(',').map(s => s.trim()).filter(Boolean); break;
    case 'Creatinine': if (!ocr.lab_values) ocr.lab_values = {}; ocr.lab_values.creatinine = parseFloat(value) || null; break;
    case 'Blood Pressure': if (!ocr.lab_values) ocr.lab_values = {}; ocr.lab_values.blood_pressure = value; break;
    case 'Hemoglobin': if (!ocr.lab_values) ocr.lab_values = {}; ocr.lab_values.hemoglobin = parseFloat(value) || null; break;
    case 'City': ocr.location_city = value; break;
  }
}

async function confirmOcrAndSubmit() {
  const ocr = window._session.ocr_data;
  if (!ocr) {
    showToast('No OCR data available. Please upload a report first.', 'error');
    return;
  }

  // ── READ FILLED-IN VALUES FROM TABLE INPUTS ──────
  document.querySelectorAll('.ocr-fill-input').forEach(input => {
    const field = input.dataset.field;
    const val = input.value.trim();
    if (val) updateOcrField(field, val);
  });

  // Also read any edited span values
  document.querySelectorAll('.ocr-value').forEach(span => {
    const field = span.dataset.field;
    const val = span.textContent.trim();
    if (val && val !== '— Not Found') updateOcrField(field, val);
  });

  // ── VALIDATE CRITICAL FIELDS ────────────────────
  const errors = [];
  if (!ocr.age) errors.push('Age');
  if (!ocr.gender) errors.push('Gender');
  if (!ocr.diagnoses || ocr.diagnoses.length === 0) errors.push('Diagnosis');
  if (!ocr.location_city) errors.push('City');

  if (errors.length > 0) {
    showToast('Please fill in: ' + errors.join(', '), 'error');
    // Highlight unfilled inputs
    document.querySelectorAll('.ocr-fill-input').forEach(input => {
      if (!input.value.trim()) input.style.borderColor = 'var(--error)';
    });
    return;
  }

  const userId = window._session.user_id;
  if (!userId) {
    showToast('Please log in first', 'error');
    setTimeout(() => window.location.href = 'login.html', 1500);
    return;
  }

  const formData = {
    user_id:         userId,
    age:             ocr.age,
    gender:          ocr.gender,
    diagnoses:       ocr.diagnoses || [],
    medications:     ocr.medications || [],
    lab_values:      ocr.lab_values || {},
    medical_history: ocr.medical_history || [],
    location_city:   ocr.location_city,
    location_state:  'India'
  };

  try {
    showToast('Running AI matching...', 'info');
    const result = await apiSubmitPatientForm(formData);
    showToast(`Found ${result.matches_found} matches!`);
    setTimeout(() => window.location.href = 'patient-results.html', 900);
  } catch(e) {
    showToast(e.message, 'error');
  }
}


/* ══════════════════════════════════════════════════════════════
   PAGE: PATIENT RESULTS — load real matches from backend
   ══════════════════════════════════════════════════════════════ */
async function loadPatientResults() {
  const patient_hash = window._session.patient_hash;
  const countText = document.getElementById('matchCountText');
  const container = document.getElementById('matchCards');

  if (!patient_hash) {
    if (countText) countText.textContent = 'No matches yet';
    if (container) container.innerHTML = `
      <div style="text-align:center; padding:48px 20px;">
        <div style="font-size:48px; margin-bottom:16px;">🔍</div>
        <h3 style="font-size:18px; margin-bottom:8px;">No Match Results Yet</h3>
        <p class="text-muted" style="font-size:14px; margin-bottom:20px;">Submit your health details first to find matching clinical trials.</p>
        <a href="patient-method.html" class="btn btn-primary">Get Started →</a>
      </div>`;
    return;
  }

  try {
    const matches = await apiGetMatches(patient_hash);
    // Update header with actual match count
    if (countText) countText.textContent = `Found ${matches.length} trial${matches.length !== 1 ? 's' : ''} matching your profile`;
    if (matches.length) {
      renderMatchCards(matches);
    } else {
      if (container) container.innerHTML = '<p class="text-muted" style="padding:24px;text-align:center;">No matching trials found for your profile.</p>';
    }
    loadPatientInquiries(patient_hash);
  } catch(e) {
    console.warn('Could not load matches:', e.message);
    if (countText) countText.textContent = 'Could not load matches';
    if (container) container.innerHTML = '<p class="text-muted" style="padding:24px;text-align:center;">Error loading matches. Please try again.</p>';
  }
}

function renderMatchCards(matches) {
  const container = document.getElementById('matchCards');
  if (!container || !matches.length) return;

  container.innerHTML = matches.map(m => {
    const pct   = m.percentage;
    const color = scoreColor(pct);
    const emoji = scoreLabel(pct);
    const breakdown = (m.criteria_breakdown || []).slice(0,5).map(c =>
      `<span class="crit-badge ${c.status === 'PASS' ? 'crit-ok' : 'crit-fail'}">
        ${c.status === 'PASS' ? '✅' : '❌'} ${c.criterion.split(' ')[0]}
      </span>`
    ).join('');

    return `
    <div class="trial-card">
      <div class="left-border" style="background:${color};"></div>
      <div class="trial-card-body">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
          <span class="pill" style="background:rgba(0,0,0,0.2);color:${color};border:1px solid ${color};">${emoji} ${pct}% Match</span>
          <span class="pill pill-gray">Phase ${m.phase}</span>
        </div>
        <div class="trial-name">${m.title}</div>
        <div class="trial-meta">
          <span>🏢 ${m.sponsor}</span>
          <span>📍 ${(m.locations || []).join(', ')}</span>
        </div>
        <div class="score-bar-wrap">
          <div class="score-bar-fill" style="width:${pct}%;background:${color};"></div>
        </div>
        <div style="text-align:right;font-size:12px;color:${color};margin-top:3px;">${pct}%</div>
        <div class="criteria-row">${breakdown}</div>
        <div class="trial-actions">
          <button class="btn btn-ghost btn-sm"
            onclick="openExplanationModal('${patient_hash}','${m.trial_id}','${m.title}')">
            📋 View Explanation
          </button>
          ${m.is_eligible
            ? `<button class="btn btn-primary btn-sm"
                onclick="sendInterest('${patient_hash}','${m.trial_id}')">
                ★ I'm Interested
              </button>`
            : `<span class="pill pill-red">Not Eligible</span>`
          }
        </div>
      </div>
    </div>`;
  }).join('');
}

async function openExplanationModal(patient_hash, trial_id, title) {
  openModal('explanationModal');
  const modal = document.getElementById('explanationModal');

  // set title
  const titleEl = modal?.querySelector('.text-teal');
  if (titleEl) titleEl.textContent = title + ' — ' + trial_id;

  try {
    const exp = await apiGetExplanation(patient_hash, trial_id);
    // update criteria table
    const tbody = modal?.querySelector('tbody');
    if (tbody && exp.criterion_cards) {
      tbody.innerHTML = exp.criterion_cards.map(c => `
        <tr>
          <td>${c.criterion}</td>
          <td>${c.required}</td>
          <td ${c.status !== 'PASS' ? 'style="color:var(--error);"' : ''}>${c.patient_value}</td>
          <td>${c.icon}</td>
        </tr>`).join('');
    }
    // update AI summary box
    const aiBox = modal?.querySelector('.ai-box span:last-child');
    if (aiBox) aiBox.innerHTML = exp.summary;

    // update scores
    if (exp.score_breakdown) {
      const fills = modal?.querySelectorAll('.score-row-fill');
      const pcts  = modal?.querySelectorAll('.score-row-pct');
      const sb    = exp.score_breakdown;
      if (fills && pcts) {
        const vals = [sb.rule_score?.value, sb.ml_score?.value, sb.final_score?.value];
        vals.forEach((v, i) => {
          if (fills[i]) fills[i].style.width = (v||0) + '%';
          if (pcts[i])  pcts[i].textContent  = (v||0) + '%';
        });
      }
    }
  } catch(e) {
    console.warn('Explanation not available:', e.message);
  }
}

async function sendInterest(patient_hash, trial_id) {
  const note = prompt('Add a note for the researcher (optional):') || '';
  try {
    const result = await apiSendInquiry(patient_hash, trial_id, note);
    // Find trial name from the rendered cards
    let trialName = trial_id;
    const cards = document.querySelectorAll('.trial-card');
    cards.forEach(card => {
      const nameEl = card.querySelector('.trial-name');
      if (nameEl && card.innerHTML.includes(trial_id)) trialName = nameEl.textContent;
    });
    showSuccessModal(trialName, trial_id);
    loadPatientInquiries(patient_hash);
  } catch(e) {
    showToast(e.message, 'error');
  }
}

/* ── Success Modal (I'm Interested) ──────────────────────── */
function showSuccessModal(trialName, trialId) {
  // Remove existing modal if any
  let existing = document.getElementById('interestSuccessModal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'interestSuccessModal';
  overlay.className = 'success-modal-overlay open';
  overlay.innerHTML = `
    <div class="success-modal">
      <div class="success-check-wrap">
        <span class="success-check-icon">✅</span>
      </div>
      <h2>Interest Submitted!</h2>
      <p>Your interest has been sent to the research team. They will review your profile and respond soon.</p>
      <div class="success-trial-name">📋 ${trialName}</div>
      <div class="success-status">⏳ Status: Pending Review</div>
      <div class="success-actions">
        <button class="btn btn-ghost btn-sm" onclick="closeSuccessModal()">Close</button>
        <button class="btn btn-primary btn-sm" onclick="closeSuccessModal(); document.getElementById('inquiriesContainer')?.scrollIntoView({behavior:'smooth'});">View My Inquiries</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Spawn confetti
  spawnConfetti(overlay.querySelector('.success-modal'));

  // Close on backdrop click
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeSuccessModal();
  });

  // Auto-close after 6s
  overlay._autoClose = setTimeout(() => closeSuccessModal(), 6000);
}

function closeSuccessModal() {
  const modal = document.getElementById('interestSuccessModal');
  if (!modal) return;
  clearTimeout(modal._autoClose);
  modal.classList.remove('open');
  setTimeout(() => modal.remove(), 300);
}

function spawnConfetti(container) {
  if (!container) return;
  const colors = ['#34d399','#00e5cc','#fbbf24','#60a5fa','#a78bfa','#f87171','#fb923c'];
  for (let i = 0; i < 20; i++) {
    const p = document.createElement('div');
    p.className = 'confetti-particle';
    p.style.background = colors[Math.floor(Math.random() * colors.length)];
    p.style.left = (20 + Math.random() * 60) + '%';
    p.style.top = (10 + Math.random() * 20) + '%';
    p.style.animationDelay = (Math.random() * 0.5) + 's';
    p.style.animationDuration = (0.8 + Math.random() * 0.8) + 's';
    p.style.width = (4 + Math.random() * 6) + 'px';
    p.style.height = (4 + Math.random() * 6) + 'px';
    container.appendChild(p);
    // Remove after animation
    setTimeout(() => p.remove(), 2000);
  }
}

async function loadPatientInquiries(patient_hash) {
  const container = document.getElementById('inquiriesContainer');
  const countEl = document.getElementById('inquiryCount');
  if (!container) return;
  try {
    const inquiries = await apiGetPatientInquiries(patient_hash);
    if (countEl) countEl.textContent = inquiries.length;
    if (!inquiries.length) {
      container.innerHTML = '<p class="text-muted" style="grid-column:1/-1; padding:12px;">No inquiries yet.</p>';
      return;
    }

    container.innerHTML = inquiries.map(inq => {
      const statusClass = inq.status === 'accepted' ? 'pill-green' :
                          inq.status === 'declined'  ? 'pill-red'   : 'pill-yellow';
      const statusIcon  = inq.status === 'accepted' ? '✅ Accepted' :
                          inq.status === 'declined'  ? '❌ Declined' : '⏳ Pending';
      return `
        <div class="card">
          <h4 style="font-size:14px;margin-bottom:8px;">${inq.trial_title}</h4>
          <span class="pill ${statusClass}">${statusIcon}</span>
          ${inq.researcher_note
            ? `<div style="background:var(--bg);border-left:2px solid var(--success);padding:8px 12px;border-radius:0 4px 4px 0;font-size:12px;color:var(--muted);margin-top:8px;font-style:italic;">
                "${inq.researcher_note}"
              </div>`
            : ''}
        </div>`;
    }).join('');
  } catch(e) {
    console.warn('Could not load inquiries:', e.message);
  }
}


/* ══════════════════════════════════════════════════════════════
   PAGE: RESEARCHER TRIAL — load matched patients
   ══════════════════════════════════════════════════════════════ */

// Populate trial selector from API instead of hardcoded options
async function populateTrialSelector() {
  const selector = document.getElementById('trialSelector');
  if (!selector) return;

  try {
    const trials = await apiGetTrials();
    selector.innerHTML = trials.map(t =>
      `<option value="${t.trial_id}">${t.trial_id} — ${t.title}</option>`
    ).join('');
    // Load first trial's patients
    if (trials.length > 0) {
      loadResearcherPatients(trials[0].trial_id);
    } else {
      selector.innerHTML = '<option value="">No trials available</option>';
    }
  } catch(e) {
    console.warn('Could not load trials for selector:', e.message);
  }
}

async function loadResearcherPatients(trial_id) {
  const container = document.getElementById('patientsContainer');
  if (!container) return;

  trial_id = trial_id || document.getElementById('trialSelector')?.value || 'T001';

  // Also update the trial info card with real data
  try {
    const trialData = await apiFetch(`/trials/${trial_id}`);
    const titleEl = document.getElementById('trialInfoTitle');
    const pillsEl = document.getElementById('trialInfoPills');
    const locsEl  = document.getElementById('trialInfoLocations');
    if (titleEl) titleEl.textContent = trialData.title || trial_id;
    if (pillsEl) pillsEl.innerHTML = `
      <span class="pill pill-teal">Phase ${trialData.phase}</span>
      <span class="pill pill-green">Active</span>
      <span class="pill pill-gray">${trialData.disease_area || ''}</span>
      <span class="pill pill-gray">${trialData.sponsor || ''}</span>
    `;
    if (locsEl) locsEl.textContent = '📍 ' + (trialData.locations || []).join(' · ');
  } catch(_) { /* trial details not critical */ }

  try {
    const patients = await apiGetMatchedPatients(trial_id);

    // Update trial info stats from real data
    const matchesEl  = document.getElementById('trialInfoMatches');
    const acceptedEl = document.getElementById('trialInfoAccepted');
    const pendingEl  = document.getElementById('trialInfoPending');
    const declinedEl = document.getElementById('trialInfoDeclined');
    if (matchesEl) matchesEl.textContent = patients.length;
    const accepted = patients.filter(p => p.inquiry_status === 'accepted').length;
    const pending  = patients.filter(p => p.inquiry_status === 'pending').length;
    const declined = patients.filter(p => p.inquiry_status === 'declined').length;
    if (acceptedEl) acceptedEl.textContent = accepted;
    if (pendingEl)  pendingEl.textContent  = pending;
    if (declinedEl) declinedEl.textContent = declined;

    if (!patients.length) {
      container.innerHTML = '<p class="text-muted" style="padding:24px;">No matched patients yet. Patients will appear here once they submit their health details and get matched to this trial.</p>';
      return;
    }
    renderPatientCards(patients, container, trial_id);
  } catch(e) {
    container.innerHTML = `<p class="text-muted" style="padding:24px;">Could not load patients: ${e.message}</p>`;
  }
}

function renderPatientCards(patients, container, trial_id = 'T001') {
  container.innerHTML = patients.map(p => {
    const pct   = p.percentage;
    const color = scoreColor(pct);
    const diagStr = (p.diagnoses || []).join(', ');
    const labStr  = Object.entries(p.lab_values || {})
      .map(([k,v]) => `${k}: ${v}`).join(' | ');

    const inqBadge = p.has_inquiry
      ? `<span class="pill ${p.inquiry_status === 'accepted' ? 'pill-green' : p.inquiry_status === 'declined' ? 'pill-red' : 'pill-yellow'}">${p.inquiry_status === 'accepted' ? '✅ Accepted' : p.inquiry_status === 'declined' ? '❌ Declined' : '🔴 NEW INQUIRY'}</span>`
      : '';

    const breakdown = (p.criteria_breakdown || []).slice(0,5).map(c =>
      `<span class="crit-badge ${c.status === 'PASS' ? 'crit-ok' : 'crit-fail'}">
        ${c.status === 'PASS' ? '✅' : '❌'} ${c.criterion.split(' ')[0]}
      </span>`
    ).join('');

    return `
    <div class="patient-card">
      <div class="left-border" style="background:${p.has_inquiry ? 'var(--primary)' : color};"></div>
      <div class="patient-card-body">
        <div style="position:absolute;top:16px;right:16px;">${inqBadge}</div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <span class="patient-id">#${p.patient_hash.slice(0,6)}</span>
          <div style="display:flex;align-items:center;gap:12px;">
            <span class="patient-score" style="color:${color};">${pct}%</span>
            <span class="pill pill-gray">${p.location_city || ''}</span>
          </div>
        </div>
        <div class="text-muted" style="font-size:13px;margin-bottom:4px;">
          Age: ${p.age || '—'} | ${p.gender || '—'} | ${diagStr}
        </div>
        <div class="text-muted" style="font-size:12px;margin-bottom:12px;">${labStr}</div>
        <div class="score-bar-wrap">
          <div class="score-bar-fill" style="width:${pct}%;background:${color};"></div>
        </div>
        <div class="criteria-row">${breakdown}</div>
        <div class="patient-actions">
          ${p.has_inquiry && p.inquiry_status === 'pending' ? `
            <button class="btn btn-ghost btn-sm">View Details</button>
            <button class="btn btn-success btn-sm"
              onclick="respondToInquiry('${p.patient_hash}','${trial_id}','accept')">✅ Accept</button>
            <button class="btn btn-danger btn-sm"
              onclick="respondToInquiry('${p.patient_hash}','${trial_id}','decline')">❌ Decline</button>
          ` : `
            <button class="btn btn-ghost btn-sm">View Details</button>
          `}
        </div>
      </div>
    </div>`;
  }).join('');
}

async function respondToInquiry(patient_hash, trial_id, action) {
  // find inquiry_id from already-loaded data
  try {
    const inquiries = await apiFetch(`/inquiry/researcher/${trial_id}`);
    const inq = inquiries.find(i => i.patient_hash === patient_hash);
    if (!inq) { showToast('Inquiry not found', 'error'); return; }

    const note = prompt(`Add a note for the patient (optional):`) || '';
    if (action === 'accept') {
      await apiAcceptInquiry(inq.inquiry_id, note);
      showToast('Patient accepted!');
    } else {
      await apiDeclineInquiry(inq.inquiry_id, note);
      showToast('Patient declined.');
    }
    loadResearcherPatients(trial_id);
  } catch(e) {
    showToast(e.message, 'error');
  }
}


/* ══════════════════════════════════════════════════════════════
   PAGE: RESEARCHER DASHBOARD — load real data
   ══════════════════════════════════════════════════════════════ */
async function loadResearcherDashboard() {
  const institution = window._session.full_name || 'Researcher';
  const subtitleEl = document.getElementById('researcherSubtitle');
  if (subtitleEl && window._session.full_name) {
    subtitleEl.textContent = `${window._session.full_name} — Researcher Portal`;
  }

  try {
    const trials = await apiGetTrials();
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

    // Stats
    set('rstat-trials', trials.length);

    // Count matches and inquiries across all trials
    let totalMatches = 0;
    let totalPending = 0;
    let totalAccepted = 0;

    // Load inquiries for each trial to get real counts
    const trialInquiries = {};
    for (const t of trials) {
      try {
        const patients = await apiGetMatchedPatients(t.trial_id);
        totalMatches += patients.length;
        const pending  = patients.filter(p => p.inquiry_status === 'pending').length;
        const accepted = patients.filter(p => p.inquiry_status === 'accepted').length;
        totalPending  += pending;
        totalAccepted += accepted;
        trialInquiries[t.trial_id] = { matches: patients.length, pending, accepted };
      } catch(_) {
        trialInquiries[t.trial_id] = { matches: 0, pending: 0, accepted: 0 };
      }
    }

    set('rstat-matches', totalMatches);
    set('rstat-inquiries', totalPending);
    set('rstat-accepted', totalAccepted);

    // Populate trial list
    const trialsList = document.getElementById('researcherTrialsList');
    if (trialsList) {
      if (!trials.length) {
        trialsList.innerHTML = '<div class="text-muted" style="padding:24px 20px; font-size:13px;">No trials yet. Start by adding a new trial.</div>';
      } else {
        trialsList.innerHTML = trials.map(t => {
          const info = trialInquiries[t.trial_id] || { matches: 0, pending: 0 };
          return `
          <div class="trial-row">
            <div>
              <h4 style="font-size:14px; font-weight:600; margin-bottom:6px;">${t.trial_id} — ${t.title}</h4>
              <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
                <span class="pill pill-teal" style="font-size:11px;">Phase ${t.phase}</span>
                <span class="pill pill-green" style="font-size:11px;">Active</span>
                <span class="pill pill-gray" style="font-size:11px;">${t.disease_area}</span>
              </div>
              <div style="font-size:12px; color:var(--muted);">${info.matches} matches &nbsp;·&nbsp; ${info.pending > 0
                ? `<span style="color:var(--error);">${info.pending} new inquiries 🔴</span>`
                : '0 new inquiries'}</div>
            </div>
            <a href="researcher-trial.html" class="text-teal" style="font-size:12px; white-space:nowrap;">View Patients →</a>
          </div>`;
        }).join('');
      }
    }

    // Activity feed — show "no activity" for new researcher
    const activityFeed = document.getElementById('researcherActivityFeed');
    if (activityFeed) {
      if (totalMatches === 0 && totalPending === 0) {
        activityFeed.innerHTML = '<div class="text-muted" style="padding:20px; font-size:13px;">No recent activity. Activity will appear here as patients match with your trials.</div>';
      } else {
        // Build real activity items from data
        let items = [];
        if (totalPending > 0) items.push(`<div class="activity-item"><div class="act-dot" style="background:var(--warning);"></div><span>${totalPending} pending inquiry(s) awaiting review</span><span class="act-time">Now</span></div>`);
        if (totalAccepted > 0) items.push(`<div class="activity-item"><div class="act-dot" style="background:var(--success);"></div><span>${totalAccepted} patient(s) accepted</span><span class="act-time">Recent</span></div>`);
        if (totalMatches > 0) items.push(`<div class="activity-item"><div class="act-dot" style="background:#60a5fa;"></div><span>${totalMatches} total patient matches found</span><span class="act-time">Recent</span></div>`);
        activityFeed.innerHTML = items.join('');
      }
    }
  } catch(e) {
    console.warn('Could not load researcher dashboard:', e.message);
  }
}


/* ══════════════════════════════════════════════════════════════
   PAGE: ADMIN DASHBOARD — live stats
   ══════════════════════════════════════════════════════════════ */
async function loadAdminStats() {
  try {
    const stats = await apiGetStats();
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    // update stat cards if they have IDs
    set('stat-patients',    stats.total_patients);
    set('stat-researchers', stats.total_researchers);
    set('stat-trials',      stats.total_trials);
    set('stat-inquiries',   stats.total_inquiries);
    set('stat-pending',     stats.inquiry_stats?.pending);
    set('stat-accepted',    stats.inquiry_stats?.accepted);
    set('stat-declined',    stats.inquiry_stats?.declined);
  } catch(e) {
    console.warn('Could not load admin stats:', e.message);
  }
}


/* ══════════════════════════════════════════════════════════════
   PAGE: ADMIN RESEARCHERS — list all researchers
   ══════════════════════════════════════════════════════════════ */
async function loadAdminResearchers() {
  try {
    const users = await apiGetAllUsers();
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    const researchers = users.filter(u => u.role === 'researcher');
    const patients = users.filter(u => u.role === 'patient');
    const admins = users.filter(u => u.role === 'admin');

    // Update stats
    set('userstat-researchers', researchers.length);
    set('userstat-patients', patients.length);
    set('userstat-admins', admins.length);
    set('userstat-total', users.length);

    const countPill = document.getElementById('researcherCountPill');
    if (countPill) countPill.textContent = researchers.length + ' researcher' + (researchers.length !== 1 ? 's' : '');

    // Render researchers table
    const tbody = document.getElementById('researchersTableBody');
    if (!tbody) return;

    if (researchers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-muted" style="text-align:center;padding:40px;">No researchers registered yet.</td></tr>';
      return;
    }

    tbody.innerHTML = researchers.map(r => {
      const date = new Date(r.created_at).toLocaleDateString('en-IN', { year:'numeric', month:'short', day:'numeric' });
      return `<tr>
        <td><strong>${r.full_name}</strong></td>
        <td>${r.email}</td>
        <td>${r.institution || '—'}</td>
        <td>${date}</td>
        <td><span class="pill pill-green" style="font-size:11px;">Active</span></td>
      </tr>`;
    }).join('');
  } catch(e) {
    console.warn('Could not load researchers:', e.message);
    const tbody = document.getElementById('researchersTableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="text-muted" style="text-align:center;padding:20px;">Error loading researchers.</td></tr>';
  }
}


/* ══════════════════════════════════════════════════════════════
   PAGE: PATIENT DASHBOARD — enquiry tracking
   ══════════════════════════════════════════════════════════════ */
async function loadPatientDashboard() {
  const patient_hash = window._session.patient_hash;
  const container = document.getElementById('dashInquiriesContainer');
  const countEl = document.getElementById('dashInquiryCount');
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  if (!patient_hash) {
    set('pstat-matches', '0');
    if (container) container.innerHTML = `
      <div style="text-align:center; padding:40px 20px;">
        <div style="font-size:48px; margin-bottom:16px;">📋</div>
        <h3 style="font-size:18px; margin-bottom:8px;">No Data Yet</h3>
        <p class="text-muted" style="font-size:14px; margin-bottom:20px;">Submit your health details to find matching trials and track your enquiries here.</p>
        <a href="patient-method.html" class="btn btn-primary">Find Trials →</a>
      </div>`;
    return;
  }

  // Load matches count
  try {
    const matches = await apiGetMatches(patient_hash);
    set('pstat-matches', matches.length);
  } catch(_) {
    set('pstat-matches', '0');
  }

  // Load inquiries
  try {
    const inquiries = await apiGetPatientInquiries(patient_hash);
    if (countEl) countEl.textContent = inquiries.length;

    const pending = inquiries.filter(i => i.status === 'pending').length;
    const accepted = inquiries.filter(i => i.status === 'accepted').length;
    const declined = inquiries.filter(i => i.status === 'declined').length;
    set('pstat-pending', pending);
    set('pstat-accepted', accepted);
    set('pstat-declined', declined);

    if (!inquiries.length) {
      if (container) container.innerHTML = `
        <div style="text-align:center; padding:40px 20px;">
          <div style="font-size:48px; margin-bottom:16px;">📬</div>
          <h3 style="font-size:18px; margin-bottom:8px;">No Enquiries Yet</h3>
          <p class="text-muted" style="font-size:14px; margin-bottom:20px;">Express interest in a matched trial to start tracking your enquiries.</p>
          <a href="patient-results.html" class="btn btn-primary">View My Matches →</a>
        </div>`;
      return;
    }

    if (container) {
      container.innerHTML = `<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:16px;">` +
        inquiries.map(inq => {
          const statusClass = inq.status === 'accepted' ? 'pill-green' :
                              inq.status === 'declined' ? 'pill-red' : 'pill-yellow';
          const statusIcon  = inq.status === 'accepted' ? '✅ Accepted' :
                              inq.status === 'declined' ? '❌ Declined' : '⏳ Pending';
          const scoreColor = inq.match_score >= 0.8 ? 'var(--success)' :
                             inq.match_score >= 0.6 ? 'var(--warning)' : 'var(--error)';
          const scorePct = Math.round(inq.match_score * 100);
          const date = new Date(inq.created_at).toLocaleDateString('en-IN', { year:'numeric', month:'short', day:'numeric' });

          return `
          <div class="card" style="position:relative;">
            <div style="position:absolute;top:12px;right:12px;">
              <span class="pill ${statusClass}" style="font-size:11px;">${statusIcon}</span>
            </div>
            <h4 style="font-size:14px;margin-bottom:8px;padding-right:100px;">${inq.trial_title || inq.trial_id}</h4>
            <div class="text-muted" style="font-size:12px;margin-bottom:8px;">Sent: ${date}</div>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
              <span style="font-size:12px;color:var(--muted);">Match Score:</span>
              <span style="font-weight:700;color:${scoreColor};">${scorePct}%</span>
            </div>
            <div class="score-bar-wrap" style="margin-bottom:8px;">
              <div class="score-bar-fill" style="width:${scorePct}%;background:${scoreColor};"></div>
            </div>
            ${inq.researcher_note
              ? `<div style="background:var(--bg);border-left:2px solid var(--success);padding:8px 12px;border-radius:0 4px 4px 0;font-size:12px;color:var(--muted);margin-top:8px;font-style:italic;">
                  "${inq.researcher_note}"
                </div>`
              : ''}
            ${inq.patient_note
              ? `<div style="font-size:11px;color:var(--muted);margin-top:6px;">Your note: "${inq.patient_note}"</div>`
              : ''}
          </div>`;
        }).join('') +
      `</div>`;
    }
  } catch(e) {
    console.warn('Could not load patient dashboard:', e.message);
    if (container) container.innerHTML = '<p class="text-muted" style="padding:20px;">Error loading enquiries.</p>';
  }
}


/* ══════════════════════════════════════════════════════════════
   PAGE: ADMIN TRIALS — render trial list
   ══════════════════════════════════════════════════════════════ */
async function renderTrialsFromAPI(containerId = 'trialsContainer') {
  const container = document.getElementById(containerId);
  if (!container) return;

  try {
    const trials = await apiGetTrials();
    if (!trials.length) return;

    container.innerHTML = trials.map(t => `
      <div class="trial-row-card">
        <div>
          <div class="trial-id-pill">${t.trial_id}</div>
          <div class="trial-row-name">${t.title}</div>
          <div class="row-pills">
            <span class="tiny-pill tp-blue">Phase ${t.phase}</span>
            <span class="tiny-pill tp-purple">${t.disease_area}</span>
            <span class="tiny-pill tp-green">🟢 Active</span>
          </div>
        </div>
        <div class="trial-center">
          <b>${t.sponsor}</b>
          ${(t.locations || []).join(' · ')}
        </div>
        <div class="row-stats">
          <div class="row-stat">
            <div class="val text-teal">—</div>
            <div class="text-muted" style="font-size:11px;">matches</div>
          </div>
        </div>
        <div class="row-actions">
          <button class="btn btn-ghost btn-sm">Edit</button>
          <button class="btn btn-sm" style="background:none;border:1px solid var(--border);color:var(--muted);">Criteria</button>
        </div>
      </div>`).join('');
  } catch(e) {
    console.warn('Could not load trials from API, using static data:', e.message);
    renderTrials(containerId); // fallback to static
  }
}


/* ══════════════════════════════════════════════════════════════
   STATIC FALLBACK DATA (used when API unreachable)
   ══════════════════════════════════════════════════════════════ */
const TRIALS_DATA = [
  { id:'T001', name:'Diabetes Glucose Control Study',    phase:'Phase 3', disease:'Endocrinology', status:'Active', sponsor:'PharmaCo Research', locs:'Mumbai · Delhi · Pune',   matches:12, inq:3 },
  { id:'T002', name:'Hypertension Management Trial',     phase:'Phase 2', disease:'Cardiology',    status:'Active', sponsor:'HeartCare Labs',     locs:'Mumbai · Bangalore',      matches:9,  inq:1 },
  { id:'T003', name:'Breast Cancer Immunotherapy Study', phase:'Phase 3', disease:'Oncology',      status:'Active', sponsor:'Tata Memorial',      locs:'Mumbai · Delhi',          matches:7,  inq:2 },
  { id:'T004', name:'COPD Bronchodilator Efficacy',      phase:'Phase 2', disease:'Pulmonology',   status:'Active', sponsor:'LungCare Inc.',      locs:'Delhi · Chennai',         matches:5,  inq:0 },
  { id:'T005', name:'RA Biologic Therapy Study',         phase:'Phase 2', disease:'Rheumatology',  status:'Active', sponsor:'AIIMS Research',     locs:'Mumbai · Pune',           matches:8,  inq:0 },
  { id:'T006', name:'Depression SSRI Optimization',      phase:'Phase 3', disease:'Psychiatry',    status:'Active', sponsor:'MindHealth Co.',     locs:'Bangalore · Chennai',     matches:11, inq:4 },
  { id:'T007', name:'Asthma Inhaler Comparison',         phase:'Phase 4', disease:'Pulmonology',   status:'Active', sponsor:'BreatheEasy',        locs:'All Cities',              matches:6,  inq:1 },
  { id:'T008', name:'CKD Dialysis Frequency Study',      phase:'Phase 3', disease:'Nephrology',    status:'Active', sponsor:'KidneyFirst',        locs:'Hyderabad · Kolkata',     matches:4,  inq:0 },
  { id:'T009', name:"Parkinson's Neuroprotection",       phase:'Phase 2', disease:'Neurology',     status:'Active', sponsor:'NeuroLabs',          locs:'Mumbai · Bangalore',      matches:3,  inq:1 },
  { id:'T010', name:'Lupus Biologics Study',             phase:'Phase 1', disease:'Immunology',    status:'Active', sponsor:'AutoImm Ltd.',       locs:'Mumbai',                  matches:2,  inq:0 },
  { id:'T011', name:'Type 1 Diabetes Insulin Study',     phase:'Phase 3', disease:'Endocrinology', status:'Inactive', sponsor:'DiabCare',         locs:'Delhi · Chennai',         matches:0,  inq:0 },
  { id:'T012', name:'Cardiac Rehab Protocol Study',      phase:'Phase 4', disease:'Cardiology',    status:'Active', sponsor:'HeartCare Labs',     locs:'Mumbai · Pune',           matches:7,  inq:2 },
  { id:'T013', name:'Thyroid Hormone Optimization',      phase:'Phase 2', disease:'Endocrinology', status:'Active', sponsor:'ThyroCare',          locs:'Ahmedabad · Pune',        matches:5,  inq:1 },
  { id:'T014', name:'Anemia Iron Therapy Trial',         phase:'Phase 3', disease:'Hematology',    status:'Active', sponsor:'BloodCare',          locs:'All Cities',              matches:9,  inq:3 },
  { id:'T015', name:'COPD Pulmonary Rehabilitation',     phase:'Phase 3', disease:'Pulmonology',   status:'Active', sponsor:'RespiCare',          locs:'Ahmedabad · Kolkata · Delhi', matches:8, inq:2 },
];

function renderTrials(containerId = 'trialsContainer') {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = TRIALS_DATA.map(t => `
    <div class="trial-row-card">
      <div>
        <div class="trial-id-pill">${t.id}</div>
        <div class="trial-row-name">${t.name}</div>
        <div class="row-pills">
          <span class="tiny-pill tp-blue">${t.phase}</span>
          <span class="tiny-pill tp-purple">${t.disease}</span>
          <span class="tiny-pill ${t.status === 'Active' ? 'tp-green' : ''}">${t.status === 'Active' ? '🟢 ' : ''}${t.status}</span>
        </div>
      </div>
      <div class="trial-center"><b>${t.sponsor}</b>${t.locs}</div>
      <div class="row-stats">
        <div class="row-stat"><div class="val text-teal">${t.matches}</div><div class="text-muted" style="font-size:11px">matches</div></div>
        <div class="row-stat"><div class="val" style="color:var(--warning)">${t.inq}</div><div class="text-muted" style="font-size:11px">inquiries</div></div>
      </div>
      <div class="row-actions">
        <button class="btn btn-ghost btn-sm">Edit</button>
        <button class="btn btn-sm" style="background:none;border:1px solid var(--border);color:var(--muted)">Criteria</button>
        <button class="btn btn-sm btn-danger-outline">Deactivate</button>
      </div>
    </div>`).join('');
}


/* ══════════════════════════════════════════════════════════════
   DOM READY — detect page and initialise
   ══════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {

  // Close modals on backdrop click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) {
        overlay.classList.remove('open');
        document.body.style.overflow = '';
      }
    });
  });

  const page = window.location.pathname.split('/').pop();

  if (page === 'admin-trials.html') {
    renderTrialsFromAPI();
  }

  if (page === 'admin-dashboard.html') {
    loadAdminStats();
  }

  if (page === 'admin-researchers.html') {
    loadAdminResearchers();
  }

  if (page === 'researcher-dashboard.html') {
    loadResearcherDashboard();
  }

  if (page === 'patient-results.html') {
    loadPatientResults();
  }

  if (page === 'patient-dashboard.html') {
    loadPatientDashboard();
  }

  if (page === 'patient-upload.html') {
    initUploadPage();
  }

  if (page === 'patient-ocr-confirm.html') {
    populateOcrTable();
    // wire confirm button
    const confirmBtn = document.querySelector('a[href="patient-results.html"]');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', e => {
        e.preventDefault();
        confirmOcrAndSubmit();
      });
    }
  }

  if (page === 'patient-form.html') {
    // wire Find Trials button
    const btn = document.querySelector('a[href="patient-results.html"]');
    if (btn) {
      btn.addEventListener('click', e => {
        e.preventDefault();
        submitPatientForm();
      });
    }
  }

  if (page === 'researcher-trial.html') {
    // Populate trial selector from API and then load patients
    populateTrialSelector();
    const selector = document.getElementById('trialSelector');
    if (selector) {
      selector.addEventListener('change', () => loadResearcherPatients(selector.value));
    }
  }

  if (page === 'login.html') {
    const btn = document.getElementById('loginBtn');
    if (btn) {
      btn.addEventListener('click', e => {
        e.preventDefault();
        loginRedirect();
      });
    }
  }

  if (page === 'register.html') {
    const btn = document.querySelector('.btn-primary.btn-full');
    if (btn) {
      btn.addEventListener('click', e => {
        e.preventDefault();
        handleRegister();
      });
    }
  }

  // Navbar user display + welcome headings
  const fullName = window._session.full_name;
  const role     = window._session.role;
  const navUser  = document.getElementById('navUserDisplay');
  if (navUser && role === 'admin') {
    navUser.textContent = 'Welcome, Admin';
  } else if (navUser && fullName) {
    navUser.textContent = fullName;
  }

  const welcomeHeading = document.getElementById('welcomeHeading');
  if (welcomeHeading) {
    if (role === 'admin') {
      welcomeHeading.textContent = 'Welcome, Admin';
    } else if (fullName) {
      welcomeHeading.textContent = `Welcome back, ${fullName}`;
    }
  }

  // Profile initials
  const initialsEl = document.getElementById('navProfileInitials');
  if (initialsEl) {
    if (role === 'admin') {
      initialsEl.textContent = 'A';
    } else if (fullName) {
      const parts = fullName.trim().split(' ');
      const initials = (parts[0]?.[0] || '') + (parts[1]?.[0] || '');
      initialsEl.textContent = initials.toUpperCase() || '👤';
    } else {
      initialsEl.textContent = '👤';
    }
  }
});

// Global helpers for navbar/back actions
function goHome() {
  window.location.href = 'index.html';
}

function handleBackClick() {
  if (window.history.length > 1) {
    window.history.back();
  } else {
    goHome();
  }
}

function toggleProfileMenu(event) {
  event.stopPropagation();
  const menu = document.getElementById('navProfileDropdown');
  if (!menu) return;
  const isOpen = menu.classList.contains('open');
  document.querySelectorAll('.nav-profile-dropdown.open').forEach(m => m.classList.remove('open'));
  if (!isOpen) menu.classList.add('open');
}

// Close profile dropdown when clicking outside
document.addEventListener('click', () => {
  document.querySelectorAll('.nav-profile-dropdown.open').forEach(m => m.classList.remove('open'));
});