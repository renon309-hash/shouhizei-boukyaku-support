// ===== Storage =====
const STORAGE_KEY = 'shouhizei_theories';
const SETTINGS_KEY = 'shouhizei_settings';
const REVIEWS_KEY = 'shouhizei_reviews';

function loadTheories() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) return JSON.parse(raw);
  return initTheories();
}

function saveTheories(theories) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(theories));
}

function loadSettings() {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (raw) return JSON.parse(raw);
  return { examDate: '2026-08-04', preExamMode: false, targetA: 3, targetB: 2, targetC: 1 };
}

function saveSettings(s) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

function loadReviews() {
  const raw = localStorage.getItem(REVIEWS_KEY);
  if (raw) return JSON.parse(raw);
  return [];
}

function saveReviews(r) {
  localStorage.setItem(REVIEWS_KEY, JSON.stringify(r));
}

// ===== Init =====
function initTheories() {
  const today = toDateStr(new Date());
  const theories = INITIAL_THEORIES.map(t => ({
    ...t,
    last_reviewed_at: null,
    next_review_at: today,
    interval_days: 0,
    stage: 0,
    review_count: 0,
    last_grade_memorize: null,
    last_grade_write: null,
    tags: [],
    memo: ''
  }));
  saveTheories(theories);
  return theories;
}

// ===== Date Helpers =====
function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function daysBetween(a, b) {
  const da = typeof a === 'string' ? parseDate(a) : a;
  const db = typeof b === 'string' ? parseDate(b) : b;
  return Math.round((db - da) / 86400000);
}

