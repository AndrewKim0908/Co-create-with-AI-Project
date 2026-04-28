import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '@/components/Header';
import Btn from '@/components/Btn';
import StatusBadge from '@/components/StatusBadge';
import Icon from '@/components/Icon';
import CollapsibleSection from '@/components/CollapsibleSection';
import { C } from '@/constants/colors';
import { TEAM_DOT } from '@/constants/projects';
import { useLang } from '@/i18n/LangContext';
import { supabase } from '@/lib/supabase';

/** Supabase `projects` row → card UI shape (DB에 없는 필드는 UI용 기본값) */
function mapRowToProject(row, lang) {
  const s = (row.status || 'Pending').toLowerCase();
  const cardStatus =
    s === 'completed' ? 'completed'
    : s === 'archived' ? 'inactive'
    : s === 'active' ? 'active'
    : s === 'pending' ? 'pending'
    : 'pending';

  const locale = lang === 'ko' ? 'ko-KR' : lang === 'zh' ? 'zh-CN' : 'en-US';
  const updated = row.created_at
    ? new Date(row.created_at).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })
    : '';

  return {
    id: row.id,
    name: row.name,
    team: '—',
    status: cardStatus,
    conflicts: 0,
    consensus: 0,
    sprint: 0,
    progress: Math.min(100, Math.max(0, Number(row.progress) || 0)),
    risk: 'low',
    updated,
  };
}

function ProjectCard({ project: p }) {
  const navigate = useNavigate();
  const { t } = useLang();
  const [hov, setHov] = useState(false);

  const riskColor = { high: C.coral,        medium: C.amber,         low: C.emerald };
  const riskLabel = { high: t('riskHigh'),  medium: t('riskMedium'), low: t('riskLow') };
  const dotColor  = TEAM_DOT[p.team] || C.fg3;

  const stripeColor =
    p.status === 'active'    ? C.emerald
    : p.status === 'pending' ? C.amber
    : p.status === 'completed' ? C.fg4
    : C.fg4;

  return (
    <div
      onClick={() => navigate(`/project/${p.id}/sprints`)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: C.white,
        border: `1px solid ${hov ? C.border : C.borderSubtle}`,
        borderRadius: 6,
        boxShadow: hov ? '0 4px 12px rgba(30,42,53,0.10)' : '0 1px 3px rgba(30,42,53,0.07)',
        cursor: 'pointer', transition: 'all 160ms', overflow: 'hidden',
      }}
    >
      <div style={{ height: 3, background: stripeColor }} />
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                fontSize: 13, fontWeight: 600, color: C.fg1,
              }}
            >
              <span
                aria-hidden="true"
                title={p.team}
                style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: dotColor,
                  boxShadow: `0 0 0 2px ${dotColor}22`,
                  flexShrink: 0,
                }}
              />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.name}
              </span>
            </div>
            <div style={{ fontSize: 11, color: C.fg3, marginTop: 4, marginLeft: 16 }}>
              {p.team} · Sprint #{p.sprint}
            </div>
          </div>
          <StatusBadge status={p.status} />
        </div>

        <div
          style={{
            background: C.subtle, borderRadius: 4,
            padding: '8px 10px', display: 'flex', gap: 16,
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: p.conflicts > 0 ? C.coral : C.emerald }}>
              {p.conflicts}
            </div>
            <div style={{ fontSize: 10, color: C.fg3 }}>{t('conflicts')}</div>
          </div>
          <div style={{ width: 1, background: C.border }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.emerald }}>{p.consensus}%</div>
            <div style={{ fontSize: 10, color: C.fg3 }}>{t('consensus')}</div>
          </div>
          <div style={{ width: 1, background: C.border }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: C.fg3 }}>{t('progress')}</span>
              <span style={{ fontSize: 10, fontWeight: 600, color: C.fg2 }}>{p.progress}%</span>
            </div>
            <div style={{ height: 4, background: C.muted, borderRadius: 2 }}>
              <div
                style={{
                  height: 4, background: C.emerald, borderRadius: 2,
                  width: `${p.progress}%`, transition: 'width 300ms',
                }}
              />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: riskColor[p.risk] }} />
            <span style={{ fontSize: 10, color: C.fg3 }}>
              {riskLabel[p.risk]} {t('risk')}
            </span>
          </div>
          <span style={{ fontSize: 10, color: C.fg4 }}>
            {t('updated')} {p.updated}
          </span>
        </div>
      </div>
    </div>
  );
}

