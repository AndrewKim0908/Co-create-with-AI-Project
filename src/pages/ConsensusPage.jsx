import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import Header from '@/components/Header';
import Btn from '@/components/Btn';
import Icon from '@/components/Icon';
import { C } from '@/constants/colors';
import { getProjectById, DEFAULT_PROJECT } from '@/constants/projects';
import { useLang } from '@/i18n/LangContext';
import { supabase } from '@/lib/supabase';

export default function ConsensusPage() {
  const { t } = useLang();
  const navigate = useNavigate();
  const { projectId } = useParams();
  const project = getProjectById(projectId) || DEFAULT_PROJECT;

  const [consensusNote, setConsensusNote] = useState(null);
  const [latestSprint, setLatestSprint] = useState(null);

  useEffect(() => {
    if (!projectId) return;
    supabase
      .from('projects')
      .select('consensus_note, sprint_number, is_completed, start_date, due_date')
      .eq('id', projectId)
      .single()
      .then(({ data }) => {
        if (data?.consensus_note) setConsensusNote(data.consensus_note);
        if (data?.sprint_number != null) setLatestSprint(data.sprint_number);
      });
  }, [projectId]);

  const goBack = () =>
    navigate(`/project/${projectId}/sprints`, {
      state: latestSprint != null ? { sprintNumber: latestSprint } : undefined,
    });

  const outcomeValue = consensusNote ?? t('drOutcomeVal');

  const rows = [
    { label: t('drConflict'),   value: t('drConflictVal') },
    { label: t('drResolution'), value: t('drResolutionVal') },
    { label: t('drOutcome'),    value: outcomeValue },
    { label: t('drApprovals'),  value: t('drApprovalsVal') },
  ];

  return (
    <>
      <Header
        title={`${t('sprintLabel')} #${project.sprint} — ${project.name}`}
        subtitle={`${t('consensusOutput')} · ${t('consensusOutputSub')}`}
        onBack={goBack}
      />
      <div
        style={{
          flex: 1, overflow: 'auto', padding: 40,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}
          style={{ maxWidth: 600, width: '100%' }}
        >
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div
              style={{
                width: 56, height: 56, borderRadius: '50%',
                background: C.emeraldLight,
                border: `2px solid ${C.emerald}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
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

          <div
            style={{
              background: C.white, borderRadius: 8,
              border: `1px solid ${C.borderSubtle}`,
              boxShadow: '0 4px 16px rgba(30,42,53,0.08)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '16px 20px',
                borderBottom: `1px solid ${C.borderSubtle}`,
                display: 'flex', alignItems: 'center', gap: 10,
              }}
            >
              <Icon name="file-text" size={16} color={C.fg3} />
              <span style={{ fontSize: 14, fontWeight: 600, color: C.fg1 }}>
                {t('decisionRecord')}
              </span>
              <span
                style={{
                  marginLeft: 'auto', fontSize: 10,
                  fontFamily: 'monospace', color: C.fg4,
                }}
              >
                2026-04-24 14:32 KST
              </span>
            </div>

            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {rows.map((r) => (
                <div key={r.label}>
                  <div
                    style={{
                      fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
                      letterSpacing: '0.08em', color: C.fg3, marginBottom: 4,
                    }}
                  >
                    {r.label}
                  </div>
                  <div style={{ fontSize: 13, color: C.fg1, lineHeight: 1.5 }}>
                    {r.value}
                  </div>
                </div>
              ))}
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
