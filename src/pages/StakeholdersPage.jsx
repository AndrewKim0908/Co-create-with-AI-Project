import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import Header from '@/components/Header';
import Btn from '@/components/Btn';
import StatusBadge from '@/components/StatusBadge';
import Icon from '@/components/Icon';
import { C } from '@/constants/colors';
import { getProjectById, DEFAULT_PROJECT } from '@/constants/projects';
import { useLang } from '@/i18n/LangContext';
import { getRoleLabel } from '@/constants/roles';
import { supabase } from '@/lib/supabase';
import { eqColumnFilter } from '@/utils/supabaseHelpers';
import { normalizeParticipantUserId } from '@/utils/helpers';
import { baseColorForUser, resolveProjectColors } from '@/utils/userColors';

// ─── Avatar helpers ──────────────────────────────────────────
// Avatar tint comes from the central user-color system (keyed by email),
// so a member's color matches the workspace/sidebar/chat everywhere.

function initialsFor(name, email) {
  const src = (name && name.trim()) || (email && email.trim()) || '?';
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return (parts[0] || src).slice(0, 2).toUpperCase();
}

// 'accepted' | 'pending' → StatusBadge variant (Active / Pending).
const STATUS_BADGE = { accepted: 'active', pending: 'pending' };

// ─── Stat tile (mirrors HubPage KPI tiles) ───────────────────
function StatTile({ label, value, sub, color }) {
  return (
    <div
      style={{
        background: C.white,
        border: `1px solid ${C.borderSubtle}`,
        borderRadius: 6,
        padding: '14px 16px',
        boxShadow: '0 1px 2px rgba(30,42,53,0.06)',
      }}
    >
      <div
        style={{
          fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
          letterSpacing: '0.08em', color: C.fg3, marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: color || C.fg1, lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: C.fg3, marginTop: 4 }}>{sub}</div>
    </div>
  );
}

