import {
  REALTIME_BROADCAST_EVENTS,
  REALTIME_CHANNELS,
} from '@/constants/realtime';
import { normalizeParticipantUserId } from '@/utils/helpers';

/** Supabase Realtime `filter` string: `column=eq.value` (same as `.eq()` queries). */
export function eqColumnFilter(column, value) {
  return `${column}=eq.${value}`;
}

/**
 * Loads `profiles.id` / `full_name` for participant display; builds normalized id → name map.
 */
export async function fetchProfileFullNamesMap(supabaseClient, profileIds) {
  const profileFullNameById = {};
  let profileRowsRaw = null;
  let profileFetchErr = null;
  if (profileIds.length > 0) {
    const profileRes = await supabaseClient
      .from('profiles')
      .select('id, full_name')
      .in('id', profileIds);
    profileRowsRaw = profileRes.data ?? null;
    profileFetchErr = profileRes.error ?? null;
    (profileRowsRaw || []).forEach((r) => {
      const id = normalizeParticipantUserId(r?.id);
      if (!id) return;
      if (r.full_name != null && String(r.full_name).trim() !== '') {
        profileFullNameById[id] = String(r.full_name).trim();
      }
    });
  }
  return { profileFullNameById, profileRowsRaw, profileFetchErr };
}

/**
 * Realtime: `public.markers` — INSERT/UPDATE filtered by project_id; DELETE unfiltered (rely on payload.old.id).
 * Caller must `.subscribe(...)`.
 */
export function createMarkersRealtimeChannel(client, projectId, handlers) {
  const projectFilter = eqColumnFilter('project_id', projectId);
  return client
    .channel(REALTIME_CHANNELS.MARKERS(projectId))
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'markers', filter: projectFilter },
      handlers.onInsert,
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'markers' },
      handlers.onDelete,
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'markers', filter: projectFilter },
      handlers.onUpdate,
    );
}

/**
 * Conflict panel vote sync: sprint_votes INSERT/UPDATE, broadcast refresh, project_members *.
 * Caller must `.subscribe(...)`.
 */
export function createVoteSyncRealtimeChannel(client, {
  channelTopic,
  filterProject,
  onSprintVoteInsert,
  onSprintVoteUpdate,
  onBroadcast,
  onProjectMembersChange,
}) {
  return client
    .channel(channelTopic, { config: { broadcast: { self: false } } })
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'sprint_votes',
        filter: filterProject,
      },
      onSprintVoteInsert,
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'sprint_votes',
        filter: filterProject,
      },
      onSprintVoteUpdate,
    )
    .on('broadcast', { event: REALTIME_BROADCAST_EVENTS.SPRINT_VOTES_REFRESH }, onBroadcast)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'project_members',
        filter: filterProject,
      },
      onProjectMembersChange,
    );
}

/** Single-project row updates for workspace header meta. Caller must `.subscribe(...)`. */
export function createWorkspaceProjectMetaChannel(client, projectId, onProjectsRow) {
  return client
    .channel(REALTIME_CHANNELS.WORKSPACE_PROJECT_META(projectId))
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'projects',
        filter: eqColumnFilter('id', projectId),
      },
      onProjectsRow,
    );
}
