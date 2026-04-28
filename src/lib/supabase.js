import { createClient } from '@supabase/supabase-js';

/**
 * Vite는 `VITE_` 접두사가 붙은 변수만 클라이언트에 주입합니다.
 * REST 엔드포인트(`.../rest/v1/`)를 붙여 둔 경우에도 동작하도록 기본 URL로 맞춥니다.
 */
function normalizeSupabaseUrl(url) {
  if (!url) return '';
  return String(url)
    .trim()
    .replace(/\/rest\/v1\/?$/, '')
    .replace(/\/$/, '');
}

const supabaseUrl = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL);
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

if (import.meta.env.DEV && (!supabaseUrl || !supabaseAnonKey)) {
  // eslint-disable-next-line no-console
  console.warn(
    '[supabase] .env.local에 VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY를 설정해 주세요.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
