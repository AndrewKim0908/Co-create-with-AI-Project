import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import Header from '@/components/Header';
import Btn from '@/components/Btn';
import StatusBadge from '@/components/StatusBadge';
import Icon from '@/components/Icon';
import { C } from '@/constants/colors';
import { getProjectById, DEFAULT_PROJECT } from '@/constants/projects';
import { useLang } from '@/i18n/LangContext';

// ─── Sample dataset ──────────────────────────────────────────
// Mirrors the four members in the Stitch reference + a couple
// extras so the responsive grid feels populated.
const STAKEHOLDERS = [
  {
    id: 'LS', name: 'Lee Sungmin',  role: 'Hardware Engineer',
    status: 'active',  weight: 1.2,
    expertise: ['Thermal', 'Analysis'],
    accent: '#06b6d4',
  },
  {
    id: 'SC', name: 'Sarah Chen',   role: 'Product Designer',
    status: 'active',  weight: 1.0,
    expertise: ['UX', 'Industrial Design'],
    accent: '#7F56D9',
  },
  {
    id: 'AM', name: 'Alex Mercer',  role: 'Lead User',
    status: 'busy',    weight: 2.0,
    expertise: ['Requirements', 'Validation'],
    accent: '#C88A1A',
  },
  {
    id: 'DP', name: 'David Park',   role: 'Manufacturing Expert',
    status: 'offline', weight: 0.8,
    expertise: ['DFM', 'Sourcing'],
    accent: '#475569',
  },
  {
    id: 'EK', name: 'Emma Kang',    role: 'Quality Engineer',
    status: 'active',  weight: 1.1,
    expertise: ['Validation', 'Analysis'],
    accent: '#0EA5B7',
  },
  {
    id: 'JL', name: 'Jay Lee',      role: 'Cost Analyst',
    status: 'pending', weight: 0.9,
    expertise: ['Sourcing', 'Requirements'],
    accent: '#3A6EA5',
  },
];

// Lucide icon hint for each expertise pill.
const EXPERTISE_ICON = {
  Thermal: 'thermometer',
  Analysis: 'bar-chart-2',
  UX: 'palette',
  'Industrial Design': 'pen-tool',
  Requirements: 'clipboard-check',
  Validation: 'shield',
  DFM: 'hammer',
  Sourcing: 'package',
};

// Cap decision-weight bar at 2.5x so 1.0x ≈ 40% fill.
const WEIGHT_MAX = 2.5;

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

// ─── Expertise pill ──────────────────────────────────────────
function ExpertisePill({ label }) {
  const iconName = EXPERTISE_ICON[label];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '4px 9px',
        background: C.subtle,
        color: C.fg2,
        border: `1px solid ${C.borderSubtle}`,
        borderRadius: 9999,
        fontSize: 11,
        fontWeight: 500,
        whiteSpace: 'nowrap',
      }}
    >
      {iconName && <Icon name={iconName} size={11} color={C.fg3} />}
      {label}
    </span>
  );
}

// ─── Stakeholder card ────────────────────────────────────────
function StakeholderCard({ person }) {
  const { t } = useLang();
  const [hov, setHov] = useState(false);

  const fillPct = Math.min(person.weight / WEIGHT_MAX, 1) * 100;

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
          display: 'flex', flexDirection: 'column', gap: 14,
          flex: 1,
        }}
      >
        {/* Identity row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          {/* Avatar — initials in a role-tinted square */}
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
            {person.id}
          </div>

          {/* Name + role */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 14, fontWeight: 600, color: C.fg1,
                lineHeight: 1.25, letterSpacing: '-0.005em',
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
              {person.role}
            </div>
          </div>

          <StatusBadge status={person.status} />
        </div>

        {/* Decision weight panel */}
        <div
          style={{
            background: C.subtle,
            borderRadius: 4,
            padding: '10px 12px',
            display: 'flex', flexDirection: 'column', gap: 6,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span
              style={{
                fontSize: 9.5, fontWeight: 600, textTransform: 'uppercase',
                letterSpacing: '0.1em', color: C.fg3,
              }}
            >
              {t('decisionWeight')}
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.fg1 }}>
              {person.weight.toFixed(1)}x
            </span>
          </div>
          <div style={{ height: 5, background: C.muted, borderRadius: 9999, overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${fillPct}%`,
                background: `linear-gradient(90deg, ${C.emerald} 0%, #25A46C 100%)`,
                borderRadius: 9999,
                transition: 'width 300ms',
              }}
            />
          </div>
        </div>

        {/* Expertise */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <span
            style={{
              fontSize: 9.5, fontWeight: 600, textTransform: 'uppercase',
              letterSpacing: '0.1em', color: C.fg3,
            }}
          >
            {t('expertiseLabel')}
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {person.expertise.map((e) => (
              <ExpertisePill key={e} label={e} />
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          borderTop: `1px solid ${C.borderSubtle}`,
          padding: '10px 16px',
          display: 'flex', justifyContent: 'flex-end',
        }}
      >
        <button
          type="button"
          style={{
            background: 'none', border: 'none',
            color: C.emerald, fontSize: 12, fontWeight: 600,
            cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontFamily: 'inherit',
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseEnter={(e) => { e.currentTarget.style.color = C.emeraldHover; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = C.emerald; }}
        >
          {t('viewProfile')}
          <Icon name="arrow-right" size={12} />
        </button>
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

  const handleInvite = () => {
    // Hook this up to a modal / API later. For now keep the demo silent
    // so the design preview is uncluttered.
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return STAKEHOLDERS;
    return STAKEHOLDERS.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.role.toLowerCase().includes(q) ||
        p.expertise.some((e) => e.toLowerCase().includes(q)),
    );
  }, [query]);

  const total = STAKEHOLDERS.length;
  const activeCount = STAKEHOLDERS.filter((p) => p.status === 'active').length;
  const pendingCount = STAKEHOLDERS.filter((p) => p.status === 'pending').length;
  const avgWeight = (
    STAKEHOLDERS.reduce((sum, p) => sum + p.weight, 0) / Math.max(total, 1)
  ).toFixed(1);

  const stats = [
    { label: t('kpiTotalMembers'),    value: String(total),     sub: t('kpiTotalMembersSub'),    color: C.fg1 },
    { label: t('kpiActiveNow'),       value: String(activeCount), sub: t('kpiActiveNowSub'),     color: C.emerald },
    { label: t('kpiAvgWeight'),       value: `${avgWeight}x`,   sub: t('kpiAvgWeightSub'),       color: C.fg1 },
    { label: t('kpiPendingInvites'),  value: String(pendingCount), sub: t('kpiPendingInvitesSub'), color: pendingCount > 0 ? C.amber : C.fg1 },
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
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
              <StakeholderCard key={person.id} person={person} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
