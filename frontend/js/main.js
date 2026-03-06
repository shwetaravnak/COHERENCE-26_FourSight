/* ============================================================
   ClinMatch AI — Shared JavaScript Utilities
   ============================================================ */

'use strict';

/* ── Modal ─────────────────────────────────────────────────── */
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

// Close modal on backdrop click
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) {
        overlay.classList.remove('open');
        document.body.style.overflow = '';
      }
    });
  });
});

/* ── Role Selector (Login) ─────────────────────────────────── */
function selectRole(el, role) {
  document.querySelectorAll('.role-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  const btn = document.getElementById('loginBtn');
  if (btn) btn.textContent = 'Login as ' + role;
  return role;
}

/* ── Role Tabs (Register) ──────────────────────────────────── */
function switchRegTab(el, type) {
  document.querySelectorAll('.role-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  const inst = document.getElementById('instField');
  if (inst) inst.classList.toggle('show', type === 'researcher');
}

/* ── Password Strength ─────────────────────────────────────── */
function checkStrength(input) {
  const val = input.value;
  const fill = document.getElementById('strengthFill');
  if (!fill) return;
  let strength = 0;
  if (val.length >= 8)          strength++;
  if (/[A-Z]/.test(val))        strength++;
  if (/[0-9]/.test(val))        strength++;
  if (/[^A-Za-z0-9]/.test(val)) strength++;
  const colors = ['', '#f87171', '#fbbf24', '#34d399', '#00e5cc'];
  const widths  = ['0%', '25%',   '50%',    '75%',    '100%'];
  fill.style.width      = widths[strength];
  fill.style.background = colors[strength];
}

/* ── Password Toggle ───────────────────────────────────────── */
function togglePwd(fieldId = 'pwdField') {
  const f = document.getElementById(fieldId);
  if (!f) return;
  f.type = f.type === 'password' ? 'text' : 'password';
}

/* ── Radio Pills ───────────────────────────────────────────── */
function selectPill(el) {
  el.closest('.radio-pills').querySelectorAll('.radio-pill')
    .forEach(p => p.classList.remove('selected'));
  el.classList.add('selected');
}

/* ── Chip Input ────────────────────────────────────────────── */
function addChip(btn, label = 'Item') {
  const name = prompt(`Enter ${label}:`);
  if (!name || !name.trim()) return;
  const chip = document.createElement('div');
  chip.className = 'chip';
  chip.innerHTML = `${name.trim()} <span class="chip-remove" onclick="this.parentElement.remove()">×</span>`;
  btn.parentElement.insertBefore(chip, btn);
}

/* ── Upload Simulation ─────────────────────────────────────── */
function simulateUpload(redirectFn) {
  const zone   = document.getElementById('uploadZone');
  const loader = document.getElementById('uploadLoader');
  const bar    = document.getElementById('uploadProgress');
  if (!zone || !loader || !bar) return;
  zone.style.display   = 'none';
  loader.style.display = 'block';
  let pct = 0;
  const interval = setInterval(() => {
    pct += Math.random() * 18;
    if (pct >= 100) {
      pct = 100;
      clearInterval(interval);
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

/* ── Parsed Rules Preview ──────────────────────────────────── */
function toggleParsedOutput() {
  const el = document.getElementById('parsedOutput');
  if (!el) return;
  el.style.display = el.style.display === 'block' ? 'none' : 'block';
}

/* ── Manage Trials — Dynamic Render ────────────────────────── */
const TRIALS_DATA = [
  { id:'T001', name:'Diabetes Glucose Control Study',   phase:'Phase 3', disease:'Endocrinology', status:'Active',   sponsor:'PharmaCo Research',  locs:'Mumbai · Delhi · Pune',     matches:12, inq:3 },
  { id:'T002', name:'Hypertension Management Trial',    phase:'Phase 2', disease:'Cardiology',    status:'Active',   sponsor:'HeartCare Labs',      locs:'Mumbai · Bangalore',         matches:9,  inq:1 },
  { id:'T003', name:'Breast Cancer Immunotherapy Study',phase:'Phase 3', disease:'Oncology',      status:'Active',   sponsor:'Tata Memorial',       locs:'Mumbai · Delhi',             matches:7,  inq:2 },
  { id:'T004', name:'COPD Bronchodilator Efficacy',     phase:'Phase 2', disease:'Pulmonology',   status:'Active',   sponsor:'LungCare Inc.',       locs:'Delhi · Chennai',            matches:5,  inq:0 },
  { id:'T005', name:'RA Biologic Therapy Study',        phase:'Phase 2', disease:'Rheumatology',  status:'Active',   sponsor:'AIIMS Research',      locs:'Mumbai · Pune',              matches:8,  inq:0 },
  { id:'T006', name:'Depression SSRI Optimization',     phase:'Phase 3', disease:'Psychiatry',    status:'Active',   sponsor:'MindHealth Co.',      locs:'Bangalore · Chennai',        matches:11, inq:4 },
  { id:'T007', name:'Asthma Inhaler Comparison',        phase:'Phase 4', disease:'Pulmonology',   status:'Active',   sponsor:'BreatheEasy',         locs:'All Cities',                 matches:6,  inq:1 },
  { id:'T008', name:'CKD Dialysis Frequency Study',     phase:'Phase 3', disease:'Nephrology',    status:'Active',   sponsor:'KidneyFirst',         locs:'Hyderabad · Kolkata',        matches:4,  inq:0 },
  { id:'T009', name:"Parkinson's Neuroprotection",      phase:'Phase 2', disease:'Neurology',     status:'Active',   sponsor:'NeuroLabs',           locs:'Mumbai · Bangalore',         matches:3,  inq:1 },
  { id:'T010', name:'Lupus Biologics Study',            phase:'Phase 1', disease:'Immunology',    status:'Active',   sponsor:'AutoImm Ltd.',        locs:'Mumbai',                     matches:2,  inq:0 },
  { id:'T011', name:'Type 1 Diabetes Insulin Study',    phase:'Phase 3', disease:'Endocrinology', status:'Inactive', sponsor:'DiabCare',            locs:'Delhi · Chennai',            matches:0,  inq:0 },
  { id:'T012', name:'Cardiac Rehab Protocol Study',     phase:'Phase 4', disease:'Cardiology',    status:'Active',   sponsor:'HeartCare Labs',      locs:'Mumbai · Pune',              matches:7,  inq:2 },
  { id:'T013', name:'Thyroid Hormone Optimization',     phase:'Phase 2', disease:'Endocrinology', status:'Active',   sponsor:'ThyroCare',           locs:'Ahmedabad · Pune',           matches:5,  inq:1 },
  { id:'T014', name:'Anemia Iron Therapy Trial',        phase:'Phase 3', disease:'Hematology',    status:'Active',   sponsor:'BloodCare',           locs:'All Cities',                 matches:9,  inq:3 },
  { id:'T015', name:'Obesity Metabolic Trial',          phase:'Phase 2', disease:'Endocrinology', status:'Active',   sponsor:'MetaCare',            locs:'Mumbai · Bangalore',         matches:8,  inq:2 },
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
      <div class="trial-center">
        <b>${t.sponsor}</b>${t.locs}
      </div>
      <div class="row-stats">
        <div class="row-stat"><div class="val text-teal">${t.matches}</div><div class="text-muted" style="font-size:11px">matches</div></div>
        <div class="row-stat"><div class="val" style="color:var(--warning)">${t.inq}</div><div class="text-muted" style="font-size:11px">inquiries</div></div>
      </div>
      <div class="row-actions">
        <button class="btn btn-ghost btn-sm">Edit</button>
        <button class="btn btn-sm" style="background:none;border:1px solid var(--border);color:var(--muted)">Criteria</button>
        <button class="btn btn-sm btn-danger-outline">Deactivate</button>
      </div>
    </div>
  `).join('');
}

/* ── Init on DOM ready ─────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  renderTrials();
});
