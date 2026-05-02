/**
 * Supabase Realtime channel names and payloads used across the workspace.
 * Channel strings must stay stable so reconnects match server-side bindings.
 */
export const REALTIME_CHANNELS = {
  VOTE_SYNC: (projectId) => `vote-sync:${projectId}`,
  /** Markers table postgres_changes subscription (historical name in this app). */
  MARKERS: (projectId) => `markers-realtime-${projectId}`,
  /** Workspace header: live `projects` row for current id. */
  WORKSPACE_PROJECT_META: (projectId) => `workspace-project-meta-${projectId}`,
};

export const VOTE_STATUS = {
  APPROVE: 'approve',
  OPPOSE: 'oppose',
};

export const REALTIME_BROADCAST_EVENTS = {
  SPRINT_VOTES_REFRESH: 'sprint_votes_refresh',
};
