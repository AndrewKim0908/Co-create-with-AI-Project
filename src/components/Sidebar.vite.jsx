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
function SideNavItem({ item, active, onClick, collapsed }) {
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
      title={collapsed ? item.label : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'flex-start',
        gap: collapsed ? 0 : 14,
        padding: collapsed ? '11px 0' : '11px 14px',
        borderRadius: 8,
        background: bg,
        color: fg,
        fontSize: 14,
        fontWeight: active ? 600 : 500,
        letterSpacing: '-0.005em',
        cursor: 'pointer',
        transition: 'background 140ms ease, color 140ms ease, padding 300ms ease',
        userSelect: 'none',
        border: 'none',
        textAlign: 'left',
        width: '100%',
        fontFamily: 'inherit',
      }}
    >
      <Icon name={item.icon} size={18} color={fg} />
      {!collapsed ? (
        <span
          style={{
            flex: 1,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            transition: 'opacity 300ms ease',
          }}
        >
          {item.label}
        </span>
      ) : null}
    </button>
  );
}

function BackToHubButton({ onClick, label, collapsed }) {
  const [hov, setHov] = useState(false);
  const fg = hov ? SIDEBAR.fgHover : SIDEBAR.fgIdle;

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      title={collapsed ? label : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'flex-start',
        gap: collapsed ? 0 : 10,
        width: '100%',
        padding: collapsed ? '10px 0' : '10px 14px',
        borderRadius: 8,
        border: 'none',
        background: hov ? SIDEBAR.itemHoverBg : 'transparent',
        color: fg,
        fontFamily: 'inherit',
        fontSize: 13,
        fontWeight: 500,
        textAlign: 'left',
        cursor: 'pointer',
        transition: 'background 140ms ease, color 140ms ease, padding 300ms ease',
      }}
    >
      <Icon name="home" size={16} color={fg} />
      {!collapsed ? <span>{label}</span> : null}
    </button>
  );
}

