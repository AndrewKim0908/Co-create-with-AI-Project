import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { t as translate } from './translations';

const LangContext = createContext({
  lang: 'en',
  setLang: () => {},
  t: (key) => key,
});

export function LangProvider({ children, initial = 'en' }) {
  const [lang, setLang] = useState(initial);
  const t = useCallback((key) => translate(lang, key), [lang]);
  const value = useMemo(() => ({ lang, setLang, t }), [lang, t]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export const useLang = () => useContext(LangContext);
