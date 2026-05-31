/* ══════════════════════════════════════════════════
   STATE
══════════════════════════════════════════════════ */
const today = new Date();
today.setHours(0,0,0,0);

let dayOffset   = 0;   // 0 = aujourd'hui, 1 = hier, …
let weekOffset  = 0;
let monthOffset = 0;   // 0 = mois courant

let currentView = 'day';

/* ══════════════════════════════════════════════════
   UTILS
══════════════════════════════════════════════════ */
const fmt = n => Math.round(n).toLocaleString('fr-FR');
const fmtK = n => Math.abs(n) >= 1000
  ? (Math.abs(n) / 1000).toFixed(1).replace('.', ',') + 'k'
  : Math.round(Math.abs(n)).toString();
const fmtKm = n => Number(n || 0).toLocaleString('fr-FR', {
  minimumFractionDigits: n > 0 && n < 10 ? 1 : 0,
  maximumFractionDigits: 1
});

function dateForOffset(offset) {
  const d = new Date(today);
  d.setDate(d.getDate() - offset);
  return d;
}

function isoDate(d) {
  const y  = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const dy = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${dy}`;
}

function formatDateFr(ds) {
  const d = new Date(ds + 'T00:00:00');
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function formatShortFr(ds) {
  const d = new Date(ds + 'T00:00:00');
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

const DAY_NAMES = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const MONTH_NAMES_FR = ['Janvier','Février','Mars','Avril','Mai','Juin',
                        'Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

/* ── Delta color ── */
function deltaColor(delta) {
  if (delta == null) return 'var(--text-dim)';
  return delta <= 0 ? 'var(--green)' : 'var(--red)';
}

function deltaClass(delta) {
  if (delta == null) return 'neutral';
  return delta <= 0 ? 'deficit' : 'surplus';
}

function deltaLabel(delta) {
  if (delta == null) return '—';
  const abs = Math.abs(Math.round(delta));
  return delta <= 0 ? `−${fmt(abs)}` : `+${fmt(abs)}`;
}

function deltaTotalLabel(delta) {
  if (delta == null) return '—';
  return Math.round(delta) === 0 ? '0' : deltaLabel(delta);
}

function deltaTotalClass(delta) {
  if (delta == null || Math.round(delta) === 0) return 'neutral';
  return deltaClass(delta);
}

/* Calendar cell bg color */
function cellBg(delta) {
  if (delta == null) return null;
  if (delta <= -500) return '#1b5e20'; // deep green
  if (delta <= -200) return '#2e7d32'; // green
  if (delta <  0)    return '#388e3c'; // light green
  if (delta <  200)  return '#bf360c'; // orange
  return '#b71c1c';                    // red
}

/* ══════════════════════════════════════════════════
   API FETCH (with error handling)
══════════════════════════════════════════════════ */
async function apiFetch(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/* ══════════════════════════════════════════════════
   VIEW SWITCHING
══════════════════════════════════════════════════ */
function switchView(name) {
  if (currentView === name) return;

  document.getElementById(`view-${currentView}`).classList.remove('active');
  document.getElementById(`tab-${currentView}`).classList.remove('active');

  currentView = name;
  document.getElementById(`view-${name}`).classList.add('active');
  document.getElementById(`tab-${name}`).classList.add('active');

  if (name === 'day')   loadDay();
  if (name === 'week')  loadWeek();
  if (name === 'month') loadMonth();
  if (name === 'stats') loadStats();
}

/* ══════════════════════════════════════════════════
   JOUR VIEW
══════════════════════════════════════════════════ */
function changeDay(dir) {
  dayOffset = Math.max(0, dayOffset - dir);
  document.getElementById('day-next').disabled = (dayOffset <= 0);
  loadDay();
}

async function loadDay() {
  const d     = dateForOffset(dayOffset);
  const ds    = isoDate(d);
  const isToday = dayOffset === 0;

  // Label
  const labelEl = document.getElementById('day-label');
  labelEl.textContent = isToday
    ? 'Aujourd\'hui'
    : formatDateFr(ds);

  // Reset UI
  setHero(null, null);
  document.getElementById('d-eaten').textContent = '—';
  document.getElementById('d-burned').textContent = '—';
  document.getElementById('d-steps').textContent = '—';
  document.getElementById('d-distance').textContent = '—';
  document.getElementById('d-ratio').textContent = '—';
  document.getElementById('d-progress').style.width = '0%';
  document.getElementById('d-prot').textContent = '—';
  document.getElementById('d-carb').textContent = '—';
  document.getElementById('d-fat').textContent  = '—';
  document.getElementById('d-prot-goal').textContent = '—';
  document.getElementById('d-carb-goal').textContent = '—';
  document.getElementById('d-fat-goal').textContent  = '—';
  document.getElementById('d-prot-bar').style.width = '0%';
  document.getElementById('d-carb-bar').style.width = '0%';
  document.getElementById('d-fat-bar').style.width  = '0%';
  document.getElementById('meals-card').style.display = 'none';

  try {
    const url = isToday ? '/api/today' : `/api/day?date=${ds}`;
    const data = await apiFetch(url);
    renderDay(data);
  } catch (e) {
    console.error('Day fetch error:', e);
  }
}

function setHero(delta, hasData) {
  const card  = document.getElementById('hero-card');
  const glow  = document.getElementById('hero-glow');
  const badge = document.getElementById('hero-badge');
  const val   = document.getElementById('hero-value');

  card.className  = 'hero-card';
  badge.className = 'hero-badge neutral';
  val.className   = 'hero-value neutral';

  if (!hasData || delta == null) {
    badge.textContent = 'Pas de données';
    val.textContent   = '—';
    glow.style.background = 'transparent';
    return;
  }

  const abs = Math.abs(Math.round(delta));
  if (delta <= 0) {
    card.classList.add('is-deficit');
    badge.className = 'hero-badge deficit';
    badge.textContent = 'Déficit';
    val.className = 'hero-value deficit';
    val.textContent = fmt(abs);
    glow.style.background = 'var(--green)';
  } else {
    card.classList.add('is-surplus');
    badge.className = 'hero-badge surplus';
    badge.textContent = 'Surplus';
    val.className = 'hero-value surplus';
    val.textContent = fmt(abs);
    glow.style.background = 'var(--red)';
  }
}

function renderMacro(key, value, goal) {
  const cleanValue = Number(value || 0);
  const cleanGoal  = Number(goal || 0);
  const pct = cleanGoal > 0 ? cleanValue / cleanGoal * 100 : 0;
  document.getElementById(`d-${key}`).textContent = Math.round(cleanValue);
  document.getElementById(`d-${key}-goal`).textContent =
    cleanGoal > 0 ? `${Math.round(cleanValue)} / ${Math.round(cleanGoal)} g` : '—';
  document.getElementById(`d-${key}-bar`).style.width = Math.min(pct, 100) + '%';
}

function renderDay(data) {
  const hasEaten  = data.eaten > 0;
  const hasBurned = data.burned_total > 0;
  const hasData   = hasEaten || hasBurned;

  setHero(data.delta, hasData);

  if (hasEaten || hasBurned) {
    document.getElementById('d-eaten').textContent  = hasEaten  ? fmt(data.eaten)         : '—';
    document.getElementById('d-burned').textContent = hasBurned ? fmt(data.burned_total)  : '—';
    document.getElementById('d-steps').textContent  = data.steps > 0 ? fmt(data.steps)    : '—';
    document.getElementById('d-distance').textContent =
      data.distance_km > 0 ? fmtKm(data.distance_km) : '—';

    if (hasEaten && hasBurned) {
      const ratio = Math.min(data.eaten / data.burned_total * 100, 120);
      const pct   = Math.min(ratio, 100);
      const prog  = document.getElementById('d-progress');
      prog.style.width      = pct + '%';
      prog.style.background = data.delta <= 0 ? 'var(--green)' : 'var(--red)';
      document.getElementById('d-ratio').textContent =
        `${Math.round(ratio)}%`;
    }
  }

  if (hasEaten) {
    renderMacro('prot', data.protein, data.goal_protein);
    renderMacro('carb', data.carbs, data.goal_carbs);
    renderMacro('fat', data.fat, data.goal_fat);
  }

  // Meals
  if (data.meals && data.meals.length > 0) {
    const card = document.getElementById('meals-card');
    const list = document.getElementById('meals-list');
    card.style.display = 'block';
    list.innerHTML = data.meals.map(m => `
      <div class="meal-item">
        <div>
          <div class="meal-name">${m.name}</div>
          <div class="meal-macros">P: ${Math.round(m.protein)}g  G: ${Math.round(m.carbs)}g  L: ${Math.round(m.fat)}g</div>
        </div>
        <div>
          <div class="meal-kcal">${Math.round(m.calories)}</div>
          <div style="font-size:9px;color:var(--text-dim);text-align:right">kcal</div>
        </div>
      </div>
    `).join('');
  }
}

/* ══════════════════════════════════════════════════
   SEMAINE VIEW
══════════════════════════════════════════════════ */
function changeWeek(dir) {
  weekOffset = Math.max(0, weekOffset - dir);
  document.getElementById('week-next').disabled = (weekOffset <= 0);
  loadWeek();
}

async function loadWeek() {
  document.getElementById('week-label').textContent = 'Chargement…';
  document.getElementById('w-avg').textContent = '—';
  document.getElementById('w-total').textContent = '—';
  document.getElementById('w-total').className = 'week-avg-value neutral';
  document.getElementById('w-total-sub').textContent = 'sur — jours suivis';
  document.getElementById('w-bars').innerHTML = '<div class="loading-overlay"><div class="spinner"></div></div>';
  document.getElementById('w-day-list').innerHTML = '';

  try {
    const days = await apiFetch(`/api/week?offset=${weekOffset}`);
    renderWeek(days);
  } catch (e) {
    document.getElementById('w-bars').innerHTML = `<div class="error-card">Erreur: ${e.message}</div>`;
  }
}

function renderWeek(days) {
  if (!days || days.length === 0) return;

  const first = new Date(days[0].date + 'T00:00:00');
  const last  = new Date(days[days.length - 1].date + 'T00:00:00');
  document.getElementById('week-label').textContent =
    `${first.getDate()} – ${last.toLocaleDateString('fr-FR', { day:'numeric', month:'short' })}`;

  const todayIso = isoDate(today);
  const periodHasToday = days.some(d => d.date === todayIso);
  // Moyenne : données complètes uniquement, hors aujourd'hui
  const tracked = days.filter(d => d.complete_data && d.date !== todayIso);
  const avg = tracked.length > 0
    ? tracked.reduce((s, d) => s + d.delta, 0) / tracked.length
    : null;
  const totalTracked = tracked;
  const totalDelta = totalTracked.length > 0
    ? totalTracked.reduce((s, d) => s + d.delta, 0)
    : null;

  const avgEl = document.getElementById('w-avg');
  avgEl.textContent  = avg != null ? deltaLabel(avg) : '—';
  avgEl.className    = 'week-avg-value ' + (avg != null ? deltaClass(avg) : 'neutral');
  document.getElementById('w-avg-sub').textContent =
    `sur ${tracked.length} jour${tracked.length !== 1 ? 's' : ''} complets (hors aujourd'hui)`;

  const totalEl = document.getElementById('w-total');
  totalEl.textContent = deltaTotalLabel(totalDelta);
  totalEl.className = 'week-avg-value ' + deltaTotalClass(totalDelta);
  document.getElementById('w-total-sub').textContent =
    totalTracked.length > 0
      ? `kcal · ${trackedDaysLabel(totalTracked.length)}${periodHasToday ? " · hors aujourd'hui" : ''}`
      : 'aucun jour suivi';

  // Bar chart
  const maxAbs = Math.max(...days.map(d => d.has_data ? Math.abs(d.delta) : 0), 1);
  const barsEl = document.getElementById('w-bars');
  barsEl.innerHTML = days.map(d => {
    const dayDate = new Date(d.date + 'T00:00:00');
    const label   = DAY_NAMES[dayDate.getDay()];
    const height  = d.has_data ? Math.max(Math.abs(d.delta) / maxAbs * 100, 4) : 2;
    const isComplete = d.complete_data;
    const bg      = !d.has_data ? 'var(--surface-3)'
                  : !isComplete ? 'rgba(128,128,128,0.35)'
                  : (d.delta <= 0 ? 'var(--green)' : 'var(--red)');
    const val     = d.has_data ? (d.delta <= 0 ? `−${fmtK(d.delta)}` : `+${fmtK(d.delta)}`) : '';
    const opacity = d.has_data && !isComplete ? '0.5' : '1';
    return `
      <div class="bar-col" style="opacity:${opacity}">
        <div class="bar-val-label">${val}</div>
        <div class="bar-fill" style="height:${height}%;background:${bg}"></div>
        <div class="bar-day-label">${label}</div>
      </div>`;
  }).join('');

  // Day list
  document.getElementById('w-day-list').innerHTML = days.slice().reverse().map(d => {
    const isComplete = d.complete_data;
    const dot = !d.has_data ? 'var(--surface-3)'
              : !isComplete ? 'rgba(128,128,128,0.4)'
              : (d.delta <= 0 ? 'var(--green)' : 'var(--red)');
    const cls = isComplete ? deltaClass(d.delta) : 'neutral';
    const isT = d.date === todayIso;
    const incompleteCls = d.has_data && !isComplete ? ' incomplete' : '';
    const incompleteTag = d.has_data && !isComplete
      ? '<span style="font-size:9px;color:var(--text-dim);margin-left:4px">⚠️ données incomplètes</span>' : '';
    return `
      <div class="week-day-item${incompleteCls}" onclick="goToDay('${d.date}')">
        <div class="week-day-dot" style="background:${dot}"></div>
        <div>
          <div class="week-day-name">${formatShortFr(d.date)}${isT ? ' 🔵' : ''}${incompleteTag}</div>
          ${d.has_data ? `<div class="week-day-date">${Math.round(d.eaten)} mangé · ${Math.round(d.burned_total)} dépensé · ${fmt(d.steps)} pas · ${fmtKm(d.distance_km)} km</div>` : '<div class="week-day-date" style="color:var(--text-muted)">Aucune donnée</div>'}
        </div>
        <div>
          <div class="week-day-delta ${cls}">${d.has_data ? deltaLabel(d.delta) : '—'}</div>
          ${d.has_data ? `<div class="week-day-sub">kcal</div>` : ''}
        </div>
      </div>`;
  }).join('');
}

function goToDay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const diff = Math.round((today - d) / 86400000);
  dayOffset = diff;
  document.getElementById('day-next').disabled = (dayOffset <= 0);
  switchView('day');
}

