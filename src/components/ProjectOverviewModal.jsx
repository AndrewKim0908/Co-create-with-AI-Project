import Btn from '@/components/Btn';
import Icon from '@/components/Icon';
import { C } from '@/constants/colors';
import { useLang } from '@/i18n/LangContext';
import { projectShortDescription } from '@/utils/projectDisplay';
import {
  formatProjectDate,
  formatTimelineStatusLabel,
  getProgressTimelineMeta,
} from '@/utils/projectProgress';

function interpolate(template, pct) {
  return String(template || '').replace(/\{\{pct\}\}/g, String(pct));
}

function SectionTitle({ children }) {
  return (
    <div
      style={{
        fontSize: 12,
        fontWeight: 700,
        color: C.fg1,
        letterSpacing: '0.02em',
        marginTop: 12,
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  );
}

function ReadOnlyPriorityRow({
  value,
  leftHint,
  rightHint,
  labelLeft,
  labelRight,
  balancedLabel,
}) {
  const label =
    value === 50
      ? balancedLabel
      : value > 50
        ? interpolate(labelRight, value)
        : interpolate(labelLeft, 100 - value);

  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
          fontSize: 10,
          color: C.fg3,
          marginBottom: 6,
        }}
      >
        <span style={{ flex: 1 }}>{leftHint}</span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: C.fg2,
            whiteSpace: 'nowrap',
            minWidth: 120,
            textAlign: 'center',
          }}
        >
          {label}
        </span>
        <span style={{ flex: 1, textAlign: 'right' }}>{rightHint}</span>
      </div>
      <div style={{ position: 'relative', height: 22, display: 'flex', alignItems: 'center' }}>
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            height: 6,
            borderRadius: 3,
            background: 'linear-gradient(to right, #3A6EA5 0%, #06b6d4 100%)',
            pointerEvents: 'none',
            opacity: 0.5,
          }}
        />
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={value}
          disabled
          readOnly
          tabIndex={-1}
          style={{
            position: 'relative',
            width: '100%',
            height: 22,
            margin: 0,
            background: 'transparent',
            accentColor: value <= 50 ? '#3A6EA5' : '#06b6d4',
            cursor: 'default',
          }}
        />
      </div>
    </div>
  );
}

/**
 * Read-only snapshot of project identity & priorities.
 */
export default function ProjectOverviewModal({ open, isOpen, onClose, project }) {
  const visible = open ?? isOpen ?? false;
  const { t, lang } = useLang();
  if (!visible || !project) return null;

  const shortDesc = projectShortDescription(project);
  const detail = project.description_detail != null ? String(project.description_detail).trim() : '';
  const north = project.north_star != null ? String(project.north_star).trim() : '';

  const pAf = Math.min(100, Math.max(0, Math.round(Number(project.priority_aesthetics_functionality) || 50)));
  const pCq = Math.min(100, Math.max(0, Math.round(Number(project.priority_cost_quality) || 50)));
  const pSs = Math.min(100, Math.max(0, Math.round(Number(project.priority_speed_stability) || 50)));

  const sd = project.start_date ?? null;
  const dd = project.due_date ?? null;
  const timelineMeta = getProgressTimelineMeta(sd, dd);

  return (
    <div
      role="presentation"
      onClick={() => onClose?.()}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(19,28,36,0.42)',
        zIndex: 90,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-labelledby="project-overview-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 520,
          maxHeight: 'min(90vh, 720px)',
          overflowY: 'auto',
          background: C.white,
          border: `1px solid ${C.borderSubtle}`,
          borderRadius: 8,
          boxShadow: '0 20px 48px rgba(19,28,36,0.26)',
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <div
          id="project-overview-title"
          style={{ fontSize: 16, fontWeight: 700, color: C.fg1, marginBottom: 4 }}
        >
          {t('projectOverview')}
        </div>

        <SectionTitle>{t('overviewProjectName')}</SectionTitle>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.fg1, lineHeight: 1.3 }}>
          {project.name || '—'}
        </div>

        <SectionTitle>{t('overviewDescription')}</SectionTitle>
        <div style={{ fontSize: 13, color: C.fg2, lineHeight: 1.45 }}>{shortDesc || '—'}</div>

        <SectionTitle>{t('overviewDetailedDescription')}</SectionTitle>
        <div style={{ fontSize: 13, color: C.fg2, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
          {detail || '—'}
        </div>

        <SectionTitle>{t('projectTimeline')}</SectionTitle>
        {sd && dd ? (
          <>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 13,
                color: C.fg2,
                flexWrap: 'wrap',
              }}
            >
              <Icon name="calendar" size={16} color={C.fg3} />
              <span>{formatProjectDate(sd, lang)}</span>
              <span aria-hidden="true">{t('projectDateRangeArrow')}</span>
              <span>{formatProjectDate(dd, lang)}</span>
            </div>
            <div style={{ fontSize: 12, color: C.fg3, marginTop: 6 }}>
              {t('progress')}: {timelineMeta.progress}% · {formatTimelineStatusLabel(t, timelineMeta)}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 13, color: C.fg3 }}>{t('overviewTimelineIncomplete')}</div>
        )}

        <SectionTitle>{t('overviewNorthStar')}</SectionTitle>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <span aria-hidden style={{ fontSize: 16 }}>
            ⭐
          </span>
          <div style={{ fontSize: 13, color: C.fg2, lineHeight: 1.45, flex: 1 }}>{north || '—'}</div>
        </div>

        <SectionTitle>{t('conflictPriorities')}</SectionTitle>
        <div style={{ fontSize: 11, color: C.fg3, marginBottom: 4 }}>{t('newProjectPriorityIntro')}</div>

        <ReadOnlyPriorityRow
          value={pAf}
          leftHint={t('newProjectPriorityAesthetics')}
          rightHint={t('newProjectPriorityFunctionality')}
          labelLeft={t('newProjectPriAfLeft')}
          labelRight={t('newProjectPriAfRight')}
          balancedLabel={t('newProjectPriorityBalanced')}
        />
        <ReadOnlyPriorityRow
          value={pCq}
          leftHint={t('newProjectPriorityCost')}
          rightHint={t('newProjectPriorityQuality')}
          labelLeft={t('newProjectPriCqLeft')}
          labelRight={t('newProjectPriCqRight')}
          balancedLabel={t('newProjectPriorityBalanced')}
        />
        <ReadOnlyPriorityRow
          value={pSs}
          leftHint={t('newProjectPrioritySpeed')}
          rightHint={t('newProjectPriorityStability')}
          labelLeft={t('newProjectPriSsLeft')}
          labelRight={t('newProjectPriSsRight')}
          balancedLabel={t('newProjectPriorityBalanced')}
        />

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <Btn variant="primary" size="sm" type="button" onClick={() => onClose?.()}>
            {t('overviewClose')}
          </Btn>
        </div>
      </div>
    </div>
  );
}
