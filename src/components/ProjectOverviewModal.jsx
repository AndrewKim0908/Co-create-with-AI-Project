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
import { getProjectPriorities, getImportanceMeta } from '@/utils/projectPriorities';

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

function ReadOnlyPriorityRow({ label, value }) {
  const importance = getImportanceMeta(value);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
      <div style={{ width: 144, flexShrink: 0, fontSize: 12, fontWeight: 600, color: C.fg1 }}>
        {label}
      </div>
      <div style={{ flex: 1, position: 'relative', height: 22, display: 'flex', alignItems: 'center', minWidth: 0 }}>
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            height: 6,
            borderRadius: 3,
            background: `linear-gradient(to right, #e5e7eb 0%, ${importance.color} 100%)`,
            pointerEvents: 'none',
            opacity: 0.6,
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
            accentColor: importance.color,
            cursor: 'default',
          }}
        />
      </div>
      <div style={{ width: 32, flexShrink: 0, textAlign: 'right', fontSize: 11, fontWeight: 700, color: C.fg2, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      <div style={{ width: 110, flexShrink: 0, fontSize: 11, fontWeight: 600, color: importance.color, textAlign: 'left' }}>
        {importance.label}
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

  const priorities = getProjectPriorities(project);

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
        <div style={{ fontSize: 11, color: C.fg3, marginBottom: 8 }}>
          Set how much each factor matters in this project (0 = ignore, 100 = critical)
        </div>

        {priorities.length === 0 ? (
          <div style={{ fontSize: 12, color: C.fg3 }}>—</div>
        ) : (
          priorities.map((p, i) => (
            <ReadOnlyPriorityRow key={`${p.label}-${i}`} label={p.label} value={p.value} />
          ))
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <Btn variant="primary" size="sm" type="button" onClick={() => onClose?.()}>
            {t('overviewClose')}
          </Btn>
        </div>
      </div>
    </div>
  );
}