function addDays(dateStr, days) {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

function formatDate(dateStr) {
  if (!dateStr) return '−';
  const [y, m, d] = dateStr.split('-');
  return `${Number(m)}/${Number(d)}`;
}

function formatDateFull(dateStr) {
  if (!dateStr) return '−';
  const [y, m, d] = dateStr.split('-');
  return `${y}/${Number(m)}/${Number(d)}`;
}

// ===== Importance =====
function getEffectiveImportance(theory) {
  if (theory.importance === '★★') return '★★';
  if (theory.importance === '★') return '★';
  if (!theory.sub_sections || theory.sub_sections.length === 0) return 'none';
  const hasDoublestar = theory.sub_sections.some(s => s.importance === '★★');
  if (hasDoublestar) return '★★';
  const hasStar = theory.sub_sections.some(s => s.importance === '★');
  if (hasStar) return '★';
  return 'none';
}

function importanceToBadge(imp) {
  if (imp === '★★') return '<span class="importance-badge importance-a">★★</span>';
  if (imp === '★') return '<span class="importance-badge importance-b">★</span>';
  return '<span class="importance-badge importance-c">−</span>';
}

// ===== Status =====
function getStatus(theory) {
  const today = toDateStr(new Date());
  if (!theory.next_review_at) return 'new';
  if (!theory.last_reviewed_at && theory.next_review_at <= today) return 'new';
  const diff = daysBetween(today, theory.next_review_at);
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  return 'safe';
}

function statusLabel(status) {
  const map = {
    overdue: '<span class="status-label overdue">期限超過</span>',
    today: '<span class="status-label today-due">今日</span>',
    tomorrow: '<span class="status-label tomorrow">明日</span>',
    safe: '<span class="status-label safe">予定内</span>',
    new: '<span class="status-label new-item">未学習</span>'
  };
  return map[status] || '';
}

// ===== Danger Score =====
function calcDangerScore(theory) {
  const today = toDateStr(new Date());
  const status = getStatus(theory);
  let score = 0;

  if (status === 'overdue') {
    const overdueDays = daysBetween(theory.next_review_at, today);
    score += overdueDays * 2;
  } else if (status === 'today' || status === 'new') {
    score += 1;
  }

  if (theory.last_grade_memorize === 'shaky') score += 3;
  if (theory.last_grade_memorize === 'forgot') score += 6;
  if (theory.last_grade_write === 'stuck') score += 4;
  if (theory.last_grade_write === 'no') score += 8;

  const imp = getEffectiveImportance(theory);
  if (imp === '★★') score *= 1.3;
  else if (imp === '★') score *= 1.1;

  return Math.round(score * 10) / 10;
}

// ===== Review Logic =====
const BASE_INTERVALS = [1, 3, 7, 14, 30, 60];
const GRADE_MULTIPLIERS = { perfect: 2.0, ok: 1.5, shaky: 0.7, forgot: 0 };
const WRITE_PENALTY = { ok: 1.0, stuck: 0.8, no: 0.5 };

function calcNextReview(theory, gradeMemorize, gradeWrite) {
  const settings = loadSettings();
  let nextInterval;

  if (gradeMemorize === 'forgot') {
    nextInterval = 1;
  } else {
    if (theory.stage < BASE_INTERVALS.length) {
      nextInterval = BASE_INTERVALS[theory.stage];
    } else {
      nextInterval = theory.interval_days * GRADE_MULTIPLIERS[gradeMemorize];
    }
    nextInterval *= GRADE_MULTIPLIERS[gradeMemorize] || 1;
    if (gradeWrite) nextInterval *= WRITE_PENALTY[gradeWrite] || 1;
  }

  const imp = getEffectiveImportance(theory);
  if (imp === '★★') nextInterval *= 0.9;
  else if (imp === 'none') nextInterval *= 1.1;

  if (settings.preExamMode) {
    const maxMap = { '★★': 7, '★': 14, 'none': 30 };
    const maxInterval = maxMap[imp] || 30;
    nextInterval = Math.min(nextInterval, maxInterval);
  }

  nextInterval = Math.max(1, Math.ceil(nextInterval));
  const today = toDateStr(new Date());
  return { interval: nextInterval, nextDate: addDays(today, nextInterval) };
}

// ===== Rendering =====
let theories = loadTheories();
let reviews = loadReviews();
let settings = loadSettings();

function renderAll() {
  theories = loadTheories();
  reviews = loadReviews();
  settings = loadSettings();
  renderExamCountdown();
  renderTodayTab();
  renderDangerTab();
  renderAllTab();
  renderStatsTab();
  renderSettings();
  populateChapterFilters();
}

function renderExamCountdown() {
  const el = document.getElementById('examCountdown');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exam = parseDate(settings.examDate);
  const days = daysBetween(today, exam);
  if (days > 0) {
    el.innerHTML = `試験日まで <span class="days-number">${days}</span> 日`;
  } else if (days === 0) {
    el.innerHTML = `<span class="days-number" style="color:var(--danger)">本日試験!</span>`;
  } else {
    el.innerHTML = `試験日は過ぎました`;
  }
}

function renderTodayTab() {
  const today = toDateStr(new Date());
  const tomorrow = addDays(today, 1);

  const overdue = theories.filter(t => getStatus(t) === 'overdue');
  const todayDue = theories.filter(t => getStatus(t) === 'today');
  const newItems = theories.filter(t => getStatus(t) === 'new');
  const tomorrowDue = theories.filter(t => getStatus(t) === 'tomorrow');

  const summaryEl = document.getElementById('todaySummary');
  summaryEl.innerHTML = `
    <span class="summary-badge overdue">期限超過 ${overdue.length}</span>
    <span class="summary-badge today-due">今日 ${todayDue.length}</span>
    <span class="summary-badge upcoming">未学習 ${newItems.length}</span>
  `;

  const todoItems = [...overdue, ...todayDue, ...newItems, ...tomorrowDue];
  todoItems.sort((a, b) => calcDangerScore(b) - calcDangerScore(a));

  const filtered = applyFilters(todoItems, 'filterImportance', 'filterChapter');
  const listEl = document.getElementById('todayList');
  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="empty-state"><div class="empty-emoji">&#127881;</div><div class="empty-text">今日やるべき理論はありません！</div></div>`;
    return;
  }
  listEl.innerHTML = filtered.map(t => renderTheoryCard(t, true)).join('');
}

