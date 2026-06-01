// User colors are now centralized in src/utils/userColors.js (email-keyed,
// viewer-relative). The old email-hash getUserColor here has been retired.

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
  const imageUrl = row?.file_url || '';
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
 * Member list label: prefer public.profiles.full_name (the canonical store the app writes to
 * when a user updates their name in SettingsModal). Fall back to auth user_metadata.full_name
 * for the current user only — that field is only useful as a seed before profiles has loaded
 * or for legacy accounts that pre-date the profiles row. Last resort is the email local-part.
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
  const prof = String(profileFullNameById[uidNorm] || '').trim();
  // profiles is authoritative for everyone, including self — SettingsModal writes here.
  if (prof) return prof;
  // Auth metadata is now only a fallback for self when profiles hasn't been populated yet.
  if (isSelf) {
    const selfNm = String(authSelfFullName || '').trim();
    if (selfNm) return selfNm;
  }
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
