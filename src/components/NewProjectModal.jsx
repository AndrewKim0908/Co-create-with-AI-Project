import { useEffect, useRef, useState } from 'react';
import Btn from '@/components/Btn';
import Icon from '@/components/Icon';
import ConflictPrioritySection, {
  makeInitialNewProjectPriorities,
  stripIds,
} from '@/components/ConflictPrioritySection';
import { C } from '@/constants/colors';
import { useLang } from '@/i18n/LangContext';
import { supabase } from '@/lib/supabase';
import { calculateDateProgress, isDueDateBeforeStart } from '@/utils/projectProgress';

const DETAIL_TEMPLATE = `Background:\nUser needs:\nGoals:\nExpected trade-offs:\nProject scope:\nOut of scope:\nSuccess metrics:`;

const INITIAL_FORM = {
  name: '',
  descriptionShort: '',
  descriptionDetail: DETAIL_TEMPLATE,
  northStar: '',
  startDate: '',
  dueDate: '',
};

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

function parseDateStr(str) {
  if (!str) return { year: '', month: '', day: '' };
  const [y, m, d] = str.split('-');
  return {
    year: y || '',
    month: m ? String(Number(m)) : '',
    day: d ? String(Number(d)) : '',
  };
}

function DatePicker({ value, onChange, disabled }) {
  const [parts, setParts] = useState(() => parseDateStr(value));
  const prevRef = useRef(value);

  useEffect(() => {
    if (value !== prevRef.current) {
      prevRef.current = value;
      if (!value) setParts({ year: '', month: '', day: '' });
    }
  }, [value]);

  function handlePart(field, val) {
    const next = { ...parts, [field]: val };
    setParts(next);
    if (next.year && next.month && next.day) {
      const yy = String(next.year).padStart(4, '0');
      const mm = String(next.month).padStart(2, '0');
      const dd = String(next.day).padStart(2, '0');
      onChange(`${yy}-${mm}-${dd}`);
    } else {
      onChange('');
    }
  }

  const base = {
    border: `1px solid ${C.border}`,
    borderRadius: 4,
    height: 36,
    fontSize: 13,
    fontFamily: 'inherit',
    background: disabled ? '#f9fafb' : '#fff',
  };

  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <select
        value={parts.month}
        onChange={(e) => handlePart('month', e.target.value)}
        disabled={disabled}
        style={{ ...base, flex: 1, minWidth: 0, padding: '0 6px', color: parts.month ? C.fg1 : C.fg3 }}
      >
        <option value="">Month</option>
        {MONTHS.map((m, i) => (
          <option key={i} value={String(i + 1)}>{m}</option>
        ))}
      </select>
      <input
        type="number"
        placeholder="DD"
        min={1}
        max={31}
        value={parts.day}
        onChange={(e) => handlePart('day', e.target.value)}
        disabled={disabled}
        style={{ ...base, flex: 1, minWidth: 0, padding: '0 6px', color: parts.day ? C.fg1 : C.fg3 }}
      />
      <input
        type="number"
        placeholder="YYYY"
        min={2020}
        max={2030}
        value={parts.year}
        onChange={(e) => handlePart('year', e.target.value)}
        disabled={disabled}
        style={{ ...base, flex: 1, minWidth: 0, padding: '0 6px', color: parts.year ? C.fg1 : C.fg3 }}
      />
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
  const [priorities, setPriorities] = useState(() => makeInitialNewProjectPriorities());
  const [saveState, setSaveState] = useState({ status: 'idle', message: '' });
  const [closeHov, setCloseHov] = useState(false);
  const detailTextareaRef = useRef(null);

  useEffect(() => {
    if (variant === 'modal' && open) {
      setForm({ ...INITIAL_FORM });
      setPriorities(makeInitialNewProjectPriorities());
      setSaveState({ status: 'idle', message: '' });
    }
  }, [open, variant]);

  useEffect(() => {
    if (variant === 'embedded') {
      setForm({ ...INITIAL_FORM });
      setPriorities(makeInitialNewProjectPriorities());
      setSaveState({ status: 'idle', message: '' });
    }
  }, [variant]);

  function handleClose() {
    const dirty =
      Object.keys(INITIAL_FORM).some((k) => form[k] !== INITIAL_FORM[k]) ||
      priorities.length !== 2 ||
      priorities.some((p) => p.value !== 50 || (p.label !== 'Aesthetics' && p.label !== 'Cost savings'));
    if (dirty && !window.confirm('Your unsaved changes will be lost. Close this window?')) return;
    onClose?.();
  }

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

    const prioritiesPayload = stripIds(priorities);

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
        priorities: prioritiesPayload,
        priority_aesthetics_functionality: null,
        priority_cost_quality: null,
        priority_speed_stability: null,
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
    setPriorities(makeInitialNewProjectPriorities());
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.fg1 }}>{t('newProject')}</div>
        <button
          type="button"
          onClick={handleClose}
          disabled={disabled}
          onMouseEnter={() => setCloseHov(true)}
          onMouseLeave={() => setCloseHov(false)}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: disabled ? 'default' : 'pointer',
            padding: 4,
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="x" size={18} color={closeHov ? '#4b5563' : '#9ca3af'} />
        </button>
      </div>

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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 12, color: C.fg2 }}>{t('projectStartDateOptional')}</span>
        <DatePicker
          value={form.startDate}
          onChange={(v) => setForm((prev) => ({ ...prev, startDate: v }))}
          disabled={disabled}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 12, color: C.fg2 }}>{t('projectDueDateOptional')}</span>
        <DatePicker
          value={form.dueDate}
          onChange={(v) => setForm((prev) => ({ ...prev, dueDate: v }))}
          disabled={disabled}
        />
      </div>

      <SectionTitle>{t('newProjectDetailSection')}</SectionTitle>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 12, color: C.fg2 }}>{t('newProjectDetailLabel')}</span>
        <textarea
          ref={detailTextareaRef}
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

      <ConflictPrioritySection
        priorities={priorities}
        onChange={setPriorities}
        projectDescription={form.descriptionDetail}
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
          onClick={() => !disabled && handleClose()}
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
