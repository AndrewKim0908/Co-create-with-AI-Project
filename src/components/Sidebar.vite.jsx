import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Icon from './Icon';
import { C, ROLE_COLORS } from '@/constants/colors';
import { getProjectById } from '@/constants/projects';
import { useLang } from '@/i18n/LangContext';

// ─── Tokens — keep all sidebar shades in one place ────────────
const SIDEBAR = {
  bg: '#1B2530',
  divider: 'rgba(255,255,255,0.05)',
  itemActiveBg: 'rgba(255,255,255,0.07)',
  itemHoverBg: 'rgba(255,255,255,0.035)',
  fgActive: '#FFFFFF',
  fgIdle: 'rgba(255,255,255,0.55)',
  fgHover: 'rgba(255,255,255,0.82)',
  brandSub: 'rgba(255,255,255,0.4)',
  profileSub: 'rgba(255,255,255,0.5)',
};

// Match `/project/:id/...` and pull the id back out without needing
// useParams() (Sidebar lives outside the matched route).
function parseProjectId(pathname) {
  const m = pathname.match(/^\/project\/([^/]+)/);
  return m ? m[1] : null;
}

// ─── Single nav row ──────────────────────────────────────────
function SideNavItem({ item, active, onClick }) {
  const [hov, setHov] = useState(false);

  const bg = active
    ? SIDEBAR.itemActiveBg
    : hov
    ? SIDEBAR.itemHoverBg
    : 'transparent';
  const fg = active ? SIDEBAR.fgActive : hov ? SIDEBAR.fgHover : SIDEBAR.fgIdle;

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      aria-current={active ? 'page' : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '11px 14px',
        borderRadius: 8,
        background: bg,
        color: fg,
        fontSize: 14,
        fontWeight: active ? 600 : 500,
        letterSpacing: '-0.005em',
        cursor: 'pointer',
        transition: 'background 140ms ease, color 140ms ease',
        userSelect: 'none',
        border: 'none',
        textAlign: 'left',
        width: '100%',
        fontFamily: 'inherit',
      }}
    >
      <Icon name={item.icon} size={18} color={fg} />
      <span
        style={{
          flex: 1,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {item.label}
      </span>
    </button>
  );
}

