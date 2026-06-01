import { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Icon from './Icon';
import { C } from '@/constants/colors';
import { baseColorForUser } from '@/utils/userColors';
import { getProjectById } from '@/constants/projects';
import { useLang } from '@/i18n/LangContext';
import SettingsModal from './SettingsModal';

// ─── Tokens — keep all sidebar shades in one place ────────────
const SIDEBAR = {
  bg: '#f5f6f8',
  divider: 'rgba(0,0,0,0.08)',
  itemActiveBg: 'rgba(6,182,212,0.12)',
  itemHoverBg: 'rgba(0,0,0,0.05)',
  fgActive: '#06b6d4',
  fgIdle: 'rgba(30,42,53,0.55)',
  fgHover: '#1E2A35',
  brandSub: 'rgba(30,42,53,0.45)',
  profileSub: 'rgba(30,42,53,0.5)',
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
      <span
        style={{
          flex: collapsed ? 0 : 1,
          width: collapsed ? 0 : 'auto',
          minWidth: 0,
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
          opacity: collapsed ? 0 : 1,
          transition: collapsed ? 'opacity 100ms ease' : 'opacity 200ms ease 150ms',
          pointerEvents: 'none',
        }}
      >
        {item.label}
      </span>
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
        <span style={{
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          opacity: collapsed ? 0 : 1,
          transition: collapsed ? 'opacity 100ms ease' : 'opacity 200ms ease 150ms',
          pointerEvents: 'none',
        }}>{backLabel}</span>
      </button>

      <div style={{
        opacity: collapsed ? 0 : 1,
        transition: collapsed ? 'opacity 100ms ease' : 'opacity 200ms ease 150ms',
        pointerEvents: collapsed ? 'none' : 'auto',
      }}>
        <div
          style={{
            marginTop: 8,
            fontSize: 13.5,
            fontWeight: 700,
            color: '#1E2A35',
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
            whiteSpace: 'nowrap',
          }}
        >
          {project.team} · Sprint #{project.sprint}
        </div>
      </div>
    </div>
  );
}

// ─── Popup menu button ────────────────────────────────────────
function MenuBtn({ icon, label, onClick, danger, rightSlot }) {
  const [hov, setHov] = useState(false);
  const fg = danger
    ? (hov ? '#dc2626' : '#ef4444')
    : (hov ? '#111827' : '#374151');
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        width: '100%', padding: '7px 10px', borderRadius: 7,
        background: hov ? '#f3f4f6' : 'transparent',
        border: 'none', cursor: 'pointer', fontFamily: 'inherit',
        fontSize: 13, fontWeight: 500, color: fg, textAlign: 'left',
        transition: 'background 120ms ease, color 120ms ease',
      }}
    >
      {icon && <Icon name={icon} size={15} color={fg} />}
      <span style={{ flex: 1 }}>{label}</span>
      {rightSlot}
    </button>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────
const SIDEBAR_W_EXPANDED = 248;
const SIDEBAR_W_COLLAPSED = 64;

