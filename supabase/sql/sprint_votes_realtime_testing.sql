-- sprint_votes + Supabase Realtime (postgres_changes)
--
-- Rows are pushed to clients only when the subscribing user's JWT passes RLS
-- for an equivalent SELECT on that row. If your policy only allows SELECT on
-- "own" rows, other members' INSERT/UPDATE will not appear as postgres_changes,
-- even with REPLICA IDENTITY FULL. Use this script only in staging/local to confirm.
--
-- After testing, restore RLS and tighten policies again (see bottom).

-- ── Temporary: disable RLS on sprint_votes (TEST ONLY — not for production)
ALTER TABLE public.sprint_votes DISABLE ROW LEVEL SECURITY;

-- ── Restore production-style lockdown after your test:
-- ALTER TABLE public.sprint_votes ENABLE ROW LEVEL SECURITY;
--
-- Better long-term fix: keep RLS enabled and add (or widen) SELECT so every
-- project member can READ all sprint_votes rows for projects they belong to.
-- Broadcast (see ConflictPanel vote-sync channel) remains a fallback if you
-- prefer not to loosen SELECT.