function ProjectGrid({ projects }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
      {projects.map((p) => (
        <ProjectCard key={p.id} project={p} />
      ))}
    </div>
  );
}

export default function HubPage({ user }) {
  const { t, lang } = useLang();
  const welcomeName = user?.name || '';
  const [rows, setRows] = useState([]);
  const [loadState, setLoadState] = useState({ status: 'loading' }); // loading | success | error
  const [createOpen, setCreateOpen] = useState(false);
  const [saveState, setSaveState] = useState({ status: 'idle' }); // idle | saving | error
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({
    name: '',
    status: 'Active',
    progress: 0,
  });

  async function fetchProjects(signal) {
    if (!user?.id) return;
    setLoadState({ status: 'loading' });
    const query = supabase
      .from('projects')
      .select('id, name, status, progress, description, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    const { data, error } = signal ? await query.abortSignal(signal) : await query;
    if (signal?.aborted) return;
    if (error) {
      // eslint-disable-next-line no-console
      console.error('[hub/projects] fetch failed:', error);
      setRows([]);
      setLoadState({ status: 'error' });
      return;
    }
    setRows(data || []);
    setLoadState({ status: 'success' });
  }

  useEffect(() => {
    const ac = new AbortController();
    fetchProjects(ac.signal);
    return () => ac.abort();
  }, [user?.id]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(''), 2600);
    return () => clearTimeout(timer);
  }, [notice]);

  const { activeList, doneList } = useMemo(() => {
    if (!rows.length) return { activeList: [], doneList: [] };
    const act = [];
    const done = [];
    for (const row of rows) {
      const card = mapRowToProject(row, lang);
      if ((row.status || '').toLowerCase() === 'completed') done.push(card);
      else act.push(card);
    }
    return { activeList: act, doneList: done };
  }, [rows, lang]);

  const stats = [
    { label: t('kpiActiveProjects'), value: loadState.status === 'success' ? String(activeList.length) : '—',   sub: t('kpiActiveProjectsSub'), color: C.fg1 },
    { label: t('kpiOpenConflicts'),  value: '7',   sub: t('kpiOpenConflictsSub'),  color: C.coral },
    { label: t('kpiConsensus'),      value: '78%', sub: t('kpiConsensusSub'),      color: C.emerald },
    { label: t('kpiSprints'),        value: '52',  sub: t('kpiSprintsSub'),        color: C.fg1 },
  ];

  function projectGridOrMessage(list) {
    if (loadState.status === 'loading') {
      return (
        <div style={{ fontSize: 13, color: C.fg3, padding: '8px 0' }}>
          {t('hubProjectsLoading')}
        </div>
      );
    }
    if (loadState.status === 'error') {
      return (
        <div style={{ fontSize: 13, color: C.coral, padding: '8px 0' }}>
          {t('hubProjectsError')}
        </div>
      );
    }
    if (list.length === 0) {
      return (
        <div style={{ fontSize: 13, color: C.fg3, padding: '8px 0' }}>
          {t('hubNoProjects')}
        </div>
      );
    }
    return <ProjectGrid projects={list} />;
  }

  function openCreateModal() {
    setSaveState({ status: 'idle' });
    setForm({ name: '', status: 'Active', progress: 0 });
    setCreateOpen(true);
  }

  function closeCreateModal() {
    if (saveState.status === 'saving') return;
    setCreateOpen(false);
    setSaveState({ status: 'idle' });
  }

  async function onCreateProject(e) {
    e.preventDefault();
    if (saveState.status === 'saving') return;
    const name = form.name.trim();
    const progress = Math.min(100, Math.max(0, Number(form.progress) || 0));

    if (!name) {
      setSaveState({ status: 'error', message: t('hubCreateNameRequired') });
      return;
    }

    setSaveState({ status: 'saving' });
    const { error } = await supabase.from('projects').insert({
      name,
      status: form.status,
      progress,
      user_id: user?.id,
    });

    if (error) {
      // eslint-disable-next-line no-console
      console.error('[hub/projects] insert failed:', error);
      setSaveState({ status: 'error', message: t('hubCreateError') });
      return;
    }

    setCreateOpen(false);
    setSaveState({ status: 'idle' });
    await fetchProjects();
    setNotice(t('hubCreateSuccess'));
  }

  return (
    <>
      <Header
        title={t('hubTitle')}
        subtitle={`${t('hubWelcome')}, ${welcomeName}`}
      />
      <div
        style={{
          flex: 1, overflow: 'auto', padding: 24,
          display: 'flex', flexDirection: 'column', gap: 20,
        }}
        key={lang}
      >
        {notice ? (
          <div
            style={{
              background: C.emeraldLight,
              border: `1px solid ${C.emeraldBorder}`,
              color: C.emerald,
              borderRadius: 6,
              padding: '10px 12px',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {notice}
          </div>
        ) : null}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
          {stats.map((s) => (
            <div
              key={s.label}
              style={{
                background: C.white, border: `1px solid ${C.borderSubtle}`,
                borderRadius: 6, padding: '14px 16px',
                boxShadow: '0 1px 2px rgba(30,42,53,0.06)',
              }}
            >
              <div
                style={{
                  fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
                  letterSpacing: '0.08em', color: C.fg3, marginBottom: 4,
                }}
              >
                {s.label}
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: s.color, lineHeight: 1 }}>
                {s.value}
              </div>
              <div style={{ fontSize: 11, color: C.fg3, marginTop: 4 }}>{s.sub}</div>
            </div>
          ))}
        </div>

        <CollapsibleSection
          title={t('activeProjects')}
          defaultOpen
          rightSlot={
            <Btn variant="primary" size="sm" onClick={openCreateModal}>
              <Icon name="plus" size={13} /> {t('newProject')}
            </Btn>
          }
        >
          {projectGridOrMessage(activeList)}
        </CollapsibleSection>

        <CollapsibleSection title={t('completedProjects')} defaultOpen={false}>
          {loadState.status === 'loading' || loadState.status === 'error' ? null : projectGridOrMessage(doneList)}
        </CollapsibleSection>
      </div>

      {createOpen ? (
        <div
          role="presentation"
          onClick={closeCreateModal}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(19,28,36,0.42)',
            zIndex: 60,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <form
            onSubmit={onCreateProject}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 460,
              background: C.white,
              border: `1px solid ${C.borderSubtle}`,
              borderRadius: 8,
              boxShadow: '0 20px 48px rgba(19,28,36,0.26)',
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 700, color: C.fg1 }}>
              {t('newProject')}
            </div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 12, color: C.fg2 }}>{t('hubCreateNameLabel')}</span>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder={t('hubCreateNamePlaceholder')}
                disabled={saveState.status === 'saving'}
                style={{
                  border: `1px solid ${C.border}`,
                  borderRadius: 4,
                  height: 36,
                  padding: '0 10px',
                  fontSize: 13,
                  color: C.fg1,
                }}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 12, color: C.fg2 }}>{t('hubCreateStatusLabel')}</span>
              <select
                value={form.status}
                onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
                disabled={saveState.status === 'saving'}
                style={{
                  border: `1px solid ${C.border}`,
                  borderRadius: 4,
                  height: 36,
                  padding: '0 10px',
                  fontSize: 13,
                  color: C.fg1,
                  background: C.white,
                }}
              >
                <option value="Active">Active</option>
                <option value="Pending">Pending</option>
              </select>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 12, color: C.fg2 }}>{t('hubCreateProgressLabel')}</span>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={form.progress}
                onChange={(e) => setForm((prev) => ({ ...prev, progress: e.target.value }))}
                disabled={saveState.status === 'saving'}
                style={{
                  border: `1px solid ${C.border}`,
                  borderRadius: 4,
                  height: 36,
                  padding: '0 10px',
                  fontSize: 13,
                  color: C.fg1,
                }}
              />
            </label>

            {saveState.status === 'error' ? (
              <div style={{ fontSize: 12, color: C.coral }}>{saveState.message}</div>
            ) : null}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
              <Btn variant="default" size="sm" onClick={closeCreateModal} disabled={saveState.status === 'saving'}>
                {t('hubCreateCancel')}
              </Btn>
              <Btn type="submit" variant="primary" size="sm" disabled={saveState.status === 'saving'}>
                {saveState.status === 'saving' ? t('hubCreateSaving') : t('hubCreateSave')}
              </Btn>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
