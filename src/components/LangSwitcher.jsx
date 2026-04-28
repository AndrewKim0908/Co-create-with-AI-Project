import { C } from '@/constants/colors';
import { useLang } from '@/i18n/LangContext';

export default function LangSwitcher() {
  const { lang, setLang } = useLang();
  return (
    <div
      style={{
        display: 'flex', gap: 2, background: C.subtle, borderRadius: 5,
        padding: 2, border: `1px solid ${C.border}`,
      }}
    >
      {[['en', 'EN'], ['ko', '한'], ['zh', '中']].map(([code, label]) => {
        const active = lang === code;
        return (
          <button
            key={code}
            onClick={() => setLang(code)}
            style={{
              fontSize: 11,
              fontWeight: active ? 600 : 500,
              padding: '3px 9px',
              borderRadius: 3,
              background: active ? C.white : 'transparent',
              color: active ? C.fg1 : C.fg3,
              border: active ? `1px solid ${C.border}` : '1px solid transparent',
              boxShadow: active ? '0 1px 2px rgba(30,42,53,0.08)' : 'none',
              transition: 'all 140ms',
              cursor: 'pointer',
              lineHeight: 1.4,
              fontFamily: 'Inter, system-ui, sans-serif',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