function renderDangerTab() {
  const scored = theories.map(t => ({ ...t, dangerScore: calcDangerScore(t) }))
    .filter(t => t.dangerScore > 0)
    .sort((a, b) => b.dangerScore - a.dangerScore)
    .slice(0, 30);

  const listEl = document.getElementById('dangerList');
  if (scored.length === 0) {
    listEl.innerHTML = `<div class="empty-state"><div class="empty-emoji">&#128170;</div><div class="empty-text">危険な理論はありません！</div></div>`;
    return;
  }
  listEl.innerHTML = scored.map(t => renderTheoryCard(t, false, t.dangerScore)).join('');
}

function renderAllTab() {
  let filtered = [...theories];
  const search = document.getElementById('searchInput')?.value?.toLowerCase() || '';
  if (search) {
    filtered = filtered.filter(t =>
      t.title.toLowerCase().includes(search) ||
      t.problem_id.includes(search) ||
      t.chapter_title.includes(search) ||
      (t.sub_sections || []).some(s => s.title.toLowerCase().includes(search))
    );
  }
  filtered = applyFilters(filtered, null, 'allFilterChapter');

  const statusFilter = document.getElementById('allFilterStatus')?.value || 'all';
  if (statusFilter !== 'all') {
    filtered = filtered.filter(t => getStatus(t) === statusFilter);
  }

  const listEl = document.getElementById('allList');
  listEl.innerHTML = filtered.map(t => renderTheoryCard(t, true)).join('');
}