// ─── Stakeholder card — name / email / status only ───────────
function StakeholderCard({ person }) {
  const { lang } = useLang();
  const [hov, setHov] = useState(false);
  const roleLabel = person.role ? getRoleLabel(person.role, lang) : '';
  const expertise = Array.isArray(person.expertise) ? person.expertise : [];

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: C.white,
        border: `1px solid ${hov ? C.border : C.borderSubtle}`,
        borderRadius: 6,
        boxShadow: hov
          ? '0 4px 12px rgba(30,42,53,0.10)'
          : '0 1px 3px rgba(30,42,53,0.07)',
        transition: 'all 160ms',
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}
    >
      {/* Top accent stripe — matches HubPage card stripe */}
      <div style={{ height: 3, background: person.accent }} />

      {/* Body */}
      <div
        style={{
          padding: '16px',
          display: 'flex', flexDirection: 'column', gap: 12,
          flex: 1,
        }}
      >
        {/* Identity row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          {/* Avatar — initials in a name-tinted square */}
          <div
            aria-hidden="true"
            style={{
              width: 44, height: 44, borderRadius: 10,
              background: person.accent,
              color: '#fff',
              fontSize: 14, fontWeight: 700, letterSpacing: '0.02em',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
              boxShadow: `0 1px 3px ${person.accent}55`,
            }}
          >
            {person.initials}
          </div>

          {/* Name + email + role */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 14, fontWeight: 600, color: C.fg1,
                lineHeight: 1.25, letterSpacing: '-0.005em',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}
            >
              {person.name}
            </div>
            <div
              style={{
                fontSize: 12, color: C.fg3, marginTop: 3,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}
            >
              {person.email}
            </div>
            {roleLabel && (
              <div
                style={{
                  fontSize: 11.5, color: C.fg2, fontWeight: 500, marginTop: 5,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}
              >
                {roleLabel}
              </div>
            )}
          </div>

          <StatusBadge status={STATUS_BADGE[person.status] || 'pending'} />
        </div>

        {/* Expertise tags (omitted when empty) */}
        {expertise.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {expertise.map((tag) => (
              <span
                key={tag}
                style={{
                  display: 'inline-flex', alignItems: 'center',
                  padding: '3px 9px', borderRadius: 9999,
                  background: C.subtle, color: C.fg2,
                  border: `1px solid ${C.borderSubtle}`,
                  fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap',
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Empty state ─────────────────────────────────────────────
function EmptyState({ onInvite }) {
  const { t } = useLang();
  return (
    <div
      style={{
        background: C.white,
        border: `1px dashed ${C.border}`,
        borderRadius: 8,
        padding: '56px 24px',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        textAlign: 'center', gap: 10,
      }}
    >
      <div
        style={{
          width: 56, height: 56, borderRadius: '50%',
          background: C.emeraldLight,
          color: C.emerald,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 4,
        }}
      >
        <Icon name="users" size={26} color={C.emerald} />
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: C.fg1 }}>
        {t('emptyTitle')}
      </div>
      <div style={{ fontSize: 12, color: C.fg3, maxWidth: 360, lineHeight: 1.55 }}>
        {t('emptySub')}
      </div>
      <div style={{ marginTop: 8 }}>
        <Btn variant="primary" size="md" onClick={onInvite}>
          <Icon name="user-plus" size={13} /> {t('emptyCta')}
        </Btn>
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────
export default function StakeholdersPage() {
  const { t, lang } = useLang();
  const { projectId } = useParams();
  const project = getProjectById(projectId) || DEFAULT_PROJECT;
  const [query, setQuery] = useState('');
  const [members, setMembers] = useState([]);

  // Load real project_members + profiles for the current project, then merge
  // in the project owner (who is not stored in project_members). Names come
  // from the joined profile (full_name); pending invites with no profile yet
  // fall back to the invited email.
  async function loadMembers() {
    if (!projectId) {
      setMembers([]);
      return;
    }
    const { data, error } = await supabase
      .from('project_members')
      .select('id, invited_email, status, user_id')
      .eq('project_id', projectId);
    if (error) {
      setMembers([]);
      return;
    }
    const rows = data || [];

    // Owner: projects.user_id holds the creator, who never appears in
    // project_members. Pull the owner id from the project row and the current
    // auth identity.
    const { data: projectRow } = await supabase
      .from('projects')
      .select('user_id')
      .eq('id', projectId)
      .maybeSingle();
    const ownerUserId = projectRow?.user_id || null;
    const { data: authData } = await supabase.auth.getUser();
    const authUid = authData?.user?.id || null;
    const authEmail = String(authData?.user?.email || '').trim().toLowerCase();

    // Resolve full_name + role + expertise + email for every member user_id
    // plus the owner in one query, keyed by normalized profile id.
    const userIds = Array.from(
      new Set(
        [...rows.map((r) => r.user_id), ownerUserId].filter(Boolean),
      ),
    );
    const profileById = {};
    if (userIds.length) {
      const { data: profileRows } = await supabase
        .from('profiles')
        .select('id, full_name, role, expertise, email')
        .in('id', userIds);
      (profileRows || []).forEach((p) => {
        const id = normalizeParticipantUserId(p?.id);
        if (id) profileById[id] = p;
      });
    }

    const mapped = rows.map((r) => {
      const prof = r.user_id ? profileById[normalizeParticipantUserId(r.user_id)] : null;
      const fullName = prof?.full_name || '';
      const email = String(r.invited_email || '').trim().toLowerCase();
      const name = (fullName && fullName.trim()) || email || 'Member';
      const status = r.status === 'accepted' ? 'accepted' : 'pending';
      return {
        key: r.id,
        name,
        email,
        status,
        role: prof?.role || '',
        expertise: Array.isArray(prof?.expertise) ? prof.expertise : [],
        initials: initialsFor(fullName, email),
      };
    });

    // Add the owner unless they're already present as a project_members row.
    const ownerInMembers =
      ownerUserId != null &&
      rows.some(
        (r) =>
          r.user_id != null &&
          normalizeParticipantUserId(r.user_id) === normalizeParticipantUserId(ownerUserId),
      );
    if (ownerUserId && !ownerInMembers) {
      const ownerProfile = profileById[normalizeParticipantUserId(ownerUserId)] || null;
      const ownerFullName = ownerProfile?.full_name || '';
      const ownerEmail =
        (authUid && ownerUserId === authUid && authEmail)
        || String(ownerProfile?.email || '').trim().toLowerCase();
      const ownerName = (ownerFullName && ownerFullName.trim()) || ownerEmail || 'Owner';
      mapped.push({
        key: `owner:${ownerUserId}`,
        name: ownerName,
        email: ownerEmail,
        status: 'accepted',
        role: ownerProfile?.role || '',
        expertise: Array.isArray(ownerProfile?.expertise) ? ownerProfile.expertise : [],
        initials: initialsFor(ownerFullName, ownerEmail),
      });
    }

    // Viewer-relative avatar colors (central resolver, keyed by email) so a
    // member's color matches the workspace/sidebar/chat. Viewer = current user.
    const memberEmails = mapped.map((m) => m.email).filter(Boolean);
    const colorMap = resolveProjectColors(memberEmails, authEmail);
    mapped.forEach((m) => {
      const key = String(m.email || '').trim().toLowerCase();
      m.accent = (key && colorMap.get(key)) || baseColorForUser(m.email || m.key);
    });

    // Accepted first, then pending; alphabetical within each group.
    mapped.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'accepted' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    setMembers(mapped);
  }

  useEffect(() => {
    loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Realtime: refresh on any project_members change for this project.
  useEffect(() => {
    if (!projectId) return undefined;
    const channel = supabase
      .channel(`stakeholders-members-${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'project_members',
          filter: eqColumnFilter('project_id', projectId),
        },
        () => {
          loadMembers();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const handleInvite = () => {
    // Hook this up to a modal / API later.
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q),
    );
  }, [query, members]);

  const total = members.length;
  const acceptedCount = members.filter((p) => p.status === 'accepted').length;
  const pendingCount = members.filter((p) => p.status === 'pending').length;

  const stats = [
    { label: t('kpiTotalMembers'),   value: String(total),         sub: t('kpiTotalMembersSub'),   color: C.fg1 },
    { label: t('kpiActiveNow'),      value: String(acceptedCount), sub: t('kpiActiveNowSub'),      color: C.emerald },
    { label: t('kpiPendingInvites'), value: String(pendingCount),  sub: t('kpiPendingInvitesSub'), color: pendingCount > 0 ? C.amber : C.fg1 },
  ];

  return (
    <>
      <Header
        title={`${t('sprintLabel')} #${project.sprint} — ${project.name}`}
        subtitle={`${t('stakeholdersTitle')} · ${t('stakeholdersSub')}`}
        action={handleInvite}
        actionLabel={
          <>
            <Icon name="user-plus" size={13} /> {t('inviteMember')}
          </>
        }
      />

      <div
        key={lang}
        style={{
          flex: 1, overflow: 'auto', padding: 24,
          display: 'flex', flexDirection: 'column', gap: 20,
        }}
      >
        {/* KPI row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
          {stats.map((s) => (
            <StatTile key={s.label} {...s} />
          ))}
        </div>

        {/* Members section header */}
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 12, marginTop: 4,
          }}
        >
          <div
            style={{
              fontSize: 13, fontWeight: 600, color: C.fg1,
              display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            {t('allMembers')}
            <span
              style={{
                fontSize: 11, fontWeight: 600,
                color: C.fg3, background: C.subtle,
                padding: '2px 7px', borderRadius: 9999,
                border: `1px solid ${C.borderSubtle}`,
              }}
            >
              {total}
            </span>
          </div>

          {/* Search */}
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: C.white, border: `1px solid ${C.border}`,
              borderRadius: 4, padding: '6px 10px',
              width: 240,
            }}
          >
            <Icon name="search" size={13} color={C.fg3} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('searchMembersPh')}
              style={{
                flex: 1, border: 'none', outline: 'none',
                fontSize: 12, color: C.fg1,
                fontFamily: 'inherit', background: 'transparent',
              }}
            />
          </div>
        </div>

        {/* Grid or empty state */}
        {filtered.length === 0 ? (
          <EmptyState onInvite={handleInvite} />
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 14,
            }}
          >
            {filtered.map((person) => (
              <StakeholderCard key={person.key} person={person} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
