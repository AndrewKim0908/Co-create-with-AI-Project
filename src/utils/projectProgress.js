/**
 * Parse YYYY-MM-DD as local calendar date (avoids UTC off-by-one).
 * @param {string} isoDate
 * @returns {Date}
 */
function parseLocalDate(isoDate) {
  const s = String(isoDate || '').slice(0, 10);
  const d = new Date(`${s}T12:00:00`);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * 날짜 기반 프로젝트 진행률 계산
 * @param {string|null|undefined} startDate - 시작일 (YYYY-MM-DD)
 * @param {string|null|undefined} dueDate - 마감일 (YYYY-MM-DD)
 * @returns {number} 0-100 사이의 진행률
 */
export function calculateDateProgress(startDate, dueDate) {
  if (!startDate || !dueDate) {
    return 0;
  }

  const start = parseLocalDate(startDate);
  const due = parseLocalDate(dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (today < start) {
    return 0;
  }

  if (today > due) {
    return 100;
  }

  const totalMs = due.getTime() - start.getTime();
  const elapsedMs = today.getTime() - start.getTime();
  const dayMs = 1000 * 60 * 60 * 24;
  const totalDays = totalMs / dayMs;
  const elapsedDays = elapsedMs / dayMs;

  if (totalDays <= 0) {
    return 100;
  }

  const progress = Math.round((elapsedDays / totalDays) * 100);
  return Math.max(0, Math.min(100, progress));
}

/**
 * @typedef {{ progress: number, variant: 'muted'|'normal'|'warning'|'overdue', labelKey: string, days: number|null }} ProgressTimelineMeta
 */

/**
 * 날짜 기반 진행률 및 상태 (허브/워크스페이스 라벨용)
 * @returns {ProgressTimelineMeta}
 */
export function getProgressTimelineMeta(startDate, dueDate) {
  const progress = calculateDateProgress(startDate, dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (!dueDate) {
    return { progress, variant: 'muted', labelKey: 'noDeadline', days: null };
  }

  const due = parseLocalDate(dueDate);
  const daysLeft = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (daysLeft < 0) {
    return { progress, variant: 'overdue', labelKey: 'overdue', days: Math.abs(daysLeft) };
  }
  if (daysLeft === 0) {
    return { progress, variant: 'warning', labelKey: 'dueToday', days: 0 };
  }
  if (daysLeft <= 7) {
    return { progress, variant: 'warning', labelKey: 'daysLeft', days: daysLeft };
  }
  return { progress, variant: 'normal', labelKey: 'daysLeft', days: daysLeft };
}

/**
 * @param {(key: string) => string} t
 * @param {ProgressTimelineMeta} meta
 */
export function formatTimelineStatusLabel(t, meta) {
  if (!meta) return '';
  if (meta.labelKey === 'noDeadline') return t('noDeadline');
  if (meta.labelKey === 'dueToday') return t('dueToday');
  if (meta.labelKey === 'overdue') {
    return String(t('progressDaysOverdue')).replace(/\{\{days\}\}/g, String(meta.days ?? ''));
  }
  if (meta.labelKey === 'daysLeft') {
    return String(t('progressDaysLeft')).replace(/\{\{days\}\}/g, String(meta.days ?? ''));
  }
  return '';
}

/**
 * @param {string|null|undefined} isoDate
 * @param {string} lang
 */
export function formatProjectDate(isoDate, lang) {
  if (!isoDate) return '';
  const d = parseLocalDate(isoDate);
  const locale = lang === 'ko' ? 'ko-KR' : lang === 'zh' ? 'zh-CN' : 'en-US';
  return d.toLocaleDateString(locale, { dateStyle: 'medium' });
}

/** Both dates must be set and due must be >= start (same day OK). */
export function isDueDateBeforeStart(startDate, dueDate) {
  const s = String(startDate || '').trim();
  const d = String(dueDate || '').trim();
  if (!s || !d) return false;
  return parseLocalDate(d) < parseLocalDate(s);
}
