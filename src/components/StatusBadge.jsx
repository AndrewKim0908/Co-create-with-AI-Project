import { C } from '@/constants/colors';
import { useLang } from '@/i18n/LangContext';

const STYLES = {
  active:    { bg: C.emeraldLight, color: C.emerald, border: C.emeraldBorder, key: 'statusActive' },
  conflict:  { bg: C.coralLight,   color: C.coral,   border: C.coralBorder,   key: 'statusConflict' },
  resolved:  { bg: C.emeraldLight, color: C.emerald, border: C.emeraldBorder, key: 'statusResolved' },
  pending:   { bg: C.amberLight,   color: C.amber,   border: '#FEF0CC',       key: 'statusPending' },
  deadlock:  { bg: C.coralLight,   color: C.coral,   border: C.coralBorder,   key: 'statusDeadlock' },
  completed: { bg: C.subtle,       color: C.fg2,     border: C.border,        key: 'statusCompleted' },
  busy:      { bg: C.amberLight,   color: C.amber,   border: '#FEF0CC',       key: 'statusBusy' },
  offline:   { bg: C.subtle,       color: C.fg3,     border: C.border,        key: 'statusOffline' },
  inactive:  { bg: C.subtle,       color: C.fg3,     border: C.border,        key: 'statusInactive' },
};

export default function StatusBadge({ status }) {
  const { t } = useLang();
  const s = STYLES[status] || STYLES.pending;
  return (
    <span
      style={{
        fontSize: 10, fontWeight: 500, padding: '2px 7px', borderRadius: 9999,
        background: s.bg, color: s.color, border: `1px solid ${s.border}`,
        whiteSpace: 'nowrap',
      }}
    >
      {t(s.key)}
    </span>
  );
}
