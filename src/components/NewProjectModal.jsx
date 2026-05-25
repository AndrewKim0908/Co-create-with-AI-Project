import { useEffect, useState } from 'react';
import Btn from '@/components/Btn';
import { C } from '@/constants/colors';
import { useLang } from '@/i18n/LangContext';
import { supabase } from '@/lib/supabase';
import { calculateDateProgress, isDueDateBeforeStart } from '@/utils/projectProgress';

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
            background: 'linear-gradient(to right, #3A6EA5 0%, #06b6d4 100%)',
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
            accentColor: value <= 50 ? '#3A6EA5' : '#06b6d4',
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
 * @param {'modal' | 'embedded'} variant - modal = overlay; embedded = inline form (e.g. /create page)
 */
export default function NewProjectModal({
  open = true,
  variant = 'modal',
  onClose,
  userId,
  onCreated,
}) {
  const { t } = useLang();
  const [form, setForm] = useState(() => ({ ...INITIAL_FORM }));
  const [saveState, setSaveState] = useState({ status: 'idle', message: '' });

  useEffect(() => {
    if (variant === 'modal' && open) {
      setForm({ ...INITIAL_FORM });
      setSaveState({ status: 'idle', message: '' });
    }
  }, [open, variant]);

  useEffect(() => {
    if (variant === 'embedded') {
      setForm({ ...INITIAL_FORM });
      setSaveState({ status: 'idle', message: '' });
    }
  }, [variant]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (saveState.status === 'saving' || !userId) return;

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

    setSaveState({ status: 'saving', message: '' });

    const prog = sd && dd ? calculateDateProgress(sd, dd) : 0;

    const { data, error } = await supabase
      .from('projects')
      .insert({
        name,
        progress: prog,
        is_completed: false,
        user_id: userId,
        description: descriptionShort,
        description_short: descriptionShort,
        description_detail: descriptionDetail || null,
        north_star: northStar,
        start_date: sd || null,
        due_date: dd || null,
        priority_aesthetics_functionality: pAf,
        priority_cost_quality: pCq,
        priority_speed_stability: pSs,
      })
      .select('id')
      .single();

    if (error) {
      // eslint-disable-next-line no-console
      console.error('[NewProjectModal] insert failed:', error);
      setSaveState({ status: 'error', message: t('hubCreateError') });
      return;
    }

    const newId = data?.id;
    if (onCreated) {
      await onCreated(newId);
    }
    setSaveState({ status: 'idle', message: '' });
    setForm({ ...INITIAL_FORM });
    if (variant === 'modal' && onClose) {
      onClose();
    }
  }

  const disabled = saveState.status === 'saving';

  const formBody = (
    <form
      onSubmit={handleSubmit}
      onClick={(e) => variant === 'modal' && e.stopPropagation()}
      style={{
        width: '100%',
        maxWidth: 520,
        background: variant === 'modal' ? C.white : 'transparent',
        border: variant === 'modal' ? `1px solid ${C.borderSubtle}` : 'none',
        borderRadius: variant === 'modal' ? 8 : 0,
        boxShadow: variant === 'modal' ? '0 20px 48px rgba(19,28,36,0.26)' : 'none',
        padding: variant === 'modal' ? 16 : 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        maxHeight: variant === 'modal' ? 'min(90vh, 720px)' : 'none',
        overflowY: variant === 'modal' ? 'auto' : 'visible',
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 700, color: C.fg1 }}>{t('newProject')}</div>

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

  if (variant === 'embedded') {
    return formBody;
  }

  if (!open) return null;

  return (
    <div
      role="presentation"
      onClick={() => !disabled && onClose?.()}
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
      {formBody}
    </div>
  );
}
