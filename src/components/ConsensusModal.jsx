import { useState } from 'react';
import { motion } from 'framer-motion';
import Icon from '@/components/Icon';
import Btn from '@/components/Btn';
import { C } from '@/constants/colors';
import { useLang } from '@/i18n/LangContext';

const LABEL = {
  fontSize: 10,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: C.fg3,
  marginBottom: 4,
};
const VALUE = { fontSize: 13, color: C.fg1, lineHeight: 1.5 };

export default function ConsensusModal({ data, project, onClose }) {
  const { t } = useLang();
  const [conflictExpanded, setConflictExpanded] = useState(false);

  const {
    conflictTitle   = null,
    conflictSummary = null,
    conflictContent = null,
    resolutionTitle = null,
    resolutionDesc  = null,
    approverNames   = [],
    consensusNote   = '',
    sprintNumber    = null,
    isAiPath        = false,
  } = data ?? {};

  const conflictOneLine = conflictTitle ?? conflictSummary ?? t('drConflictVal');
  const hasExpandable   = Boolean(conflictContent);

  const resolutionText = resolutionTitle
    ? resolutionDesc
      ? `${resolutionTitle} — ${resolutionDesc}`
      : resolutionTitle
    : t('drResolutionVal');

  const participantsText = approverNames.length > 0
    ? approverNames.join(' · ')
    : t('drApprovalsVal');

  const noteText = isAiPath
    ? t('drAiConsensusNote')
    : (consensusNote || t('drOutcomeVal'));

  const dateStr = new Date().toISOString().slice(0, 10);

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(19,28,36,0.58)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        overflowY: 'auto',
      }}
    >
      <style>{`
        @keyframes consensus-expand {
          from { opacity: 0; max-height: 0; }
          to   { opacity: 1; max-height: 300px; }
        }
      `}</style>

      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.2, 0, 0, 1] }}
        style={{ width: '100%', maxWidth: 560 }}
      >
        {/* Success header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              background: 'rgba(6,182,212,0.2)',
              border: '2px solid rgba(6,182,212,0.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 14px',
            }}
          >
            <Icon name="check-circle" size={26} color={C.emerald} />
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 5 }}>
            {t('consensusTitle')}
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)' }}>
            {`Sprint #${sprintNumber ?? project?.sprint}`}
          </div>
        </div>

        {/* Decision Record card */}
        <div
          style={{
            background: C.white,
            borderRadius: 10,
            border: `1px solid ${C.borderSubtle}`,
            boxShadow: '0 8px 32px rgba(30,42,53,0.22)',
            overflow: 'hidden',
          }}
        >
          {/* Card header */}
          <div
            style={{
              padding: '14px 18px',
              borderBottom: `1px solid ${C.borderSubtle}`,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <Icon name="file-text" size={15} color={C.fg3} />
            <span style={{ fontSize: 13, fontWeight: 600, color: C.fg1 }}>
              {t('decisionRecord')} #{sprintNumber ?? project?.sprint}
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

          {/* Card body — order: CONFLICT → RESOLUTION → NOTE → PARTICIPANTS */}
          <div
            style={{
              padding: '18px',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            {/* CONFLICT */}
            <div>
              <div style={LABEL}>{t('drConflict')}</div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ ...VALUE, flex: 1 }}>{conflictOneLine}</div>
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
                    <Icon name="chevron-down" size={13} color={C.fg3} />
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
              <div style={LABEL}>{t('drResolution')}</div>
              <div style={VALUE}>{resolutionText}</div>
            </div>

            {/* NOTE */}
            <div>
              <div style={LABEL}>{t('drNote')}</div>
              <div style={VALUE}>{noteText}</div>
            </div>

            {/* PARTICIPANTS */}
            <div>
              <div style={LABEL}>{t('drParticipants')}</div>
              <div style={VALUE}>{participantsText}</div>
            </div>

            {/* Back to sprint button */}
            <Btn
              variant="primary"
              size="md"
              onClick={onClose}
              style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}
            >
              {t('backSprint')}
            </Btn>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