function renderStatsTab() {
  const el = document.getElementById('statsContent');
  const today = toDateStr(new Date());
  const exam = parseDate(settings.examDate);
  const daysLeft = daysBetween(new Date(), exam);

  const overdue = theories.filter(t => getStatus(t) === 'overdue').length;
  const reviewed = theories.filter(t => t.review_count > 0).length;
  const totalReviews = reviews.length;
  const avgStage = theories.reduce((s, t) => s + t.stage, 0) / theories.length;

  const impA = theories.filter(t => getEffectiveImportance(t) === '★★');
  const impB = theories.filter(t => getEffectiveImportance(t) === '★');
  const impC = theories.filter(t => getEffectiveImportance(t) === 'none');

  const targetA = settings.targetA || 3;
  const targetB = settings.targetB || 2;
  const targetC = settings.targetC || 1;

  const metA = impA.filter(t => t.review_count >= targetA).length;
  const metB = impB.filter(t => t.review_count >= targetB).length;
  const metC = impC.filter(t => t.review_count >= targetC).length;

  const pctA = impA.length ? Math.round(metA / impA.length * 100) : 0;
  const pctB = impB.length ? Math.round(metB / impB.length * 100) : 0;
  const pctC = impC.length ? Math.round(metC / impC.length * 100) : 0;

  const todayReviews = reviews.filter(r => r.reviewed_at === today).length;

  const chapters = [...new Set(theories.map(t => t.chapter))];
  const chapterStats = chapters.map(ch => {
    const items = theories.filter(t => t.chapter === ch);
    const reviewedCount = items.filter(t => t.review_count > 0).length;
    return { chapter: ch, title: items[0].chapter_title, total: items.length, reviewed: reviewedCount };
  });

  el.innerHTML = `
    <div class="stats-card"><div class="stats-number" style="color:var(--danger)">${overdue}</div><div class="stats-label">期限超過</div></div>
    <div class="stats-card"><div class="stats-number" style="color:var(--success)">${reviewed}/${theories.length}</div><div class="stats-label">学習済み</div></div>
    <div class="stats-card"><div class="stats-number" style="color:var(--info)">${todayReviews}</div><div class="stats-label">今日の復習数</div></div>
    <div class="stats-card"><div class="stats-number" style="color:var(--accent-light)">${totalReviews}</div><div class="stats-label">累計復習回数</div></div>
    <div class="stats-card full-width">
      <h4 style="font-size:0.85rem;color:var(--text-muted);margin-bottom:12px">回転数達成率（試験まで残り${daysLeft > 0 ? daysLeft : 0}日）</h4>
      <div class="rotation-progress">
        <div class="rotation-bar">
          <span class="bar-label">★★ (${impA.length}題)</span>
          <div class="bar-track"><div class="bar-fill ${pctA < 50 ? 'fill-danger' : pctA < 80 ? 'fill-warning' : 'fill-success'}" style="width:${pctA}%"></div></div>
          <span class="bar-value">${metA}/${impA.length}</span>
        </div>
        <div class="rotation-bar">
          <span class="bar-label">★ (${impB.length}題)</span>
          <div class="bar-track"><div class="bar-fill ${pctB < 50 ? 'fill-danger' : pctB < 80 ? 'fill-warning' : 'fill-success'}" style="width:${pctB}%"></div></div>
          <span class="bar-value">${metB}/${impB.length}</span>
        </div>
        <div class="rotation-bar">
          <span class="bar-label">− (${impC.length}題)</span>
          <div class="bar-track"><div class="bar-fill ${pctC < 50 ? 'fill-danger' : pctC < 80 ? 'fill-warning' : 'fill-success'}" style="width:${pctC}%"></div></div>
          <span class="bar-value">${metC}/${impC.length}</span>
        </div>
      </div>
    </div>
    <div class="stats-card full-width">
      <h4 style="font-size:0.85rem;color:var(--text-muted);margin-bottom:12px">章別進捗</h4>
      <div class="chapter-progress">
        ${chapterStats.map(cs => `
          <div class="chapter-row">
            <span class="chapter-name">${cs.chapter}. ${cs.title}</span>
            <div class="chapter-bar"><div class="chapter-bar-fill" style="width:${cs.total ? cs.reviewed / cs.total * 100 : 0}%"></div></div>
            <span class="chapter-count">${cs.reviewed}/${cs.total}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderSettings() {
  document.getElementById('examDate').value = settings.examDate;
  document.getElementById('preExamMode').checked = settings.preExamMode;
  document.getElementById('targetA').value = settings.targetA || 3;
  document.getElementById('targetB').value = settings.targetB || 2;
  document.getElementById('targetC').value = settings.targetC || 1;
  updateToggleText();
}

function updateToggleText() {
  const cb = document.getElementById('preExamMode');
  const label = cb.parentElement.querySelector('.toggle-text');
  label.textContent = cb.checked ? '直前期モード ON' : 'OFF';
}

function populateChapterFilters() {
  const chapters = [...new Set(theories.map(t => t.chapter))];
  const options = '<option value="all">全章</option>' +
    chapters.map(ch => {
      const t = theories.find(x => x.chapter === ch);
      return `<option value="${ch}">${ch}. ${t.chapter_title}</option>`;
    }).join('');
  const fc = document.getElementById('filterChapter');
  const ac = document.getElementById('allFilterChapter');
  if (fc) fc.innerHTML = options;
  if (ac) ac.innerHTML = options;
}

function applyFilters(items, impFilterId, chFilterId) {
  let result = items;
  if (impFilterId) {
    const impVal = document.getElementById(impFilterId)?.value || 'all';
    if (impVal !== 'all') {
      if (impVal === 'none') {
        result = result.filter(t => getEffectiveImportance(t) === 'none');
      } else {
        result = result.filter(t => getEffectiveImportance(t) === impVal);
      }
    }
  }
  if (chFilterId) {
    const chVal = document.getElementById(chFilterId)?.value || 'all';
    if (chVal !== 'all') {
      result = result.filter(t => String(t.chapter) === chVal);
    }
  }
  return result;
}

function renderTheoryCard(theory, showActions = true, dangerScore = null) {
  const status = getStatus(theory);
  const imp = getEffectiveImportance(theory);
  const today = toDateStr(new Date());

  let overdueDays = '';
  if (status === 'overdue') {
    const d = daysBetween(theory.next_review_at, today);
    overdueDays = `（${d}日超過）`;
  }

  const gradeText = theory.last_grade_memorize ? gradeLabel(theory.last_grade_memorize) : '−';
  const writeText = theory.last_grade_write ? writeGradeLabel(theory.last_grade_write) : '−';

  return `
    <div class="theory-card status-${status}" data-id="${theory.problem_id}">
      ${dangerScore !== null ? `<div class="danger-score">${dangerScore}</div>` : ''}
      <div class="card-top">
        <span class="problem-id">${theory.problem_id}</span>
        <span class="card-title">${theory.title}</span>
        ${importanceToBadge(imp)}
      </div>
      <div class="card-meta">
        ${statusLabel(status)}
        <span>${overdueDays}</span>
        <span>次回: ${formatDate(theory.next_review_at)}</span>
        <span>復習: ${theory.review_count}回</span>
        <span>暗記: ${gradeText}</span>
        <span>筆記: ${writeText}</span>
      </div>
      ${showActions ? `
        <div class="card-actions">
          <button class="btn btn-review" onclick="openReviewModal('${theory.problem_id}')">復習する</button>
          <button class="btn btn-detail" onclick="openDetailModal('${theory.problem_id}')">詳細</button>
        </div>
      ` : `
        <div class="card-actions">
          <button class="btn btn-review" onclick="openReviewModal('${theory.problem_id}')" style="flex:none;padding:6px 14px;font-size:0.78rem">復習</button>
          <button class="btn btn-detail" onclick="openDetailModal('${theory.problem_id}')" style="flex:none;padding:6px 14px;font-size:0.78rem">詳細</button>
        </div>
      `}
    </div>
  `;
}

function gradeLabel(g) {
  const map = { perfect: '完璧', ok: 'OK', shaky: '怪しい', forgot: '忘れた' };
  return map[g] || g;
}

function writeGradeLabel(g) {
  const map = { ok: '書けた', stuck: '詰まった', no: '無理' };
  return map[g] || g;
}

function gradeClass(g) {
  const map = { perfect: 'grade-perfect', ok: 'grade-ok', shaky: 'grade-shaky', forgot: 'grade-forgot' };
  return map[g] || '';
}

// ===== Detail Modal =====
function openDetailModal(problemId) {
  const theory = theories.find(t => t.problem_id === problemId);
  if (!theory) return;

  const imp = getEffectiveImportance(theory);
  const status = getStatus(theory);
  const theoryReviews = reviews.filter(r => r.theory_id === problemId).sort((a, b) => b.reviewed_at.localeCompare(a.reviewed_at));

  const targetMap = { '★★': settings.targetA || 3, '★': settings.targetB || 2, 'none': settings.targetC || 1 };
  const target = targetMap[imp] || 1;
  const rotationOk = theory.review_count >= target;

  let html = `
    <div class="detail-header">
      <span class="problem-id">${theory.problem_id}</span>
      ${importanceToBadge(imp)}
      ${statusLabel(status)}
      <h3>${theory.title}</h3>
      <div style="font-size:0.78rem;color:var(--text-muted);margin-top:4px">${theory.chapter}. ${theory.chapter_title}</div>
    </div>
    <div class="detail-stats">
      <div class="stat-item"><div class="stat-label">復習回数</div><div class="stat-value">${theory.review_count} / ${target}回</div></div>
      <div class="stat-item"><div class="stat-label">復習間隔</div><div class="stat-value">${theory.interval_days}日</div></div>
      <div class="stat-item"><div class="stat-label">最終復習</div><div class="stat-value">${formatDateFull(theory.last_reviewed_at)}</div></div>
      <div class="stat-item"><div class="stat-label">次回復習</div><div class="stat-value">${formatDateFull(theory.next_review_at)}</div></div>
      <div class="stat-item"><div class="stat-label">暗記評価</div><div class="stat-value"><span class="grade-badge ${gradeClass(theory.last_grade_memorize)}">${theory.last_grade_memorize ? gradeLabel(theory.last_grade_memorize) : '−'}</span></div></div>
      <div class="stat-item"><div class="stat-label">筆記評価</div><div class="stat-value">${theory.last_grade_write ? writeGradeLabel(theory.last_grade_write) : '−'}</div></div>
    </div>
  `;

  if (theory.sub_sections && theory.sub_sections.length > 0) {
    html += `<div class="sub-sections-list"><h4>構成</h4>`;
    theory.sub_sections.forEach(s => {
      html += `<div class="sub-section-item"><span class="sub-id">${s.id}</span><span>${s.title}</span>${importanceToBadge(s.importance)}</div>`;
    });
    html += `</div>`;
  }

  if (theoryReviews.length > 0) {
    html += `<div class="review-history"><h4>復習履歴（直近10件）</h4>`;
    theoryReviews.slice(0, 10).forEach(r => {
      html += `<div class="history-item"><span class="history-date">${formatDateFull(r.reviewed_at)}</span><span class="grade-badge ${gradeClass(r.grade_memorize)}">${gradeLabel(r.grade_memorize)}</span><span>${r.grade_write ? writeGradeLabel(r.grade_write) : '−'}</span></div>`;
    });
    html += `</div>`;
  }

  html += `<div style="margin-top:16px"><button class="btn btn-review" style="width:100%" onclick="closeModal('theoryModal');openReviewModal('${theory.problem_id}')">復習する</button></div>`;

  document.getElementById('modalBody').innerHTML = html;
  document.getElementById('theoryModal').classList.add('show');
}

// ===== Review Modal =====
let reviewState = { problemId: null, memorize: null, write: null };

function openReviewModal(problemId) {
  const theory = theories.find(t => t.problem_id === problemId);
  if (!theory) return;

  reviewState = { problemId, memorize: null, write: null };

  const html = `
    <h3>${theory.problem_id} ${theory.title}</h3>
    <p class="review-subtitle">${theory.chapter}. ${theory.chapter_title}</p>

    <div class="review-section">
      <h4>覚えてる？</h4>
      <div class="grade-buttons" id="memorizeButtons">
        <button class="grade-btn g-perfect" onclick="selectGrade('memorize','perfect',this)">
          <span class="grade-emoji">&#128175;</span>
          <span class="grade-name">完璧</span>
          <span class="grade-desc">一字一句OK</span>
        </button>
        <button class="grade-btn g-ok" onclick="selectGrade('memorize','ok',this)">
          <span class="grade-emoji">&#128077;</span>
          <span class="grade-name">OK</span>
          <span class="grade-desc">概ね覚えてる</span>
        </button>
        <button class="grade-btn g-shaky" onclick="selectGrade('memorize','shaky',this)">
          <span class="grade-emoji">&#128528;</span>
          <span class="grade-name">怪しい</span>
          <span class="grade-desc">部分的に抜け</span>
        </button>
        <button class="grade-btn g-forgot" onclick="selectGrade('memorize','forgot',this)">
          <span class="grade-emoji">&#128561;</span>
          <span class="grade-name">忘れた</span>
          <span class="grade-desc">ほぼ出てこない</span>
        </button>
      </div>
    </div>

    <div class="review-section">
      <h4>書ける？</h4>
      <div class="grade-buttons" id="writeButtons">
        <button class="grade-btn g-write-ok" onclick="selectGrade('write','ok',this)">
          <span class="grade-emoji">&#9997;&#65039;</span>
          <span class="grade-name">書けた</span>
          <span class="grade-desc">時間内に書き切れる</span>
        </button>
        <button class="grade-btn g-write-stuck" onclick="selectGrade('write','stuck',this)">
          <span class="grade-emoji">&#128531;</span>
          <span class="grade-name">詰まった</span>
          <span class="grade-desc">途中で止まった</span>
        </button>
        <button class="grade-btn g-write-no" onclick="selectGrade('write','no',this)">
          <span class="grade-emoji">&#10060;</span>
          <span class="grade-name">無理</span>
          <span class="grade-desc">書き出せない</span>
        </button>
      </div>
    </div>

    <div class="next-review-preview" id="nextReviewPreview"></div>
    <button class="review-submit" id="reviewSubmit" disabled onclick="submitReview()">復習を記録する</button>
  `;

  document.getElementById('reviewModalBody').innerHTML = html;
  document.getElementById('reviewModal').classList.add('show');
}

function selectGrade(type, grade, btn) {
  reviewState[type] = grade;

  const containerId = type === 'memorize' ? 'memorizeButtons' : 'writeButtons';
  document.querySelectorAll(`#${containerId} .grade-btn`).forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');

  const submitBtn = document.getElementById('reviewSubmit');
  submitBtn.disabled = !reviewState.memorize;

  if (reviewState.memorize) {
    const theory = theories.find(t => t.problem_id === reviewState.problemId);
    const result = calcNextReview(theory, reviewState.memorize, reviewState.write);
    document.getElementById('nextReviewPreview').textContent =
      `次回復習: ${formatDateFull(result.nextDate)}（${result.interval}日後）`;
  }
}

function submitReview() {
  const { problemId, memorize, write } = reviewState;
  if (!memorize) return;

  const idx = theories.findIndex(t => t.problem_id === problemId);
  if (idx === -1) return;

  const theory = theories[idx];
  const result = calcNextReview(theory, memorize, write);
  const today = toDateStr(new Date());

  theory.last_reviewed_at = today;
  theory.next_review_at = result.nextDate;
  theory.interval_days = result.interval;
  theory.stage = memorize === 'forgot' ? 0 : theory.stage + 1;
  theory.review_count += 1;
  theory.last_grade_memorize = memorize;
  theory.last_grade_write = write;

  theories[idx] = theory;
  saveTheories(theories);

  reviews.push({
    theory_id: problemId,
    reviewed_at: today,
    grade_memorize: memorize,
    grade_write: write
  });
  saveReviews(reviews);

  closeModal('reviewModal');
  renderAll();
}

// ===== Modal Control =====
function closeModal(id) {
  document.getElementById(id).classList.remove('show');
}

// ===== Tab Navigation =====
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});

