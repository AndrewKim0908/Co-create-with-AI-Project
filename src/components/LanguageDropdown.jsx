import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/Icon';
import { C } from '@/constants/colors';
import { useLang } from '@/i18n/LangContext';

const LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'ko', label: '한국어', flag: '🇰🇷' },
  { code: 'zh', label: '中文', flag: '🇨🇳' },
];

export default function LanguageDropdown() {
  const { lang, setLang, t } = useLang();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function onDocDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={t('languageMenu')}
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 36,
          height: 36,
          padding: 0,
          background: C.white,
          border: `1px solid ${C.border}`,
          borderRadius: 6,
          cursor: 'pointer',
        }}
      >
        <Icon name="globe" size={20} color={C.fg2} />
      </button>

      {open ? (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 4,
            background: C.white,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(30,42,53,0.14)',
            minWidth: 168,
            padding: 4,
            zIndex: 80,
          }}
        >
          {LANGUAGES.map(({ code, label, flag }) => {
            const active = lang === code;
            return (
              <button
                key={code}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  setLang(code);
                  setOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '10px 12px',
                  border: 'none',
                  borderRadius: 6,
                  background: active ? C.emeraldLight : 'transparent',
                  color: active ? C.emerald : C.fg1,
                  fontSize: 13,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span style={{ fontSize: 15 }} aria-hidden>
                  {flag}
                </span>
                <span style={{ flex: 1 }}>{label}</span>
                {active ? <Icon name="check" size={16} color={C.emerald} /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
