import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '@/components/Header';
import Btn from '@/components/Btn';
import Icon from '@/components/Icon';
import CollapsibleSection from '@/components/CollapsibleSection';
import { C } from '@/constants/colors';
import { useLang } from '@/i18n/LangContext';
import { supabase } from '@/lib/supabase';
import NewProjectModal from '@/components/NewProjectModal';
import EditProjectModal from '@/components/EditProjectModal';
import ProjectOverviewModal from '@/components/ProjectOverviewModal';
import { projectShortDescription } from '@/utils/projectDisplay';
import {
  calculateDateProgress,
  formatTimelineStatusLabel,
  getProgressTimelineMeta,
} from '@/utils/projectProgress';

/** Supabase `projects` row → card UI shape (DB에 없는 필드는 UI용 기본값) */
function mapRowToProject(row, lang, userId) {
  const locale = lang === 'ko' ? 'ko-KR' : lang === 'zh' ? 'zh-CN' : 'en-US';
  const updated = row.created_at
    ? new Date(row.created_at).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })
    : '';

  const startDate = row.start_date ?? null;
  const dueDate = row.due_date ?? null;
  const progressMeta = getProgressTimelineMeta(startDate, dueDate);

  return {
    id: row.id,
    name: row.name,
    description: projectShortDescription(row),
    conflicts: 0,
    consensus: 0,
    sprint: Number(row.sprint_number) || 0,
    progress: progressMeta.progress,
    start_date: startDate,
    due_date: dueDate,
    progressMeta,
    updated,
    is_completed: Boolean(row.is_completed),
    canManage: Boolean(userId && row.user_id === userId),
  };
}

