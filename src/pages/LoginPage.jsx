import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import Icon from '@/components/Icon';
import LangSwitcher from '@/components/LangSwitcher';
import { useLang } from '@/i18n/LangContext';
import { supabase } from '@/lib/supabase';

/**
 * Email/password auth (sign in + sign up).
 */
export default function LoginPage() {
  const navigate = useNavigate();
  const { t } = useLang();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: 'idle', text: '' });

  const canSubmit = email.trim().length > 0 && password.length > 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit || busy) return;
    setBusy(true);
    setMsg({ type: 'idle', text: '' });

    const action = supabase.auth.signInWithPassword({ email: email.trim(), password });

    const { error } = await action;
    if (error) {
      setMsg({ type: 'error', text: error.message });
      setBusy(false);
      return;
    }

    setMsg({ type: 'success', text: t('authSigninSuccess') });
    setBusy(false);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-white px-4 py-10 font-sans">
      <div className="absolute left-6 top-5 z-10">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white/90 px-3 py-2 text-sm font-medium text-fg-2 shadow-sm backdrop-blur-sm transition-colors hover:border-slate-300 hover:bg-white hover:text-fg-1 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
        >
          <span aria-hidden>←</span>
          Back to home
        </button>
      </div>
      <div className="absolute right-6 top-5 z-10">
        <LangSwitcher />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}
        className="flex w-full max-w-md flex-col items-center gap-8"
      >
        <header className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-fg-1">
            {t('welcomeTitle')}
          </h1>
          <p className="mt-1 text-sm text-fg-3">{t('platformSub')}</p>
        </header>

        <form
          onSubmit={handleSubmit}
          className="w-full rounded-xl bg-white p-7"
        >
          <div className="mb-4">
            <label
              htmlFor="email"
              className="mb-1.5 block text-sm font-semibold text-fg-1"
            >
              {t('emailLabel')}
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              placeholder={t('emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-fg-1 placeholder:text-fg-4 transition-colors hover:border-slate-300 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          <div className="mb-5">
            <label
              htmlFor="password"
              className="mb-1.5 block text-sm font-semibold text-fg-1"
            >
              {t('passwordLabel')}
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                placeholder={t('passwordPlaceholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-3 pr-10 text-sm text-fg-1 placeholder:text-fg-4 transition-colors hover:border-slate-300 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? t('hidePassword') : t('showPassword')}
                aria-pressed={showPassword}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-fg-3 transition-colors hover:bg-slate-50 hover:text-fg-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              >
                <Icon name={showPassword ? 'eye' : 'eye-off'} size={16} />
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={!canSubmit || busy}
            className="group flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-emerald-600 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:ring-offset-2 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none disabled:hover:bg-slate-100 disabled:hover:shadow-none"
          >
            <span>
              {busy
                ? t('hubCreateSaving')
                : t('signInBtn')}
            </span>
            <Icon
              name="arrow-right"
              size={15}
              className="transition-transform group-hover:translate-x-0.5 group-disabled:transform-none"
            />
          </button>

          {msg.type !== 'idle' ? (
            <div className={`mt-3 text-xs ${msg.type === 'error' ? 'text-red-600' : 'text-emerald-700'}`}>
              {msg.text}
            </div>
          ) : null}

          <p className="mt-4 w-full text-center text-xs font-medium text-fg-2">
            <Link to="/signup" className="underline-offset-2 transition-colors hover:text-emerald-600 hover:underline">
              {t('authSwitchToSignup')}
            </Link>
          </p>
        </form>

        <p className="text-xs text-fg-4">{t('loginFooter')}</p>
      </motion.div>
    </div>
  );
}