// ===== Event Listeners =====
document.getElementById('modalClose').addEventListener('click', () => closeModal('theoryModal'));
document.getElementById('reviewModalClose').addEventListener('click', () => closeModal('reviewModal'));

document.getElementById('theoryModal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeModal('theoryModal');
});
document.getElementById('reviewModal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeModal('reviewModal');
});

document.getElementById('examDate').addEventListener('change', (e) => {
  settings.examDate = e.target.value;
  saveSettings(settings);
  renderAll();
});

document.getElementById('preExamMode').addEventListener('change', (e) => {
  settings.preExamMode = e.target.checked;
  saveSettings(settings);
  updateToggleText();
  renderAll();
});

['targetA', 'targetB', 'targetC'].forEach(id => {
  document.getElementById(id).addEventListener('change', (e) => {
    settings[id] = parseInt(e.target.value) || 1;
    saveSettings(settings);
    renderAll();
  });
});

document.getElementById('filterImportance').addEventListener('change', renderTodayTab);
document.getElementById('filterChapter').addEventListener('change', renderTodayTab);
document.getElementById('allFilterChapter').addEventListener('change', renderAllTab);
document.getElementById('allFilterStatus').addEventListener('change', renderAllTab);
document.getElementById('searchInput').addEventListener('input', renderAllTab);

document.getElementById('exportBtn').addEventListener('click', () => {
  const data = {
    theories: loadTheories(),
    reviews: loadReviews(),
    settings: loadSettings(),
    exportedAt: new Date().toISOString()
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `shouhizei_backup_${toDateStr(new Date())}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('importBtn').addEventListener('click', () => {
  document.getElementById('importFile').click();
});

document.getElementById('importFile').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      if (data.theories) saveTheories(data.theories);
      if (data.reviews) saveReviews(data.reviews);
      if (data.settings) saveSettings(data.settings);
      renderAll();
      alert('インポートが完了しました');
    } catch {
      alert('ファイルの読み込みに失敗しました');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

document.getElementById('resetBtn').addEventListener('click', () => {
  if (confirm('全データをリセットしますか？この操作は取り消せません。')) {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(REVIEWS_KEY);
    renderAll();
    alert('リセットしました');
  }
});

// ===== Keyboard shortcut =====
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeModal('theoryModal');
    closeModal('reviewModal');
  }
});

// ===== Init =====
renderAll();
