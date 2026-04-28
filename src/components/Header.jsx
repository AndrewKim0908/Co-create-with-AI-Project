import Icon from './Icon';
import StatusBadge from './StatusBadge';
import LangSwitcher from './LangSwitcher';
import Btn from './Btn';
import { C } from '@/constants/colors';
import { useLang } from '@/i18n/LangContext';

/**
 * Header / Topbar.
 * Props mirror the topbar in the original HTML reference.
 */
export default function Header({
  title,
  subtitle,
  status,
  action,
  actionLabel,
  onBack,
  showLangSwitcher = true,
}) {
  const { t } = useLang();
  return (
    <header
      style={{
        height: 52, flexShrink: 0, background: C.white,
        borderBottom: `1px solid ${C.borderSubtle}`,
        display: 'flex', alignItems: 'center', padding: '0 16px', gap: 10,
      }}
    >
      {onBack && (
        <button
          onClick={onBack}
          style={{
            display: 'flex', alignItems: 'center', gap: 5, fontSize: 12,
            color: C.fg3, background: 'none', border: 'none',
            padding: '4px 8px', borderRadius: 4, cursor: 'pointer',
          }}
        >
          <Icon name="chevron-left" size={14} /> {t('back')}
        </button>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              fontSize: 14, fontWeight: 600, color: C.fg1,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}
          >
            {title}
          </span>
          {status && <StatusBadge status={status} />}
        </div>
        {subtitle && (
          <div style={{ fontSize: 11, color: C.fg3, marginTop: 1 }}>{subtitle}</div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          style={{
            fontSize: 11, color: C.fg3, display: 'flex', alignItems: 'center', gap: 5,
          }}
        >
          <div
            style={{
              width: 6, height: 6, borderRadius: '50%',
              background: C.emerald, animation: 'pulse-dot 2s infinite',
            }}
          />
          {t('liveSession')}
        </div>
        {action && (
          <Btn variant="primary" size="sm" onClick={action}>
            {actionLabel}
          </Btn>
        )}
        {showLangSwitcher && <LangSwitcher />}
      </div>
    </header>
  );
}
