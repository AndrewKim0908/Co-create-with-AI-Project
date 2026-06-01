// Central user-color system.
//
// One identity → one stable base color, derived by hashing the user's stable
// key (this app keys by normalized email, since markers/chat/presence all carry
// email while user_id is absent on those surfaces).
//
// `resolveProjectColors` produces a *viewer-relative* assignment: the viewer
// always keeps their own base color, and remaining project members are given
// their base color unless it collides with one already taken, in which case the
// first free palette color is used. Because the viewer is seeded first, the same
// underlying data renders with distinct, stable colors on each person's screen
// (two users whose base colors collide will each see the other re-colored).

// 10 visually distinct hues (merged/cleaned from the old email- and name-hash
// palettes). Order matters: it's the deterministic fallback sequence.
export const PALETTE = [
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#ef4444', // red
  '#f59e0b', // amber
  '#10b981', // emerald
  '#14b8a6', // teal
  '#6366f1', // indigo
  '#c88a1a', // gold
];

/** Canonical key for a user identity: trimmed + lowercased. */
function normalizeId(id) {
  if (id == null) return '';
  const s = String(id).trim().toLowerCase();
  return s;
}

/**
 * Stable, deterministic base color for a single user (their "profile color").
 * Hashes the normalized id into the palette. Empty id → neutral grey.
 */
export function baseColorForUser(id) {
  const key = normalizeId(id);
  if (!key) return '#64748b';
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = ((hash << 5) - hash) + key.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % PALETTE.length;
  return PALETTE[idx];
}

/**
 * Viewer-relative color assignment for a project's members.
 * @param {Array<string>} memberIds - project member ids (emails) incl. owner.
 * @param {string} viewerId - the current viewer's id (email).
 * @returns {Map<string,string>} normalized id → color.
 */
export function resolveProjectColors(memberIds, viewerId) {
  const map = new Map();
  const used = new Set();
  const take = (id, color) => { map.set(id, color); used.add(color); };
  const firstFree = () =>
    PALETTE.find((c) => !used.has(c)) || PALETTE[used.size % PALETTE.length];

  const viewer = normalizeId(viewerId);
  if (viewer) take(viewer, baseColorForUser(viewer));

  const others = [
    ...new Set(
      (memberIds || [])
        .map(normalizeId)
        .filter((id) => id && id !== viewer),
    ),
  ].sort();

  for (const id of others) {
    const cand = baseColorForUser(id);
    take(id, used.has(cand) ? firstFree() : cand);
  }
  return map;
}

/**
 * Resolve a single user's color as seen by `viewerId` within the project.
 * Members not present in `memberIds` safely fall back to their base color
 * (keeps realtime stable when a new user appears before the list refreshes).
 */
export function getUserColor(userId, viewerId, memberIds) {
  const id = normalizeId(userId);
  if (!id) return baseColorForUser(userId);
  const map = resolveProjectColors(memberIds || [], viewerId);
  return map.get(id) || baseColorForUser(id);
}
