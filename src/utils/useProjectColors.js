import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { baseColorForUser, resolveProjectColors } from '@/utils/userColors';

/**
 * Viewer-relative color resolver for a project, keyed by email.
 *
 * Loads the project's member emails (project_members.invited_email + owner +
 * the viewer), builds a viewer-relative color map, and returns `colorFor(email)`.
 * Members not yet in the list fall back to their stable base color, so realtime
 * stays correct when a new user appears before the list refreshes.
 *
 * @param {string} projectId
 * @param {string} viewerEmail - the current viewer's email.
 * @returns {(email: string) => string} colorFor
 */
export function useProjectColors(projectId, viewerEmail) {
  const [memberEmails, setMemberEmails] = useState([]);

  useEffect(() => {
    if (!projectId) { setMemberEmails([]); return undefined; }
    let alive = true;
    (async () => {
      const emails = new Set();
      const self = String(viewerEmail || '').trim().toLowerCase();
      if (self) emails.add(self);
      const { data: rows } = await supabase
        .from('project_members')
        .select('invited_email')
        .eq('project_id', projectId);
      (rows || []).forEach((r) => {
        const e = String(r.invited_email || '').trim().toLowerCase();
        if (e) emails.add(e);
      });
      // Owner email: projects.user_id → profiles.email (owner is not in members).
      const { data: projRow } = await supabase
        .from('projects')
        .select('user_id')
        .eq('id', projectId)
        .maybeSingle();
      const ownerId = projRow?.user_id ? String(projRow.user_id) : null;
      if (ownerId) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('email')
          .eq('id', ownerId)
          .maybeSingle();
        const oe = String(prof?.email || '').trim().toLowerCase();
        if (oe) emails.add(oe);
      }
      if (alive) setMemberEmails([...emails]);
    })();
    return () => { alive = false; };
  }, [projectId, viewerEmail]);

  const viewerKey = String(viewerEmail || '').trim().toLowerCase();
  const colorMap = useMemo(
    () => resolveProjectColors(memberEmails, viewerKey),
    [memberEmails, viewerKey],
  );

  return useCallback(
    (email) => {
      const key = String(email || '').trim().toLowerCase();
      if (!key) return baseColorForUser(email);
      return colorMap.get(key) || baseColorForUser(key);
    },
    [colorMap],
  );
}