const MENU_ITEM_BTN = {
  width: '100%',
  border: 'none',
  background: 'transparent',
  textAlign: 'left',
  borderRadius: 6,
  padding: '7px 8px',
  fontSize: 12.5,
  color: C.fg1,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

function ProjectCard({
  project: p,
  onEditSettings,
  onViewOverview,
  onToggleCompleted,
  onDeleteProject,
  completedSection,
}) {
  const navigate = useNavigate();
  const { t } = useLang();
  const [hov, setHov] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  /** Single source for bar width + % text (ignore DB `progress` when dates drive the UI). */
  const timelineMeta = getProgressTimelineMeta(p.start_date ?? null, p.due_date ?? null);
  const calculatedProgress = timelineMeta.progress;

  const progressStatusColor =
    p.due_date && timelineMeta.variant === 'overdue'
      ? '#dc2626'
      : p.due_date && timelineMeta.variant === 'warning'
        ? '#ea580c'
        : C.fg3;

  const stripeColor = completedSection ? '#94a3b8' : C.emerald;
  const cardBg = completedSection ? '#eef0f3' : C.white;
  const cardBorder = completedSection ? '#d8dce2' : undefined;

  useEffect(() => {
    if (!menuOpen) return undefined;
    function onDocDown(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [menuOpen]);

  return (
    <div
      onClick={() => navigate(`/project/${p.id}/sprints`)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: cardBg,
        border: `1px solid ${cardBorder ?? (hov ? C.border : C.borderSubtle)}`,
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
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                minWidth: 0,
                flexWrap: 'wrap',
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: C.fg1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  minWidth: 0,
                  flex: '1 1 auto',
                }}
              >
                {p.name}
              </div>
              {p.canManage ? (
                <span
                  style={{
                    padding: '2px 8px',
                    background: C.emeraldLight,
                    color: C.emerald,
                    border: `1px solid ${C.emeraldBorder}`,
                    borderRadius: 4,
                    fontSize: 10,
                    fontWeight: 600,
                    flexShrink: 0,
                  }}
                >
                  {t('hubOwnerBadge')}
                </span>
              ) : null}
            </div>
            <div style={{ fontSize: 11, color: C.fg3, marginTop: 4 }}>
              Sprint #{p.sprint}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div ref={menuRef} style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen((prev) => !prev);
                }}
                aria-label="Project menu"
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  border: `1px solid ${C.borderSubtle}`,
                  background: menuOpen ? C.subtle : completedSection ? '#e4e7eb' : C.white,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: C.fg3,
                  cursor: 'pointer',
                }}
              >
                <Icon name="more-vertical" size={15} color={C.fg3} />
              </button>

              {menuOpen ? (
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    position: 'absolute',
                    top: 32,
                    right: 0,
                    minWidth: 168,
                    background: C.white,
                    border: `1px solid ${C.borderSubtle}`,
                    borderRadius: 8,
                    boxShadow: '0 10px 26px rgba(30,42,53,0.16)',
                    padding: 6,
                    zIndex: 20,
                  }}
                >
                  {p.canManage ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          onEditSettings?.(p.id);
                        }}
                        style={MENU_ITEM_BTN}
                      >
                        {t('hubEditSettings')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          onToggleCompleted?.(p.id, p.is_completed);
                        }}
                        style={MENU_ITEM_BTN}
                      >
                        {p.is_completed ? t('hubMarkActive') : t('hubMarkCompleted')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          onDeleteProject?.(p.id);
                        }}
                        style={{ ...MENU_ITEM_BTN, color: C.coral }}
                      >
                        {t('hubDeleteProject')}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onViewOverview?.(p.id);
                      }}
                      style={MENU_ITEM_BTN}
                    >
                      {t('hubViewOverview')}
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          </div>
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
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, gap: 6 }}>
              <span style={{ fontSize: 10, color: C.fg3 }}>{t('progress')}</span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: C.fg2,
                  textAlign: 'right',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: '58%',
                }}
              >
                {calculatedProgress}%
                {p.due_date ? (
                  <span style={{ fontWeight: 500, color: progressStatusColor }}>
                    {' '}
                    · {formatTimelineStatusLabel(t, timelineMeta)}
                  </span>
                ) : null}
              </span>
            </div>
            <div style={{ height: 4, background: C.muted, borderRadius: 2 }}>
              <div
                style={{
                  height: 4, background: C.emerald, borderRadius: 2,
                  width: `${calculatedProgress}%`, transition: 'width 300ms',
                }}
              />
            </div>
          </div>
        </div>

        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            fontSize: 11,
            color: C.fg3,
            lineHeight: 1.4,
            minHeight: 18,
            marginTop: -2,
          }}
        >
          {p.description || '—'}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <span style={{ fontSize: 10, color: C.fg4 }}>
            {t('updated')} {p.updated}
          </span>
        </div>
      </div>
    </div>
  );
}

