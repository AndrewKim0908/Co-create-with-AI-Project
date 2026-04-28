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
const Sidebar = ({ active, onNav, user }) => {
  const lang = useLang();
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
  const roleColors = { engineer: '#1E8A5A', designer: '#3A4A58', lead: '#C88A1A' };

  return (
    <div style={{ width: 220, flexShrink: 0, background: C.navy, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '14px 14px 12px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <img src="assets/logo.png" style={{ width: 30, height: 30, borderRadius: 4 }} alt="" />
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', letterSpacing: '-0.01em' }}>{t(lang,'platformName')}</div>
          <div style={{ fontSize: 9, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>{t(lang,'platformSub')}</div>
        </div>
      </div>

      <div style={{ margin: '10px 10px 4px', padding: '8px 10px', background: 'rgba(30,138,90,0.12)', borderRadius: 4, border: '1px solid rgba(30,138,90,0.25)' }}>
        <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.4)', marginBottom: 3 }}>{t(lang,'activeSprint')}</div>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#fff' }}>EV Thermal Module A</div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>Sprint #14 · 3 {t(lang,'conflictsOpen')}</div>
        <div style={{ marginTop: 6, height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 2 }}>
          <div style={{ height: 3, width: '67%', background: C.emerald, borderRadius: 2 }}></div>
        </div>
      </div>

      <nav style={{ padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {nav.map(item => <SideNavItem key={item.id} item={item} active={active === item.id} onClick={() => onNav(item.id)} />)}
      </nav>
      <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '4px 12px' }} />
      <nav style={{ padding: '4px 8px', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {bottom.map(item => <SideNavItem key={item.id} item={item} active={active === item.id} onClick={() => onNav(item.id)} />)}
      </nav>

      <div style={{ padding: '10px 14px', marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ width: 28, height: 28, borderRadius: 4, background: roleColors[user.role] || C.emerald, color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {user.initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.9)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.name}</div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{user.roleLabel}</div>
        </div>
        <Icon name="chevron-up-down" size={13} color="rgba(255,255,255,0.3)" />
      </div>
    </div>
  );
};

const SideNavItem = ({ item, active, onClick }) => {
  const [hov, setHov] = useState(false);
  return (
    <div onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 4,
        background: active ? 'rgba(255,255,255,0.12)' : hov ? 'rgba(255,255,255,0.06)' : 'transparent',
        color: active ? '#fff' : hov ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.5)',
        fontSize: 12, fontWeight: 500, cursor: 'pointer', transition: 'all 120ms', userSelect: 'none' }}>
      <Icon name={item.icon} size={14} />
      <span style={{ flex: 1 }}>{item.label}</span>
      {item.badge && <span style={{ fontSize: 10, fontWeight: 600, background: C.coral, color: '#fff', borderRadius: 9999, padding: '1px 5px', lineHeight: 1.4 }}>{item.badge}</span>}
    </div>
  );
};