/* ══════════════════════════════════════════════════
   MOIS VIEW
══════════════════════════════════════════════════ */
function changeMonth(dir) {
  monthOffset = Math.max(0, monthOffset - dir);
  document.getElementById('month-next').disabled = (monthOffset <= 0);
  loadMonth();
}

async function loadMonth() {
  const now  = new Date();
  const year = now.getFullYear();
  const mon  = now.getMonth() + 1;
  // Calculate target month
  let tYear = year, tMon = mon - monthOffset;
  while (tMon <= 0) { tMon += 12; tYear--; }
  while (tMon > 12) { tMon -= 12; tYear++; }

  document.getElementById('month-label').textContent = `${MONTH_NAMES_FR[tMon-1]} ${tYear}`;
  document.getElementById('m-avg').textContent = '-';
  document.getElementById('m-green-days').textContent = '-';
  document.getElementById('m-total').textContent = '-';
  document.getElementById('m-total').className = 'month-stat-val neutral';
  document.getElementById('m-total-sub').textContent = 'Total calorique';
  document.getElementById('cal-grid').innerHTML =
    '<div class="loading-overlay" style="grid-column:span 7"><div class="spinner"></div></div>';

  try {
    const days = await apiFetch(`/api/month?year=${tYear}&month=${tMon}`);
    renderMonth(days, tYear, tMon);
  } catch (e) {
    document.getElementById('cal-grid').innerHTML =
      `<div class="error-card" style="grid-column:span 7">Erreur: ${e.message}</div>`;
  }
}

