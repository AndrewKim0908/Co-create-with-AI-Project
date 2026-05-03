import { useEffect, useState } from 'react';
import Btn from '@/components/Btn';
import { C } from '@/constants/colors';
import { useLang } from '@/i18n/LangContext';
import { projectShortDescription } from '@/utils/projectDisplay';
import { isDueDateBeforeStart } from '@/utils/projectProgress';

const INITIAL_FORM = {
  name: '',
  descriptionShort: '',
  descriptionDetail: '',
  northStar: '',
  startDate: '',
  dueDate: '',
  priorityAestheticsFunctionality: 50,
  priorityCostQuality: 50,
  prioritySpeedStability: 50,
};

function interpolate(template, pct) {
  return String(template || '').replace(/\{\{pct\}\}/g, String(pct));
}

function rowToForm(row) {
  if (!row || typeof row !== 'object') return { ...INITIAL_FORM };
  return {
    name: row.name ?? '',
    descriptionShort: projectShortDescription(row),
    descriptionDetail: row.description_detail != null ? String(row.description_detail) : '',
    northStar: row.north_star != null ? String(row.north_star) : '',
    priorityAestheticsFunctionality: Math.min(
      100,
      Math.max(0, Math.round(Number(row.priority_aesthetics_functionality) || 50)),
    ),
    priorityCostQuality: Math.min(
      100,
      Math.max(0, Math.round(Number(row.priority_cost_quality) || 50)),
    ),
    prioritySpeedStability: Math.min(
      100,
      Math.max(0, Math.round(Number(row.priority_speed_stability) || 50)),
    ),
    startDate: row.start_date ? String(row.start_date).slice(0, 10) : '',
    dueDate: row.due_date ? String(row.due_date).slice(0, 10) : '',
  };
}

function PrioritySliderRow({
  value,
  onChange,
  leftHint,
  rightHint,
  labelLeft,
  labelRight,
  balancedLabel,
  disabled,
}) {
  const label =
    value === 50
      ? balancedLabel
      : value > 50
        ? interpolate(labelRight, value)
        : interpolate(labelLeft, 100 - value);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
          fontSize: 10,
          color: C.fg3,
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
      <div
        style={{
          position: 'relative',
          height: 22,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            height: 6,
            borderRadius: 3,
            background: 'linear-gradient(to right, #3A6EA5 0%, #1E8A5A 100%)',
            pointerEvents: 'none',
          }}
        />
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{
            position: 'relative',
            width: '100%',
            height: 22,
            margin: 0,
            background: 'transparent',
            accentColor: value <= 50 ? '#3A6EA5' : '#1E8A5A',
          }}
        />
      </div>
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <div
      style={{
        fontSize: 12,
        fontWeight: 700,
        color: C.fg1,
        letterSpacing: '0.02em',
        marginTop: 4,
      }}
    >
      {children}
    </div>
  );
}

/**
 * @param {boolean} [open] — modal visibility (`isOpen` accepted as alias)
 * @param {() => void} onClose
 * @param {object | null} project — raw `projects` row from Supabase
 * @param {(projectId: string, updates: object) => Promise<boolean>} onSave — return true on success
 */