// ─── Project-context strip (only shown inside /project/...) ──
function ProjectContextStrip({ project, onBack, backLabel, collapsed }) {
  const [hov, setHov] = useState(false);

  return (
    <div style={{ padding: collapsed ? '8px 6px 4px' : '14px 18px 4px', transition: 'padding 300ms ease' }}>
      <button
        type="button"
        onClick={onBack}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        title={collapsed ? backLabel : undefined}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          gap: 4,
          padding: '4px 6px',
          marginLeft: collapsed ? 0 : -6,
          width: collapsed ? '100%' : 'auto',
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
        {!collapsed ? backLabel : null}
      </button>

      {!collapsed ? (
        <>
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
        </>
      ) : null}
    </div>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────
const SIDEBAR_W_EXPANDED = 248;
const SIDEBAR_W_COLLAPSED = 64;

export default function Sidebar({ user, onLogout }) {
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const location = useLocation();
  const [profileHov, setProfileHov] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

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
  const showBackToHub = location.pathname !== '/hub';

  const roleLabel =
    typeof user?.roleLabel === 'string'
      ? user.roleLabel
      : user?.roleLabel?.[lang] || user?.roleLabel?.en || '';
  const hubBackLabel = lang === 'ko' ? '프로젝트 허브로 돌아가기' : 'Back to Hub';

  const renderGroup = (items) =>
    items.map((item) => (
      <SideNavItem
        key={item.id}
        item={item}
        active={isActive(item)}
        collapsed={collapsed}
        onClick={() => navigate(item.path)}
      />
    ));

  return (
    <aside
      style={{
        width: collapsed ? SIDEBAR_W_COLLAPSED : SIDEBAR_W_EXPANDED,
        flexShrink: 0,
        background: SIDEBAR.bg,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        borderRight: '1px solid rgba(255,255,255,0.04)',
        transition: 'width 300ms ease',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        title={collapsed ? t('navHub') : undefined}
        style={{
          position: 'absolute',
          top: 14,
          right: collapsed ? 10 : 12,
          zIndex: 3,
          width: 28,
          height: 28,
          borderRadius: 6,
          border: '1px solid rgba(255,255,255,0.12)',
          background: 'rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          color: SIDEBAR.fgIdle,
          transition: 'background 140ms ease, right 300ms ease',
        }}
      >
        <Icon name={collapsed ? 'chevron-right' : 'chevron-left'} size={16} color="rgba(255,255,255,0.75)" />
      </button>

      {/* Brand header */}
      <div
        style={{
          padding: collapsed ? '48px 8px 16px' : '22px 40px 20px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          gap: collapsed ? 0 : 12,
          transition: 'padding 300ms ease',
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
        {!collapsed ? (
          <div style={{ minWidth: 0, flex: 1 }}>
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
        ) : null}
      </div>

      <div style={{ height: 1, background: SIDEBAR.divider, margin: collapsed ? '0 8px' : '0 18px', transition: 'margin 300ms ease' }} />
      {showBackToHub && (
        <div style={{ padding: collapsed ? '8px 6px 0' : '8px 12px 0', transition: 'padding 300ms ease' }}>
          <BackToHubButton
            onClick={() => navigate('/hub')}
            label={hubBackLabel}
            collapsed={collapsed}
          />
        </div>
      )}

      {inProject && project && (
        <>
          <ProjectContextStrip
            project={project}
            onBack={() => navigate('/hub')}
            backLabel={t('backToHub')}
            collapsed={collapsed}
          />
          <div style={{ height: 1, background: SIDEBAR.divider, margin: collapsed ? '6px 8px 0' : '10px 18px 0', transition: 'margin 300ms ease' }} />
        </>
      )}

      {/* Group A — Hub link (only shown when NOT in a project). */}
      {!inProject && (
        <>
          <nav
            style={{
              padding: collapsed ? '14px 6px 8px' : '14px 12px 8px',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              transition: 'padding 300ms ease',
            }}
          >
            {renderGroup(hubGroup)}
          </nav>
          <div style={{ height: 1, background: SIDEBAR.divider, margin: collapsed ? '6px 8px' : '6px 18px', transition: 'margin 300ms ease' }} />
        </>
      )}

      {/* Group B — Project nav (only shown when INSIDE a project). */}
      {inProject && (
        <>
          <nav
            style={{
              padding: collapsed ? '14px 6px 8px' : '14px 12px 8px',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              transition: 'padding 300ms ease',
            }}
          >
            {renderGroup(projectGroup)}
          </nav>
          <div style={{ height: 1, background: SIDEBAR.divider, margin: collapsed ? '6px 8px' : '6px 18px', transition: 'margin 300ms ease' }} />
        </>
      )}

      {/* Group C — always shown (Settings / Help) */}
      <nav
        style={{
          padding: collapsed ? '8px 6px' : '8px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          transition: 'padding 300ms ease',
        }}
      >
        {renderGroup(supportGroup)}
      </nav>

      <div style={{ flex: 1 }} />

      {/* Bottom profile */}
      <div style={{ padding: collapsed ? '12px 8px 16px' : '12px 14px 16px', transition: 'padding 300ms ease' }}>
        <button
          type="button"
          onClick={onLogout}
          title={collapsed ? t('logout') : undefined}
          style={{
            width: '100%',
            marginBottom: 8,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: collapsed ? 0 : 8,
            padding: collapsed ? '8px 0' : '8px 10px',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'rgba(255,255,255,0.02)',
            color: 'rgba(255,255,255,0.84)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'padding 300ms ease',
          }}
        >
          <Icon name="log-out" size={14} color="rgba(255,255,255,0.84)" />
          {!collapsed ? t('logout') : null}
        </button>

        <button
          type="button"
          onMouseEnter={() => setProfileHov(true)}
          onMouseLeave={() => setProfileHov(false)}
          title={collapsed ? `${user?.name || 'Guest'} · ${roleLabel}` : undefined}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            gap: collapsed ? 0 : 12,
            padding: collapsed ? '10px 0' : '10px 12px',
            borderRadius: 10,
            background: profileHov
              ? 'rgba(255,255,255,0.06)'
              : 'rgba(255,255,255,0.035)',
            border: '1px solid rgba(255,255,255,0.06)',
            cursor: 'pointer',
            fontFamily: 'inherit',
            textAlign: 'left',
            transition: 'background 140ms ease, padding 300ms ease',
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

          {!collapsed ? (
            <>
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
            </>
          ) : null}
        </button>
      </div>
    </aside>
  );
}