function renderMonth(days, year, month) {
  // Build a map date→data
  const map = {};
  for (const d of days) map[d.date] = d;

  const todayIso = isoDate(today);
  const periodHasToday = days.some(d => d.date === todayIso);
  // Moyenne : données complètes uniquement, hors aujourd'hui
  const tracked    = days.filter(d => d.complete_data && d.date !== todayIso);
  const avg        = tracked.length > 0
    ? tracked.reduce((s, d) => s + d.delta, 0) / tracked.length : null;
  const greenDays  = tracked.filter(d => d.delta < 0).length;
  const totalTracked = tracked;
  const totalDelta = totalTracked.length > 0
    ? totalTracked.reduce((s, d) => s + d.delta, 0) : null;

  const avgEl = document.getElementById('m-avg');
  avgEl.textContent = avg != null ? deltaLabel(avg) : '-';
  avgEl.className   = 'month-stat-val ' + (avg != null ? deltaClass(avg) : 'neutral');
  document.getElementById('m-green-days').textContent =
    tracked.length > 0 ? `${greenDays}/${tracked.length}` : '-';

  const totalEl = document.getElementById('m-total');
  totalEl.textContent = totalDelta != null ? deltaTotalLabel(totalDelta) : '-';
  totalEl.className = 'month-stat-val ' + deltaTotalClass(totalDelta);
  document.getElementById('m-total-sub').textContent =
    totalTracked.length > 0
      ? `Total · ${trackedDaysLabel(totalTracked.length)}${periodHasToday ? " · hors aujourd'hui" : ''}`
      : 'Total calorique';

  // Calendar grid
  const firstDay = new Date(year, month - 1, 1);
  let startDow = firstDay.getDay();
  startDow = (startDow + 6) % 7;   // Monday-based

  const daysInMonth = new Date(year, month, 0).getDate();
  const cells       = [];

  // Empty cells before day 1
  for (let i = 0; i < startDow; i++) {
    cells.push('<div class="cal-cell empty"></div>');
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const ds  = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const d   = map[ds];
    const isT = ds === todayIso;
    const isFuture = ds > todayIso;

    if (isFuture) {
      cells.push(`<div class="cal-cell no-data${isT ? ' today' : ''}">
        <div class="cal-day-num">${day}</div>
      </div>`);
      continue;
    }

    if (!d || !d.has_data) {
      cells.push(`<div class="cal-cell no-data${isT ? ' today' : ''}" onclick="goToDay('${ds}')">
        <div class="cal-day-num">${day}</div>
      </div>`);
      continue;
    }

    // Données incomplètes (une seule source) → afficher en gris, exclure des moyennes
    if (!d.complete_data) {
      const partialVal = d.delta <= 0 ? `−${fmtK(d.delta)}` : `+${fmtK(d.delta)}`;
      cells.push(`
        <div class="cal-cell incomplete${isT ? ' today' : ''}"
             onclick="goToDay('${ds}')"
             title="${formatShortFr(ds)}: données incomplètes">
          <div class="cal-day-num">${day}</div>
          <div class="cal-delta">${partialVal}</div>
        </div>`);
      continue;
    }

    const bg  = cellBg(d.delta);
    const val = d.delta <= 0
      ? `−${fmtK(d.delta)}`
      : `+${fmtK(d.delta)}`;

    cells.push(`
      <div class="cal-cell${isT ? ' today' : ''}"
           style="background:${bg}"
           onclick="goToDay('${ds}')"
           title="${formatShortFr(ds)}: ${Math.round(d.delta)} kcal">
        <div class="cal-day-num">${day}</div>
        <div class="cal-delta">${val}</div>
      </div>`);
  }

  document.getElementById('cal-grid').innerHTML = cells.join('');
}