export default function Sidebar({ user, onLogout, onProfileUpdate }) {
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const location = useLocation();
  const [profileHov, setProfileHov] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const [logoHov, setLogoHov] = useState(false);
  const [collapseHov, setCollapseHov] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [menuOpen]);

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

  // Workspace-only utility: opens the Sprint Branches popup in WorkspacePage
  // via a window event. Lives outside `projectGroup` because it is a button
  // action, not a navigation target — no path/active state.
  const isOnWorkspace = projectId
    ? location.pathname.startsWith(`/project/${projectId}/workspace`)
    : false;

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
        collapsed={collapsed}
        onClick={() => navigate(item.path)}
      />
    ));

  return (
    <>
    <aside
      style={{
        width: collapsed ? SIDEBAR_W_COLLAPSED : SIDEBAR_W_EXPANDED,
        flexShrink: 0,
        background: SIDEBAR.bg,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        borderRight: '1px solid rgba(0,0,0,0.08)',
        transition: 'width 300ms ease',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Brand header */}
      <div
        style={{
          padding: collapsed ? '18px 8px 14px' : '14px 10px 12px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          gap: collapsed ? 0 : 8,
          transition: 'padding 300ms ease',
          overflow: 'hidden',
        }}
      >
        {/* Collapsed: logo is the expand toggle button */}
        {collapsed ? (
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            onMouseEnter={() => setLogoHov(true)}
            onMouseLeave={() => setLogoHov(false)}
            title={lang === 'ko' ? '사이드바 열기' : 'Expand sidebar'}
            style={{
              width: 34, height: 34, borderRadius: 8,
              background: logoHov ? 'rgba(0,0,0,0.06)' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, border: 'none', cursor: 'pointer', padding: 0,
              transition: 'background 140ms ease',
            }}
          >
            {logoHov
              ? <Icon name="panel-left-open" size={19} color="rgba(30,42,53,0.6)" />
              : <img src="/assets/logo-v2.png" alt="Co-Create AI" style={{ width: 28, height: 28, objectFit: 'contain' }} />
            }
          </button>
        ) : (
          /* Expanded: static logo on the left */
          <img
            src="/assets/logo-v2.png"
            alt="Co-Create AI"
            style={{ width: 26, height: 26, objectFit: 'contain', flexShrink: 0 }}
          />
        )}

        {/* Brand text — only visible when expanded */}
        <div style={{
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          opacity: collapsed ? 0 : 1,
          maxWidth: collapsed ? 0 : 'none',
          transition: collapsed ? 'opacity 100ms ease' : 'opacity 200ms ease 150ms',
          pointerEvents: collapsed ? 'none' : 'auto',
        }}>
          <div style={{
            fontSize: 14,
            fontWeight: 700,
            color: '#1E2A35',
            letterSpacing: '-0.015em',
            lineHeight: 1.2,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {t('platformName')}
          </div>
          <div style={{
            fontSize: 8,
            fontWeight: 600,
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
            color: SIDEBAR.brandSub,
            marginTop: 3,
            lineHeight: 1.4,
            whiteSpace: 'normal',
          }}>
            {t('platformSub')}
          </div>
        </div>

        {/* Collapse button — only visible when expanded */}
        {!collapsed && (
          <button
            type="button"
            onClick={() => { setCollapsed(true); setLogoHov(false); }}
            onMouseEnter={() => setCollapseHov(true)}
            onMouseLeave={() => setCollapseHov(false)}
            title={lang === 'ko' ? '사이드바 닫기' : 'Collapse sidebar'}
            style={{
              width: 28, height: 28, borderRadius: 6,
              background: collapseHov ? 'rgba(0,0,0,0.06)' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, border: 'none', cursor: 'pointer', padding: 0,
              transition: 'background 140ms ease',
            }}
          >
            <Icon name="panel-left-close" size={17} color={collapseHov ? SIDEBAR.fgHover : SIDEBAR.fgIdle} />
          </button>
        )}
      </div>

      <div style={{ height: 1, background: SIDEBAR.divider, margin: collapsed ? '0 8px' : '0 18px', transition: 'margin 300ms ease' }} />

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
          <div style={{ height: 1, background: SIDEBAR.divider, margin: collapsed ? '6px 2px' : '6px 2px', transition: 'margin 300ms ease' }} />
          {renderGroup(projectGroup)}
          {isOnWorkspace ? (
            <SideNavItem
              item={{ id: 'sprint-branches', label: 'Sprint Branches', icon: 'git-branch' }}
              active={false}
              collapsed={collapsed}
              onClick={() => {
                window.dispatchEvent(new CustomEvent('open-sprint-settings'));
              }}
            />
          ) : null}
        </nav>
      )}

      <div style={{ flex: 1 }} />

      {/* Bottom profile */}
      <div
        ref={menuRef}
        style={{ padding: collapsed ? '12px 8px 16px' : '10px 10px 14px', position: 'relative', transition: 'padding 300ms ease' }}
      >
        {/* Popup menu — escapes sidebar overflow when collapsed via position:fixed */}
        {menuOpen && (
          <div style={{
            ...(collapsed
              ? { position: 'fixed', bottom: 16, left: SIDEBAR_W_COLLAPSED + 6, width: 200 }
              : { position: 'absolute', bottom: 'calc(100% - 2px)', left: 10, right: 10 }
            ),
            background: '#ffffff', borderRadius: 12,
            boxShadow: '0 4px 24px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08)',
            border: '1px solid #e5e7eb',
            padding: '6px', zIndex: 100,
          }}>
            <MenuBtn
              icon="settings"
              label={t('navSettings')}
              onClick={() => { setSettingsOpen(true); setMenuOpen(false); }}
            />

            <div style={{ height: 1, background: '#e5e7eb', margin: '4px 2px' }} />

            <MenuBtn
              icon="log-out"
              label={t('logout')}
              danger
              onClick={() => { onLogout(); setMenuOpen(false); }}
            />
          </div>
        )}

        {/* Profile trigger button */}
        <button
          type="button"
          onClick={() => setMenuOpen(v => !v)}
          onMouseEnter={() => setProfileHov(true)}
          onMouseLeave={() => setProfileHov(false)}
          title={collapsed ? `${user?.name || 'Guest'} · ${roleLabel}` : undefined}
          style={{
            width: '100%', display: 'flex', alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            gap: collapsed ? 0 : 10,
            padding: collapsed ? '10px 0' : '10px 10px',
            borderRadius: 10,
            background: menuOpen
              ? 'rgba(0,0,0,0.07)'
              : profileHov ? 'rgba(0,0,0,0.05)' : 'rgba(0,0,0,0.03)',
            border: '1px solid rgba(0,0,0,0.08)',
            cursor: 'pointer',
            fontFamily: 'inherit', textAlign: 'left',
            transition: 'background 140ms ease, padding 300ms ease',
          }}
        >
          <div style={{
            width: 34, height: 34, borderRadius: 8,
            background: user?.email ? baseColorForUser(user.email) : C.emerald,
            color: '#fff', fontSize: 12.5, fontWeight: 700, letterSpacing: '0.02em',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
          }}>
            {user?.initials || '··'}
          </div>

          <div style={{
            flex: collapsed ? 0 : 1, width: collapsed ? 0 : 'auto',
            overflow: 'hidden', minWidth: 0,
            display: 'flex', alignItems: 'center', gap: 6,
            opacity: collapsed ? 0 : 1,
            transition: collapsed ? 'opacity 100ms ease' : 'opacity 200ms ease 150ms',
            pointerEvents: 'none',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 13, fontWeight: 600, color: '#1E2A35',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                lineHeight: 1.25, letterSpacing: '-0.005em',
              }}>
                {user?.name || 'Guest'}
              </div>
            </div>
            <Icon
              name={menuOpen ? 'chevron-up' : 'chevron-down'}
              size={13}
              color="rgba(30,42,53,0.4)"
            />
          </div>
        </button>
      </div>
    </aside>

    {settingsOpen && (
      <SettingsModal user={user} onClose={() => setSettingsOpen(false)} onProfileUpdate={onProfileUpdate} />
    )}
    </>
  );
}