// ─── Project-context strip (only shown inside /project/...) ──
function ProjectContextStrip({ project, onBack, backLabel }) {
  const [hov, setHov] = useState(false);

  return (
    <div style={{ padding: '14px 18px 4px' }}>
      <button
        type="button"
        onClick={onBack}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 6px',
          marginLeft: -6,
          background: 'transparent',
          border: 'none',
          color: hov ? SIDEBAR.fgHover : SIDEBAR.fgIdle,
          fontFamily: 'inherit',
          fontSize: 11.5,
          fontWeight: 500,
          letterSpacing: '0.01em',
          cursor: 'pointer',
          borderRadius: 4,
          transition: 'color 140ms ease',
        }}
      >
        <Icon name="chevron-left" size={13} color={hov ? SIDEBAR.fgHover : SIDEBAR.fgIdle} />
        {backLabel}
      </button>

      <div
        style={{
          marginTop: 8,
          fontSize: 13.5,
          fontWeight: 700,
          color: '#fff',
          letterSpacing: '-0.01em',
          lineHeight: 1.25,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
        title={project.name}
      >
        {project.name}
      </div>
      <div
        style={{
          fontSize: 10.5,
          color: SIDEBAR.brandSub,
          marginTop: 2,
          letterSpacing: '0.04em',
        }}
      >
        {project.team} · Sprint #{project.sprint}
      </div>
    </div>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────
export default function Sidebar({ user, onLogout }) {
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const location = useLocation();
  const [profileHov, setProfileHov] = useState(false);

  const projectId = parseProjectId(location.pathname);
  const project = getProjectById(projectId);
  const inProject = Boolean(projectId);

  // Build nav items based on context.
  const hubGroup = [
    { id: 'hub', path: '/hub', label: t('navHub'), icon: 'layout-grid' },
  ];

  const projectGroup = projectId
    ? [
        { id: 'sprints',      path: `/project/${projectId}/sprints`,      label: t('navSprints'),      icon: 'zap' },
        { id: 'timeline',     path: `/project/${projectId}/timeline`,     label: t('navTimeline'),     icon: 'git-branch' },
        { id: 'stakeholders', path: `/project/${projectId}/stakeholders`, label: t('navStakeholders'), icon: 'users' },
      ]
    : [];

  const supportGroup = [
    { id: 'settings', path: '/settings', label: t('navSettings'), icon: 'settings' },
    { id: 'help',     path: '/help',     label: t('navHelp'),     icon: 'help-circle' },
  ];

  const isActive = (item) => location.pathname === item.path;

  const roleLabel =
    typeof user?.roleLabel === 'string'
      ? user.roleLabel
      : user?.roleLabel?.[lang] || user?.roleLabel?.en || '';

  const renderGroup = (items) =>
    items.map((item) => (
      <SideNavItem
        key={item.id}
        item={item}
        active={isActive(item)}
        onClick={() => navigate(item.path)}
      />
    ));

  return (
    <aside
      style={{
        width: 248,
        flexShrink: 0,
        background: SIDEBAR.bg,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        borderRight: '1px solid rgba(255,255,255,0.04)',
      }}
    >
      {/* Brand header */}
      <div
        style={{
          padding: '22px 18px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 8,
            background: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
          }}
        >
          <img
            src="/assets/logo.png"
            alt="Co-Create AI"
            style={{ width: 32, height: 32, borderRadius: 4, objectFit: 'contain' }}
          />
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: '#fff',
              letterSpacing: '-0.015em',
              lineHeight: 1.15,
            }}
          >
            {t('platformName')}
          </div>
          <div
            style={{
              fontSize: 9.5,
              fontWeight: 600,
              letterSpacing: '0.13em',
              textTransform: 'uppercase',
              color: SIDEBAR.brandSub,
              marginTop: 4,
            }}
          >
            {t('platformSub')}
          </div>
        </div>
      </div>

      <div style={{ height: 1, background: SIDEBAR.divider, margin: '0 18px' }} />

      {inProject && project && (
        <>
          <ProjectContextStrip
            project={project}
            onBack={() => navigate('/hub')}
            backLabel={t('backToHub')}
          />
          <div style={{ height: 1, background: SIDEBAR.divider, margin: '10px 18px 0' }} />
        </>
      )}

      {/* Group A — Hub link (only shown when NOT in a project). */}
      {!inProject && (
        <>
          <nav
            style={{
              padding: '14px 12px 8px',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            {renderGroup(hubGroup)}
          </nav>
          <div style={{ height: 1, background: SIDEBAR.divider, margin: '6px 18px' }} />
        </>
      )}

      {/* Group B — Project nav (only shown when INSIDE a project). */}
      {inProject && (
        <>
          <nav
            style={{
              padding: '14px 12px 8px',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            {renderGroup(projectGroup)}
          </nav>
          <div style={{ height: 1, background: SIDEBAR.divider, margin: '6px 18px' }} />
        </>
      )}

      {/* Group C — always shown (Settings / Help) */}
      <nav
        style={{
          padding: '8px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {renderGroup(supportGroup)}
      </nav>

      <div style={{ flex: 1 }} />

      {/* Bottom profile */}
      <div style={{ padding: '12px 14px 16px' }}>
        <button
          type="button"
          onClick={onLogout}
          style={{
            width: '100%',
            marginBottom: 8,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '8px 10px',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'rgba(255,255,255,0.02)',
            color: 'rgba(255,255,255,0.84)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          <Icon name="log-out" size={14} color="rgba(255,255,255,0.84)" />
          {t('logout')}
        </button>

        <button
          type="button"
          onMouseEnter={() => setProfileHov(true)}
          onMouseLeave={() => setProfileHov(false)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '10px 12px',
            borderRadius: 10,
            background: profileHov
              ? 'rgba(255,255,255,0.06)'
              : 'rgba(255,255,255,0.035)',
            border: '1px solid rgba(255,255,255,0.06)',
            cursor: 'pointer',
            fontFamily: 'inherit',
            textAlign: 'left',
            transition: 'background 140ms ease',
          }}
        >
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              background: ROLE_COLORS[user?.role] || C.emerald,
              color: '#fff',
              fontSize: 12.5,
              fontWeight: 700,
              letterSpacing: '0.02em',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            }}
          >
            {user?.initials || '··'}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 13.5,
                fontWeight: 600,
                color: '#fff',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                lineHeight: 1.25,
                letterSpacing: '-0.005em',
              }}
            >
              {user?.name || 'Guest'}
            </div>
            <div
              style={{
                fontSize: 11.5,
                color: SIDEBAR.profileSub,
                marginTop: 2,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {roleLabel}
            </div>
          </div>

          <Icon
            name="chevron-up-down"
            size={15}
            color="rgba(255,255,255,0.5)"
          />
        </button>
      </div>
    </aside>
  );
}
