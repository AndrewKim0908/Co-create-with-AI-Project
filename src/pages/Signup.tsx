import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import Icon from '@/components/Icon';
import LangSwitcher from '@/components/LangSwitcher';
import { useLang } from '@/i18n/LangContext';
import { supabase } from '@/lib/supabase';

const ROLE_OPTIONS = [
  { id: 'designer', icon: 'pen-tool', ko: '디자이너', en: 'Designer' },
  { id: 'engineer', icon: 'cpu', ko: '엔지니어', en: 'Engineer' },
  { id: 'other', icon: 'briefcase', ko: '기타', en: 'Other' },
];

export default function Signup() {
  const navigate = useNavigate();
  const { lang } = useLang();
  const isKo = lang === 'ko';

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState('engineer');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: 'idle', text: '' });

  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const canSubmit = useMemo(
    () =>
      fullName.trim().length > 0 &&
      email.trim().length > 0 &&
      password.length >= 6 &&
      confirmPassword.length > 0 &&
      passwordsMatch,
    [fullName, email, password, confirmPassword, passwordsMatch],
  );

  async function onSubmit(e) {
    e.preventDefault();
    if (!canSubmit || busy) return;

    setBusy(true);
    setMsg({ type: 'idle', text: '' });

    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: fullName.trim(),
          role,
        },
      },
    });

    if (error) {
      setMsg({ type: 'error', text: error.message });
      setBusy(false);
      return;
    }

    setMsg({
      type: 'success',
      text: isKo
        ? '회원가입이 완료되었습니다. 이메일 인증 후 로그인해 주세요.'
        : 'Account created. Please verify your email and sign in.',
    });
    setBusy(false);
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-25 px-4 py-10 font-sans">
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
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-white shadow-sm">
            <img src="/assets/logo-v2.png" alt="Co-Create AI" className="h-10 w-10 rounded-md object-contain" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-fg-1">
            {isKo ? '계정 만들기' : 'Create your account'}
          </h1>
          <p className="mt-1 text-sm text-fg-3">
            {isKo ? '전문 하드웨어 협업 도구를 시작해 보세요.' : 'Get started with professional hardware tools.'}
          </p>
        </header>

        <form
          onSubmit={onSubmit}
          className="w-full rounded-lg border border-slate-200 bg-white p-7 shadow-[0_4px_24px_rgba(30,42,53,0.08)]"
        >
          <div className="mb-4">
            <label htmlFor="fullName" className="mb-1.5 block text-sm font-semibold text-fg-1">
              {isKo ? '이름' : 'Full Name'}
            </label>
            <input
              id="fullName"
              type="text"
              autoComplete="name"
              required
              placeholder={isKo ? '홍길동' : 'Alex Rivera'}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm text-fg-1 placeholder:text-fg-4 transition-colors hover:border-slate-300 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          <div className="mb-4">
            <label htmlFor="email" className="mb-1.5 block text-sm font-semibold text-fg-1">
              {isKo ? '이메일' : 'Email'}
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              placeholder={isKo ? 'name@company.com' : 'alex@forgecore.com'}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm text-fg-1 placeholder:text-fg-4 transition-colors hover:border-slate-300 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          <div className="mb-4">
            <label htmlFor="password" className="mb-1.5 block text-sm font-semibold text-fg-1">
              {isKo ? '비밀번호' : 'Password'}
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                minLength={6}
                placeholder={isKo ? '6자 이상 입력' : 'At least 6 characters'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 pr-10 text-sm text-fg-1 placeholder:text-fg-4 transition-colors hover:border-slate-300 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-fg-3 transition-colors hover:bg-slate-50 hover:text-fg-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              >
                <Icon name={showPassword ? 'eye' : 'eye-off'} size={16} />
              </button>
            </div>
          </div>

          <div className="mb-5">
            <label htmlFor="confirmPassword" className="mb-1.5 block text-sm font-semibold text-fg-1">
              {isKo ? '비밀번호 확인' : 'Confirm Password'}
            </label>
            <div className="relative">
              <input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                placeholder={isKo ? '비밀번호를 다시 입력' : 'Re-enter your password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={`w-full rounded-md border bg-white px-3 py-2.5 pr-10 text-sm text-fg-1 placeholder:text-fg-4 transition-colors hover:border-slate-300 focus:outline-none focus:ring-2 ${
                  confirmPassword.length > 0 && !passwordsMatch
                    ? 'border-coral-400 focus:border-coral-500 focus:ring-coral-500/20'
                    : 'border-slate-200 focus:border-emerald-500 focus:ring-emerald-500/20'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-fg-3 transition-colors hover:bg-slate-50 hover:text-fg-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              >
                <Icon name={showConfirmPassword ? 'eye' : 'eye-off'} size={16} />
              </button>
            </div>
            {confirmPassword.length > 0 && !passwordsMatch ? (
              <p className="mt-1.5 text-xs text-coral-600">
                {isKo ? '비밀번호가 일치하지 않습니다.' : 'Passwords do not match.'}
              </p>
            ) : null}
          </div>

          <div className="mb-5">
            <p className="mb-1.5 block text-sm font-semibold text-fg-1">
              {isKo ? '직군 선택' : 'Select Role'}
            </p>
            <div className="grid grid-cols-3 gap-2 rounded-md border border-slate-200 bg-slate-25 p-1.5">
              {ROLE_OPTIONS.map((opt) => {
                const selected = role === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setRole(opt.id)}
                    className={`inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-2 text-xs font-semibold transition ${
                      selected
                        ? 'border border-emerald-200 bg-white text-emerald-700 shadow-xs'
                        : 'border border-transparent bg-transparent text-fg-3 hover:bg-white hover:text-fg-2'
                    }`}
                  >
                    <Icon name={opt.icon} size={14} />
                    <span>{isKo ? opt.ko : opt.en}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="submit"
            disabled={!canSubmit || busy}
            className="group flex w-full items-center justify-center gap-2 rounded-md bg-emerald-300 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-emerald-500 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:ring-offset-2 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-emerald-300 disabled:hover:shadow-sm"
          >
            <span>{busy ? (isKo ? '처리 중...' : 'Processing...') : (isKo ? '회원가입 완료' : 'Create Account')}</span>
            <Icon
              name="arrow-right"
              size={15}
              className="transition-transform group-hover:translate-x-0.5 group-disabled:transform-none"
            />
          </button>

          {msg.type !== 'idle' ? (
            <div className={`mt-3 text-xs ${msg.type === 'error' ? 'text-coral-600' : 'text-emerald-700'}`}>
              {msg.text}
            </div>
          ) : null}

          <p className="mt-5 text-center text-xs text-fg-3">
            {isKo ? '이미 계정이 있으신가요?' : 'Already have an account?'}{' '}
            <Link to="/" className="font-semibold text-fg-1 underline-offset-2 hover:underline">
              {isKo ? '로그인하기' : 'Sign in'}
            </Link>
          </p>
        </form>
      </motion.div>
    </div>
  );
}