/* ══════════════════════════════════════════════════
   STATS VIEW
══════════════════════════════════════════════════ */
async function loadStats() {
  document.getElementById('stats-label').textContent = 'Chargement…';
  document.getElementById('s-avg-delta').textContent = '—';
  document.getElementById('s-deficit-rate').textContent = '—';
  document.getElementById('s-avg-steps').textContent = '—';
  document.getElementById('s-distance').textContent = '—';
  document.getElementById('s-target-rate').textContent = '—';
  document.getElementById('s-active').textContent = '—';
  for (const id of ['s-total-week', 's-total-month', 's-total-start']) {
    const el = document.getElementById(id);
    el.textContent = '—';
    el.className = 'calorie-total-value neutral';
  }
  for (const id of ['s-total-week-sub', 's-total-month-sub', 's-total-start-sub']) {
    document.getElementById(id).textContent = '—';
  }
  document.getElementById('s-bars').innerHTML = '<div class="loading-overlay"><div class="spinner"></div></div>';
  document.getElementById('s-records').innerHTML = '<div class="loading-overlay"><div class="spinner"></div></div>';

  try {
    const stats = await apiFetch('/api/stats');
    renderStats(stats);
  } catch (e) {
    document.getElementById('s-bars').innerHTML = `<div class="error-card">Erreur: ${e.message}</div>`;
    document.getElementById('s-records').innerHTML = '';
  }
}

