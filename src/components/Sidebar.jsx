/* ============================================================================
 * Sidebar — extracted from `Co-Create AI.html`
 * ----------------------------------------------------------------------------
 * Loaded by `Co-Create AI.html` via:
 *   <script type="text/babel" src="src/components/Sidebar.jsx"></script>
 *
 * Because the host page uses @babel/standalone (no build step), this file is
 * NOT an ES module — it shares the global script scope with the main inline
 * script. That means `useState`, `useLang`, `t`, `Icon`, and `C` are picked
 * up from the globals defined in the main script, exactly as they were when
 * Sidebar lived inline. UI, behaviour, props, icons, badges, role colors,
 * and i18n keys are 100% identical to the original inline definition.
 * ==========================================================================*/

// ─── SIDEBAR ─────────────────────────────────────────────────
const COLLAPSED_W = 64;
const EXPANDED_W  = 220;

const Sidebar = ({ active, onNav, user }) => {
  const lang = useLang();
  const [collapsed, setCollapsed] = useState(true);
  const nav = [
    { id: 'hub',          label: t(lang,'navHub'),          icon: 'layout-dashboard' },
    { id: 'sprints',      label: t(lang,'navSprints'),      icon: 'zap', badge: 1 },
    { id: 'conflicts',    label: t(lang,'navConflicts'),    icon: 'alert-triangle', badge: 3 },
    { id: 'timeline',     label: t(lang,'navTimeline'),     icon: 'git-branch' },
    { id: 'stakeholders', label: t(lang,'navStakeholders'), icon: 'users' },
    { id: 'reports',      label: t(lang,'navReports'),      icon: 'bar-chart-2' },
  ];
  const bottom = [
    { id: 'settings', label: t(lang,'navSettings'), icon: 'settings' },
    { id: 'help',     label: t(lang,'navHelp'),     icon: 'help-circle' },
  ];
  const roleColors = { engineer: '#06b6d4', designer: '#6b7280', lead: '#C88A1A' };

  return (
    <div
      onMouseEnter={() => setCollapsed(false)}
      onMouseLeave={() => setCollapsed(true)}
      style={{ width: collapsed ? COLLAPSED_W : EXPANDED_W, flexShrink: 0, background: '#f5f6f8', display: 'flex', flexDirection: 'column', height: '100%', borderRight: '1px solid rgba(0,0,0,0.08)', transition: 'width 300ms ease', overflow: 'hidden' }}
    >
      <div style={{ padding: '14px 8px 12px', display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: collapsed ? 0 : 10, borderBottom: '1px solid rgba(0,0,0,0.08)', transition: 'padding 300ms ease' }}>
        <img src="assets/logo-v2.png" style={{ width: 30, height: 30, flexShrink: 0 }} alt="" />
        <div style={{ width: collapsed ? 0 : 'auto', overflow: 'hidden', opacity: collapsed ? 0 : 1, transition: collapsed ? 'opacity 100ms ease' : 'opacity 200ms ease 150ms', pointerEvents: collapsed ? 'none' : 'auto' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1E2A35', letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>{t(lang,'platformName')}</div>
          <div style={{ fontSize: 9, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(30,42,53,0.45)', marginTop: 1, whiteSpace: 'nowrap' }}>{t(lang,'platformSub')}</div>
        </div>
      </div>

      <div style={{ margin: '10px 10px 4px', padding: '8px 10px', background: 'rgba(6,182,212,0.08)', borderRadius: 4, border: '1px solid rgba(6,182,212,0.25)', opacity: collapsed ? 0 : 1, transition: collapsed ? 'opacity 100ms ease' : 'opacity 200ms ease 150ms', pointerEvents: collapsed ? 'none' : 'auto' }}>
        <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(30,42,53,0.45)', marginBottom: 3, whiteSpace: 'nowrap' }}>{t(lang,'activeSprint')}</div>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#1E2A35', whiteSpace: 'nowrap' }}>EV Thermal Module A</div>
        <div style={{ fontSize: 10, color: 'rgba(30,42,53,0.5)', marginTop: 2, whiteSpace: 'nowrap' }}>{t(lang, 'sidebarActiveSprintMeta')}</div>
        <div style={{ marginTop: 6, height: 3, background: 'rgba(0,0,0,0.08)', borderRadius: 2 }}>
          <div style={{ height: 3, width: '67%', background: C.emerald, borderRadius: 2 }}></div>
        </div>
      </div>

      <nav style={{ padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {nav.map(item => <SideNavItem key={item.id} item={item} active={active === item.id} collapsed={collapsed} onClick={() => onNav(item.id)} />)}
      </nav>
      <div style={{ height: 1, background: 'rgba(0,0,0,0.08)', margin: '4px 12px' }} />
      <nav style={{ padding: '4px 8px', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {bottom.map(item => <SideNavItem key={item.id} item={item} active={active === item.id} collapsed={collapsed} onClick={() => onNav(item.id)} />)}
      </nav>

      <div style={{ padding: '10px 8px', marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: collapsed ? 0 : 8, borderTop: '1px solid rgba(0,0,0,0.08)' }}>
        <div style={{ width: 28, height: 28, borderRadius: 4, background: roleColors[user.role] || C.emerald, color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {user.initials}
        </div>
        <div style={{ flex: collapsed ? 0 : 1, width: collapsed ? 0 : 'auto', overflow: 'hidden', minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, opacity: collapsed ? 0 : 1, transition: collapsed ? 'opacity 100ms ease' : 'opacity 200ms ease 150ms', pointerEvents: 'none' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#1E2A35', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.name}</div>
            <div style={{ fontSize: 10, color: 'rgba(30,42,53,0.5)', whiteSpace: 'nowrap' }}>{user.roleLabel}</div>
          </div>
          <Icon name="chevron-up-down" size={13} color="rgba(30,42,53,0.35)" />
        </div>
      </div>
    </div>
  );
};

const SideNavItem = ({ item, active, onClick, collapsed }) => {
  const [hov, setHov] = useState(false);
  return (
    <div onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display: 'flex', alignItems: 'center', gap: collapsed ? 0 : 8, padding: collapsed ? '6px 0' : '6px 10px', justifyContent: collapsed ? 'center' : 'flex-start', borderRadius: 4,
        background: active ? 'rgba(6,182,212,0.12)' : hov ? 'rgba(0,0,0,0.05)' : 'transparent',
        color: active ? '#06b6d4' : hov ? '#1E2A35' : 'rgba(30,42,53,0.55)',
        fontSize: 12, fontWeight: active ? 600 : 500, cursor: 'pointer', transition: 'background 120ms, color 120ms, gap 300ms, padding 300ms', userSelect: 'none' }}>
      <Icon name={item.icon} size={14} />
      <span style={{ flex: collapsed ? 0 : 1, width: collapsed ? 0 : 'auto', minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', opacity: collapsed ? 0 : 1, transition: collapsed ? 'opacity 100ms ease' : 'opacity 200ms ease 150ms', pointerEvents: 'none' }}>{item.label}</span>
      {item.badge && <span style={{ fontSize: 10, fontWeight: 600, background: C.coral, color: '#fff', borderRadius: 9999, padding: collapsed ? 0 : '1px 5px', lineHeight: 1.4, width: collapsed ? 0 : 'auto', overflow: 'hidden', opacity: collapsed ? 0 : 1, transition: collapsed ? 'opacity 100ms ease' : 'opacity 200ms ease 150ms', flexShrink: 0 }}>{item.badge}</span>}
    </div>
  );
};