function ProjectGrid({
  projects,
  onEditSettings,
  onViewOverview,
  onToggleCompleted,
  onDeleteProject,
  completedSection,
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
      {projects.map((p) => (
        <ProjectCard
          key={p.id}
          project={p}
          onEditSettings={onEditSettings}
          onViewOverview={onViewOverview}
          onToggleCompleted={onToggleCompleted}
          onDeleteProject={onDeleteProject}
          completedSection={completedSection}
        />
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
  const [notice, setNotice] = useState('');
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const [overviewModalOpen, setOverviewModalOpen] = useState(false);
  const [overviewProjectRow, setOverviewProjectRow] = useState(null);

  async function fetchProjects(signal) {
    if (!user?.id) return;
    setLoadState({ status: 'loading' });
    const ownedQuery = supabase
      .from('projects')
      .select(
        'id, user_id, name, progress, is_completed, description, description_short, description_detail, north_star, sprint_number, created_at, start_date, due_date, priority_aesthetics_functionality, priority_cost_quality, priority_speed_stability, priorities',
      )
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    const { data: ownedData, error: ownedError } = signal
      ? await ownedQuery.abortSignal(signal)
      : await ownedQuery;
    if (signal?.aborted) return;
    if (ownedError) {
      // eslint-disable-next-line no-console
      console.error('[hub/projects] fetch failed:', ownedError);
      setRows([]);
      setLoadState({ status: 'error' });
      return;
    }

    let invitedProjects = [];
    const normalizedEmail = (user.email || '').trim().toLowerCase();
    if (normalizedEmail) {
      const invitedIdsQuery = supabase
        .from('project_members')
        .select('project_id')
        .eq('invited_email', normalizedEmail)
        .in('status', ['pending', 'accepted']);
      const { data: inviteRows, error: inviteError } = signal
        ? await invitedIdsQuery.abortSignal(signal)
        : await invitedIdsQuery;
      if (!inviteError && inviteRows?.length) {
        const invitedIds = Array.from(new Set(inviteRows.map((x) => x.project_id).filter(Boolean)));
        if (invitedIds.length) {
          const invitedProjectsQuery = supabase
            .from('projects')
            .select(
              'id, user_id, name, progress, is_completed, description, description_short, description_detail, north_star, sprint_number, created_at, start_date, due_date, priority_aesthetics_functionality, priority_cost_quality, priority_speed_stability, priorities',
            )
            .in('id', invitedIds)
            .order('created_at', { ascending: false });
          const { data: invitedRows, error: invitedProjectsError } = signal
            ? await invitedProjectsQuery.abortSignal(signal)
            : await invitedProjectsQuery;
          if (!invitedProjectsError) {
            invitedProjects = invitedRows || [];
          }
        }
      }
    }

    const merged = [...(ownedData || []), ...invitedProjects];
    const deduped = Array.from(new Map(merged.map((row) => [row.id, row])).values());
    setRows(deduped);
    setLoadState({ status: 'success' });
  }

  useEffect(() => {
    const ac = new AbortController();
    fetchProjects(ac.signal);
    return () => ac.abort();
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return undefined;
    const channel = supabase
      .channel(`projects-realtime-${user.id}-all`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'projects' },
        () => {
          fetchProjects();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'project_members' },
        () => {
          fetchProjects();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(''), 2600);
    return () => clearTimeout(timer);
  }, [notice]);

  const activeProjectList = useMemo(() => {
    const activeRows = rows.filter((row) => !row.is_completed);
    return activeRows.map((row) => mapRowToProject(row, lang, user?.id));
  }, [rows, lang, user?.id]);

  const completedProjectList = useMemo(() => {
    const doneRows = rows.filter((row) => row.is_completed);
    return doneRows.map((row) => mapRowToProject(row, lang, user?.id));
  }, [rows, lang, user?.id]);

  const stats = [
    {
      label: t('kpiActiveProjects'),
      value: loadState.status === 'success' ? String(activeProjectList.length) : '—',
      sub: t('kpiActiveProjectsSub'),
      color: C.fg1,
    },
    { label: t('kpiOpenConflicts'),  value: '7',   sub: t('kpiOpenConflictsSub'),  color: C.coral },
    { label: t('kpiConsensus'),      value: '78%', sub: t('kpiConsensusSub'),      color: C.emerald },
    { label: t('kpiSprints'),        value: '52',  sub: t('kpiSprintsSub'),        color: C.fg1 },
  ];

  async function toggleCompleted(projectId, currentValue) {
    if (!user?.id) return;
    const next = !currentValue;
    const prevRows = rows;
    setRows((prev) =>
      prev.map((row) => (row.id === projectId ? { ...row, is_completed: next } : row)),
    );
    const { error } = await supabase
      .from('projects')
      .update({ is_completed: next })
      .eq('id', projectId)
      .eq('user_id', user.id);
    if (error) {
      // eslint-disable-next-line no-console
      console.error('[hub/projects] toggle completed failed:', error);
      setRows(prevRows);
      setNotice(t('hubToggleCompletedFailed'));
      return;
    }
    setNotice(lang === 'ko' ? '프로젝트 상태가 업데이트되었습니다.' : 'Project status updated.');
  }

  async function deleteProject(projectId) {
    if (!user?.id) return;
    // eslint-disable-next-line no-alert
    if (!window.confirm(t('hubDeleteConfirm'))) return;
    const prevRows = rows;
    setRows((prev) => prev.filter((row) => row.id !== projectId));
    const { error } = await supabase.from('projects').delete().eq('id', projectId).eq('user_id', user.id);
    if (error) {
      // eslint-disable-next-line no-console
      console.error('[hub/projects] delete failed:', error);
      setRows(prevRows);
      setNotice(t('hubDeleteFailed'));
      return;
    }
    setNotice(lang === 'ko' ? '프로젝트가 삭제되었습니다.' : 'Project deleted.');
  }

  async function handleProjectUpdate(projectId, updates) {
    if (!user?.id) return false;
    const start = updates.startDate?.trim() || null;
    const due = updates.dueDate?.trim() || null;
    const nextProgress = start && due ? calculateDateProgress(start, due) : 0;
    const { error } = await supabase
      .from('projects')
      .update({
        name: updates.name,
        description_short: updates.descriptionShort,
        description: updates.descriptionShort,
        description_detail: updates.descriptionDetail || null,
        north_star: updates.northStar,
        priorities: updates.priorities ?? null,
        priority_aesthetics_functionality: null,
        priority_cost_quality: null,
        priority_speed_stability: null,
        start_date: start,
        due_date: due,
        progress: nextProgress,
        updated_at: new Date().toISOString(),
      })
      .eq('id', projectId)
      .eq('user_id', user.id);
    if (error) {
      // eslint-disable-next-line no-console
      console.error('[hub/projects] update settings failed:', error);
      return false;
    }
    await fetchProjects();
    setNotice(t('editProjectUpdated'));
    return true;
  }

  function openEditProject(projectId) {
    const row = rows.find((r) => r.id === projectId);
    if (row) {
      setSelectedProject(row);
      setEditModalOpen(true);
    }
  }

  function closeEditModal() {
    setEditModalOpen(false);
    setSelectedProject(null);
  }

  function openProjectOverview(projectId) {
    const row = rows.find((r) => r.id === projectId);
    if (row) {
      setOverviewProjectRow(row);
      setOverviewModalOpen(true);
    }
  }

  function closeOverviewModal() {
    setOverviewModalOpen(false);
    setOverviewProjectRow(null);
  }

  function projectGridOrMessage(list, options = {}) {
    const { emptyMessage, completedSection } = options;
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
          {emptyMessage ?? t('hubNoProjects')}
        </div>
      );
    }
    return (
      <ProjectGrid
        projects={list}
        onEditSettings={openEditProject}
        onViewOverview={openProjectOverview}
        onToggleCompleted={toggleCompleted}
        onDeleteProject={deleteProject}
        completedSection={completedSection}
      />
    );
  }

  function openCreateModal() {
    setCreateOpen(true);
  }

  function closeCreateModal() {
    setCreateOpen(false);
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
          {projectGridOrMessage(activeProjectList)}
        </CollapsibleSection>

        <div
          style={{
            marginTop: 8,
            background: '#e8eaee',
            border: `1px solid ${C.borderSubtle}`,
            borderRadius: 8,
            padding: '12px 14px 14px',
          }}
        >
          <CollapsibleSection title={t('completedProjects')} defaultOpen={false}>
            {projectGridOrMessage(completedProjectList, {
              emptyMessage: t('hubNoCompletedProjects'),
              completedSection: true,
            })}
          </CollapsibleSection>
        </div>
      </div>

      <NewProjectModal
        open={createOpen}
        variant="modal"
        userId={user?.id}
        onClose={closeCreateModal}
        onCreated={async () => {
          await fetchProjects();
          setNotice(t('hubCreateSuccess'));
        }}
      />

      <EditProjectModal
        open={editModalOpen}
        onClose={closeEditModal}
        project={selectedProject}
        onSave={handleProjectUpdate}
      />

      <ProjectOverviewModal
        open={overviewModalOpen}
        onClose={closeOverviewModal}
        project={overviewProjectRow}
      />
    </>
  );
}
