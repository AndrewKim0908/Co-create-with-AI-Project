import { useEffect, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import Header from '@/components/Header';
import Btn from '@/components/Btn';
import Icon from '@/components/Icon';
import { C } from '@/constants/colors';
import { getProjectById, DEFAULT_PROJECT } from '@/constants/projects';
import { useLang } from '@/i18n/LangContext';
import { supabase } from '@/lib/supabase';
import { fetchProfileFullNamesMap } from '@/utils/supabaseHelpers';
import { normalizeParticipantUserId } from '@/utils/helpers';

const LABEL_STYLE = {
  fontSize: 10,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: C.fg3,
  marginBottom: 4,
};

const VALUE_STYLE = {
  fontSize: 13,
  color: C.fg1,
  lineHeight: 1.5,
};

export default function ConsensusPage() {
  const { t } = useLang();
  const navigate = useNavigate();
  const { projectId } = useParams();
  const location = useLocation();
  const project = getProjectById(projectId) || DEFAULT_PROJECT;

  // AI analysis data passed via navigation state
  const navState = location.state ?? {};
  const conflictTitle   = navState.conflictTitle   ?? null;
  const conflictSummary = navState.conflictSummary ?? null;
  const conflictContent = navState.conflictContent ?? null;
  const resolutionTitle = navState.resolutionTitle ?? null;
  const resolutionDesc  = navState.resolutionDesc  ?? null;

  const [consensusNote, setConsensusNote] = useState(null);
  const [latestSprint, setLatestSprint] = useState(null);
  const [approvers, setApprovers] = useState([]);
  const [conflictExpanded, setConflictExpanded] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    supabase
      .from('projects')
      .select('consensus_note, sprint_number, is_completed, start_date, due_date')
      .eq('id', projectId)
      .single()
      .then(async ({ data }) => {
        if (data?.consensus_note) setConsensusNote(data.consensus_note);
        const sn = data?.sprint_number ?? null;
        if (sn == null) return;
        setLatestSprint(sn);

        // Fetch approvers from sprint_votes
        const { data: votes } = await supabase
          .from('sprint_votes')
          .select('user_id, vote')
          .eq('project_id', projectId)
          .eq('sprint_number', sn)
          .eq('vote', 'approve');

        const ids = (votes || [])
          .map((v) => normalizeParticipantUserId(v.user_id))
          .filter(Boolean);

        if (ids.length > 0) {
          const { profileFullNameById } = await fetchProfileFullNamesMap(supabase, ids);
          setApprovers(ids.map((id) => profileFullNameById[id] || id));
        }
      });
  }, [projectId]);

  const goBack = () =>
    navigate(`/project/${projectId}/sprints`, {
      state: latestSprint != null ? { sprintNumber: latestSprint } : undefined,
    });

  // Computed display values
  const conflictOneLine = conflictTitle ?? conflictSummary ?? t('drConflictVal');
  const hasExpandable = Boolean(conflictContent);

  const resolutionText = resolutionTitle
    ? resolutionDesc
      ? `${resolutionTitle} — ${resolutionDesc}`
      : resolutionTitle
    : t('drResolutionVal');

  const approvalsText =
    approvers.length > 0 ? approvers.join(' · ') : t('drApprovalsVal');

  const noteText = consensusNote ?? t('drOutcomeVal');

  const dateStr = new Date().toISOString().slice(0, 10);

  return (
    <>
      <Header
        title={`${t('sprintLabel')} #${latestSprint ?? project.sprint} — ${project.name}`}
        subtitle={`${t('consensusOutput')} · ${t('consensusOutputSub')}`}
        onBack={goBack}
      />

      <style>{`
        @keyframes consensus-expand {
          from { opacity: 0; max-height: 0; }
          to   { opacity: 1; max-height: 300px; }
        }
      `}</style>

      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}
          style={{ maxWidth: 600, width: '100%' }}
        >
          {/* Success header */}
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: C.emeraldLight,
                border: `2px solid ${C.emerald}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
              }}
            >
              <Icon name="check-circle" size={28} color={C.emerald} />
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: C.fg1, marginBottom: 6 }}>
              {t('consensusTitle')}
            </div>
            <div style={{ fontSize: 14, color: C.fg3 }}>{t('consensusSub')}</div>
          </div>

          {/* Decision Record card */}
          <div
            style={{
              background: C.white,
              borderRadius: 8,
              border: `1px solid ${C.borderSubtle}`,
              boxShadow: '0 4px 16px rgba(30,42,53,0.08)',
              overflow: 'hidden',
            }}
          >
            {/* Card header */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: `1px solid ${C.borderSubtle}`,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <Icon name="file-text" size={16} color={C.fg3} />
              <span style={{ fontSize: 14, fontWeight: 600, color: C.fg1 }}>
                {t('decisionRecord')} #{latestSprint ?? project.sprint}
              </span>
              <span
                style={{
                  marginLeft: 'auto',
                  fontSize: 10,
                  fontFamily: 'monospace',
                  color: C.fg4,
                }}
              >
                {dateStr}
              </span>
            </div>

            {/* Card body */}
            <div
              style={{
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
              }}
            >
              {/* CONFLICT */}
              <div>
                <div style={LABEL_STYLE}>{t('drConflict')}</div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ ...VALUE_STYLE, flex: 1 }}>{conflictOneLine}</div>
                  {hasExpandable && (
                    <button
                      type="button"
                      onClick={() => setConflictExpanded((v) => !v)}
                      title={conflictExpanded ? 'Collapse' : 'Expand'}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '2px 4px',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        transform: conflictExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 200ms ease',
                      }}
                    >
                      <Icon name="chevron-down" size={14} color={C.fg3} />
                    </button>
                  )}
                </div>
                {hasExpandable && conflictExpanded && (
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 12,
                      color: C.fg2,
                      lineHeight: 1.6,
                      borderLeft: `2px solid ${C.borderSubtle}`,
                      paddingLeft: 10,
                      overflow: 'hidden',
                      animation: 'consensus-expand 0.2s ease both',
                    }}
                  >
                    {conflictContent}
                  </div>
                )}
              </div>

              {/* RESOLUTION */}
              <div>
                <div style={LABEL_STYLE}>{t('drResolution')}</div>
                <div style={VALUE_STYLE}>{resolutionText}</div>
              </div>

              {/* APPROVALS */}
              <div>
                <div style={LABEL_STYLE}>{t('drApprovals')}</div>
                <div style={VALUE_STYLE}>{approvalsText}</div>
              </div>

              {/* NOTE */}
              <div>
                <div style={LABEL_STYLE}>{t('drNote')}</div>
                <div style={VALUE_STYLE}>{noteText}</div>
              </div>

              {/* Buttons */}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <Btn
                  variant="primary"
                  size="md"
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  <Icon name="download" size={14} /> {t('exportBtn')}
                </Btn>
                <Btn variant="default" size="md" onClick={goBack}>
                  {t('backSprint')}
                </Btn>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </>
  );
}
