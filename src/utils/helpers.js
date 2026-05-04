const USER_COLOR_PALETTE = [
  '#10B981',
  '#3A6EA5',
  '#8B5CF6',
  '#F59E0B',
  '#EF4444',
  '#14B8A6',
  '#EC4899',
  '#6366F1',
  '#22C55E',
  '#0EA5E9',
];

export function getUserColor(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return '#64748B';
  let hash = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = ((hash << 5) - hash) + normalized.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % USER_COLOR_PALETTE.length;
  return USER_COLOR_PALETTE[idx];
}

export function isEditableKeyboardTarget(target) {
  if (!target || typeof target !== 'object') return false;
  const t = target.tagName;
  if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

/**
 * Supabase public object URL → `{ bucket, path }` for Storage API `.remove([path])`.
 * Supports any bucket segment (e.g. design-bucket, designs).
 */
export function extractStorageObjectFromPublicUrl(url) {
  if (!url || typeof url !== 'string') return { bucket: '', path: '' };
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\/object\/public\/([^/]+)\/(.+)$/);
    if (m) {
      return {
        bucket: m[1] || '',
        path: decodeURIComponent(m[2] || ''),
      };
    }
  } catch {
    /* noop */
  }
  return { bucket: '', path: '' };
}

export function extractStoragePathFromPublicUrl(url) {
  return extractStorageObjectFromPublicUrl(url).path;
}

export function mapDesignFileRow(row) {
  const imageUrl = row?.file_url || row?.url || '';
  return {
    id: row?.id || null,
    url: imageUrl,
    storagePath: extractStoragePathFromPublicUrl(imageUrl),
  };
}

export function pickLinkedMemberUid(row) {
  if (!row || typeof row !== 'object') return null;
  return (
    row.user_id ||
    row.member_user_id ||
    row.member_id ||
    row.accepted_user_id ||
    row.invited_user_id ||
    null
  );
}

export function emailLocalPart(email) {
  const e = String(email || '').trim();
  const at = e.indexOf('@');
  return at > 0 ? e.slice(0, at) : e;
}

/**
 * Canonical map-key for participant UUIDs: trim + lowercase.
 * Needed because auth returns mixed-case UUID strings while DB `user_id` / `profiles.id`
 * may appear in different casing; comparing or indexing `voteMap` without this yields misses.
 */
export function normalizeParticipantUserId(id) {
  if (id == null || id === '') return null;
  const s = String(id).trim().toLowerCase();
  return s.length ? s : null;
}

/**
 * Member list label: prefer signup full_name (auth user_metadata for the current user;
 * for others, public.profiles.full_name when the project mirrors auth — common Supabase pattern).
 * Otherwise email local-part before @.
 */
export function participantVoteDisplayName({
  userId,
  email,
  authSelfId,
  authSelfFullName,
  profileFullNameById,
}) {
  const uidNorm = normalizeParticipantUserId(userId);
  const local = emailLocalPart(email);
  if (!uidNorm) {
    return local || String(email || '').trim() || '—';
  }
  const selfNorm = normalizeParticipantUserId(authSelfId);
  const isSelf = selfNorm !== null && uidNorm === selfNorm;
  const selfNm = String(authSelfFullName || '').trim();
  const prof = String(profileFullNameById[uidNorm] || '').trim();
  if (isSelf && selfNm) return selfNm;
  if (prof) return prof;
  if (local) return local;
  return `${uidNorm.slice(0, 8)}…`;
}

/**
 * Validates and normalizes sprint index for `sprint_votes` queries and row filtering.
 * Returns null for missing/empty values (so we never treat null as 0) and rejects non-finite
 * or < 1 numbers — only positive integer sprint keys are used.
 */
export function resolveSprintVotesSprintNumber(sprintNumberRaw) {
  if (sprintNumberRaw === null || sprintNumberRaw === undefined || sprintNumberRaw === '') {
    return null;
  }
  const n = Math.trunc(Number(sprintNumberRaw));
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
}