function pctLabel(value) {
  return value == null ? '—' : `${Math.round(value)}%`;
}

function signedLabel(value, unit = '') {
  if (value == null) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${fmt(value)}${unit}`;
}

function trendText(value, unit = '') {
  if (value == null) return 'pas assez de données';
  if (value === 0) return 'stable vs 7j précédents';
  return `${signedLabel(value, unit)} vs 7j précédents`;
}

function recordRow(title, day, value, className = 'neutral') {
  if (!day) {
    return `
      <div class="record-row">
        <div>
          <div class="record-title">${title}</div>
          <div class="record-date">Pas assez de données</div>
        </div>
        <div class="record-value neutral">—</div>
      </div>`;
  }
  return `
    <div class="record-row" onclick="goToDay('${day.date}')">
      <div>
        <div class="record-title">${title}</div>
        <div class="record-date">${formatShortFr(day.date)}</div>
      </div>
      <div class="record-value ${className}">${value}</div>
    </div>`;
}

function trackedDaysLabel(count) {
  const n = Number(count || 0);
  return `${n} jour${n > 1 ? 's' : ''} suivi${n > 1 ? 's' : ''}`;
}

function renderCalorieTotal(valueId, subId, summary, withStartDate = false) {
  const total = summary ? summary.total_delta : null;
  const valueEl = document.getElementById(valueId);
  valueEl.textContent = deltaTotalLabel(total);
  valueEl.className = 'calorie-total-value ' + deltaTotalClass(total);

  let sub = summary && summary.days ? `kcal · ${trackedDaysLabel(summary.days)}` : 'aucun jour suivi';
  if (withStartDate && summary && summary.start) {
    sub += ` depuis ${formatShortFr(summary.start)}`;
  }
  if (summary && summary.days) {
    sub += " · hors aujourd'hui";
  }
  document.getElementById(subId).textContent = sub;
}

function renderStats(stats) {
  const period = stats.period || {};
  const balance = stats.balance || {};
  const calorieTotals = stats.calorie_totals || {};
  const activity = stats.activity || {};
  const trend = stats.trend || {};
  const records = stats.records || {};

  document.getElementById('stats-label').textContent =
    `${period.complete_days || 0} jours complets · ${period.start || '—'} → ${period.end || '—'}`;

  const avgDelta = balance.avg_delta;
  const avgDeltaEl = document.getElementById('s-avg-delta');
  avgDeltaEl.textContent = avgDelta != null ? deltaLabel(avgDelta) : '—';
  avgDeltaEl.className = 'insight-value ' + (avgDelta != null ? deltaClass(avgDelta) : 'neutral');
  document.getElementById('s-avg-delta-sub').textContent =
    trend.avg_delta_change != null ? trendText(trend.avg_delta_change, ' kcal') : 'par jour complet';

  const deficitRate = balance.deficit_rate;
  document.getElementById('s-deficit-rate').textContent = pctLabel(deficitRate);
  document.getElementById('s-deficit-rate').className =
    'insight-value ' + (deficitRate >= 70 ? 'deficit' : 'neutral');
  document.getElementById('s-deficit-sub').textContent =
    `${balance.deficit_days || 0}/${period.complete_days || 0} jours`;

  document.getElementById('s-avg-steps').textContent =
    activity.avg_steps != null ? fmt(activity.avg_steps) : '—';
  document.getElementById('s-steps-trend').textContent =
    trendText(trend.avg_steps_change, ' pas');

  document.getElementById('s-distance').textContent =
    activity.total_distance_km != null ? fmtKm(activity.total_distance_km) : '—';
  document.getElementById('s-distance-sub').textContent =
    activity.avg_distance_km != null ? `${fmtKm(activity.avg_distance_km)} km / jour` : 'km au total';

  renderCalorieTotal('s-total-week', 's-total-week-sub', calorieTotals.week);
  renderCalorieTotal('s-total-month', 's-total-month-sub', calorieTotals.month, true);
  renderCalorieTotal('s-total-start', 's-total-start-sub', calorieTotals.since_start, true);

  const targetRate = balance.target_rate;
  document.getElementById('s-target-rate').textContent = pctLabel(targetRate);
  document.getElementById('s-target-rate').className =
    'insight-value ' + (targetRate >= 50 ? 'deficit' : 'neutral');
  document.getElementById('s-target-sub').textContent =
    `${balance.target_days || 0} jours à −${DEFICIT_GOAL} kcal ou mieux`;

  document.getElementById('s-active').textContent =
    activity.avg_active != null ? fmt(activity.avg_active) : '—';

  const recentDays = (stats.days || []).filter(d => d.complete_data && d.date !== isoDate(today)).slice(-14);
  const maxAbs = Math.max(...recentDays.map(d => Math.abs(d.delta || 0)), 1);
  document.getElementById('s-bars').innerHTML = recentDays.length > 0
    ? recentDays.map(d => {
        const height = Math.max(Math.abs(d.delta || 0) / maxAbs * 100, 4);
        const bg = d.delta <= 0 ? 'var(--green)' : 'var(--red)';
        return `
          <div class="stats-mini-col" onclick="goToDay('${d.date}')">
            <div class="stats-mini-fill" style="height:${height}%;background:${bg}"></div>
            <div class="stats-mini-label">${new Date(d.date + 'T00:00:00').getDate()}</div>
          </div>`;
      }).join('')
    : '<div class="error-card">Pas assez de données</div>';

  document.getElementById('s-records').innerHTML = [
    recordRow('Meilleur déficit', records.best_deficit, records.best_deficit ? deltaLabel(records.best_deficit.delta) : '—', 'deficit'),
    recordRow('Plus gros surplus', records.biggest_surplus, records.biggest_surplus ? deltaLabel(records.biggest_surplus.delta) : '—', 'surplus'),
    recordRow('Plus de pas', records.most_steps, records.most_steps ? `${fmt(records.most_steps.steps)} pas` : '—'),
    recordRow('Plus longue distance', records.longest_distance, records.longest_distance ? `${fmtKm(records.longest_distance.distance_km)} km` : '—'),
    recordRow('Plus actif', records.most_active, records.most_active ? `${fmt(records.most_active.burned_active)} kcal` : '—')
  ].join('');
}

/* ══════════════════════════════════════════════════
   THEME TOGGLE
══════════════════════════════════════════════════ */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.getElementById('theme-toggle').textContent = theme === 'light' ? '🌙' : '☀️';
  localStorage.setItem('caltrack-theme', theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

/* ══════════════════════════════════════════════════
   HARD REFRESH
══════════════════════════════════════════════════ */
async function hardRefresh() {
  const btn = document.getElementById('refresh-btn');
  btn.classList.add('spinning');
  try {
    await fetch('/api/refresh', { method: 'POST' });
  } catch {}
  if (currentView === 'day')   await loadDay();
  if (currentView === 'week')  await loadWeek();
  if (currentView === 'month') await loadMonth();
  if (currentView === 'stats') await loadStats();
  btn.classList.remove('spinning');
  // Précharger les autres vues en arrière-plan pour navigation instantanée
  if (currentView !== 'day')   loadDay().catch(() => {});
  if (currentView !== 'week')  loadWeek().catch(() => {});
  if (currentView !== 'month') loadMonth().catch(() => {});
  if (currentView !== 'stats') loadStats().catch(() => {});
}

/* ══════════════════════════════════════════════════
   SERVICE WORKER REGISTRATION
══════════════════════════════════════════════════ */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/static/sw.js')
    .then(() => console.log('SW registered'))
    .catch(e => console.warn('SW error', e));

  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}

/* ══════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('caltrack-theme') || 'dark';
  applyTheme(savedTheme);
  loadDay();
});