export default function EditProjectModal({ open, isOpen, onClose, project, onSave }) {
  const visible = open ?? isOpen ?? false;
  const { t } = useLang();
  const [form, setForm] = useState(() => ({ ...INITIAL_FORM }));
  const [saveState, setSaveState] = useState({ status: 'idle', message: '' });

  useEffect(() => {
    if (visible && project) {
      setForm(rowToForm(project));
      setSaveState({ status: 'idle', message: '' });
    }
  }, [visible, project]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (saveState.status === 'saving' || !project?.id || !onSave) return;

    const name = form.name.trim();
    const descriptionShort = form.descriptionShort.trim();
    const northStar = form.northStar.trim();
    const descriptionDetail = form.descriptionDetail.trim();

    if (!name) {
      setSaveState({ status: 'error', message: t('hubCreateNameRequired') });
      return;
    }
    if (!descriptionShort) {
      setSaveState({ status: 'error', message: t('newProjectShortRequired') });
      return;
    }
    if (!northStar) {
      setSaveState({ status: 'error', message: t('newProjectNorthStarRequired') });
      return;
    }

    const sd = form.startDate.trim();
    const dd = form.dueDate.trim();
    if (sd && dd && isDueDateBeforeStart(sd, dd)) {
      setSaveState({ status: 'error', message: t('projectDueBeforeStart') });
      return;
    }

    const pAf = Math.min(100, Math.max(0, Math.round(Number(form.priorityAestheticsFunctionality) || 50)));
    const pCq = Math.min(100, Math.max(0, Math.round(Number(form.priorityCostQuality) || 50)));
    const pSs = Math.min(100, Math.max(0, Math.round(Number(form.prioritySpeedStability) || 50)));

    const updates = {
      name,
      descriptionShort,
      descriptionDetail,
      northStar,
      startDate: sd,
      dueDate: dd,
      priorityAestheticsFunctionality: pAf,
      priorityCostQuality: pCq,
      prioritySpeedStability: pSs,
    };

    setSaveState({ status: 'saving', message: '' });

    try {
      const ok = await onSave(project.id, updates);
      if (ok) {
        setSaveState({ status: 'idle', message: '' });
        onClose?.();
      } else {
        setSaveState({ status: 'error', message: t('editProjectSaveError') });
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[EditProjectModal] onSave failed:', err);
      setSaveState({ status: 'error', message: t('editProjectSaveError') });
    }
  }

  const disabled = saveState.status === 'saving';

  const formBody = (
    <form
      onSubmit={handleSubmit}
      onClick={(e) => e.stopPropagation()}
      style={{
        width: '100%',
        maxWidth: 520,
        background: C.white,
        border: `1px solid ${C.borderSubtle}`,
        borderRadius: 8,
        boxShadow: '0 20px 48px rgba(19,28,36,0.26)',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        maxHeight: 'min(90vh, 720px)',
        overflowY: 'auto',
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 700, color: C.fg1 }}>{t('editProjectTitle')}</div>

      <SectionTitle>{t('newProjectSectionIdentity')}</SectionTitle>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 12, color: C.fg2 }}>{t('hubCreateNameLabel')}</span>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
          placeholder={t('hubCreateNamePlaceholder')}
          disabled={disabled}
          style={{
            border: `1px solid ${C.border}`,
            borderRadius: 4,
            height: 36,
            padding: '0 10px',
            fontSize: 13,
            color: C.fg1,
            fontFamily: 'inherit',
          }}
        />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 12, color: C.fg2 }}>{t('newProjectShortDescLabel')}</span>
        <input
          type="text"
          value={form.descriptionShort}
          onChange={(e) => setForm((prev) => ({ ...prev, descriptionShort: e.target.value }))}
          placeholder={t('newProjectShortDescPlaceholder')}
          disabled={disabled}
          style={{
            border: `1px solid ${C.border}`,
            borderRadius: 4,
            height: 36,
            padding: '0 10px',
            fontSize: 13,
            color: C.fg1,
            fontFamily: 'inherit',
          }}
        />
      </label>

      <SectionTitle>{t('projectTimeline')}</SectionTitle>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 12, color: C.fg2 }}>{t('projectStartDateOptional')}</span>
        <input
          type="date"
          value={form.startDate}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, startDate: e.target.value }))
          }
          disabled={disabled}
          style={{
            border: `1px solid ${C.border}`,
            borderRadius: 4,
            height: 36,
            padding: '0 10px',
            fontSize: 13,
            color: C.fg1,
            fontFamily: 'inherit',
          }}
        />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 12, color: C.fg2 }}>{t('projectDueDateOptional')}</span>
        <input
          type="date"
          value={form.dueDate}
          min={form.startDate || undefined}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, dueDate: e.target.value }))
          }
          disabled={disabled}
          style={{
            border: `1px solid ${C.border}`,
            borderRadius: 4,
            height: 36,
            padding: '0 10px',
            fontSize: 13,
            color: C.fg1,
            fontFamily: 'inherit',
          }}
        />
      </label>

      <SectionTitle>{t('newProjectDetailSection')}</SectionTitle>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 12, color: C.fg2 }}>{t('newProjectDetailLabel')}</span>
        <textarea
          value={form.descriptionDetail}
          onChange={(e) => setForm((prev) => ({ ...prev, descriptionDetail: e.target.value }))}
          placeholder={t('newProjectDetailPlaceholder')}
          disabled={disabled}
          rows={4}
          style={{
            border: `1px solid ${C.border}`,
            borderRadius: 4,
            padding: '8px 10px',
            fontSize: 13,
            color: C.fg1,
            fontFamily: 'inherit',
            resize: 'vertical',
            minHeight: 88,
          }}
        />
      </label>

      <SectionTitle>{t('newProjectNorthStarSection')}</SectionTitle>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 12, color: C.fg2 }}>{t('newProjectNorthStarLabel')}</span>
        <input
          type="text"
          value={form.northStar}
          onChange={(e) => setForm((prev) => ({ ...prev, northStar: e.target.value }))}
          placeholder={t('newProjectNorthStarPlaceholder')}
          disabled={disabled}
          style={{
            border: `1px solid ${C.border}`,
            borderRadius: 4,
            height: 36,
            padding: '0 10px',
            fontSize: 13,
            color: C.fg1,
            fontFamily: 'inherit',
          }}
        />
      </label>
      <div style={{ fontSize: 11, color: C.fg3, lineHeight: 1.45, marginTop: -6 }}>
        {t('newProjectNorthStarHint')}
      </div>

      <SectionTitle>{t('newProjectPrioritySection')}</SectionTitle>
      <div style={{ fontSize: 11, color: C.fg3, lineHeight: 1.45 }}>{t('newProjectPriorityIntro')}</div>

      <PrioritySliderRow
        value={form.priorityAestheticsFunctionality}
        onChange={(v) => setForm((prev) => ({ ...prev, priorityAestheticsFunctionality: v }))}
        leftHint={t('newProjectPriorityAesthetics')}
        rightHint={t('newProjectPriorityFunctionality')}
        labelLeft={t('newProjectPriAfLeft')}
        labelRight={t('newProjectPriAfRight')}
        balancedLabel={t('newProjectPriorityBalanced')}
        disabled={disabled}
      />
      <PrioritySliderRow
        value={form.priorityCostQuality}
        onChange={(v) => setForm((prev) => ({ ...prev, priorityCostQuality: v }))}
        leftHint={t('newProjectPriorityCost')}
        rightHint={t('newProjectPriorityQuality')}
        labelLeft={t('newProjectPriCqLeft')}
        labelRight={t('newProjectPriCqRight')}
        balancedLabel={t('newProjectPriorityBalanced')}
        disabled={disabled}
      />
      <PrioritySliderRow
        value={form.prioritySpeedStability}
        onChange={(v) => setForm((prev) => ({ ...prev, prioritySpeedStability: v }))}
        leftHint={t('newProjectPrioritySpeed')}
        rightHint={t('newProjectPriorityStability')}
        labelLeft={t('newProjectPriSsLeft')}
        labelRight={t('newProjectPriSsRight')}
        balancedLabel={t('newProjectPriorityBalanced')}
        disabled={disabled}
      />

      {saveState.status === 'error' ? (
        <div style={{ fontSize: 12, color: C.coral }}>{saveState.message}</div>
      ) : null}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
        <Btn
          variant="default"
          size="sm"
          type="button"
          onClick={() => !disabled && onClose?.()}
          disabled={disabled}
        >
          {t('hubCreateCancel')}
        </Btn>
        <Btn type="submit" variant="primary" size="sm" disabled={disabled}>
          {saveState.status === 'saving' ? t('hubCreateSaving') : t('hubCreateSave')}
        </Btn>
      </div>
    </form>
  );

  if (!visible || !project) return null;

  return (
    <div
      role="presentation"
      onClick={() => !disabled && onClose?.()}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(19,28,36,0.42)',
        zIndex: 65,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      {formBody}
    </div>
  );
}
