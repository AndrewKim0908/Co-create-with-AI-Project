// Centralised color tokens — used by inline styles inside components.
// Mirrors tailwind.config.js + src/styles/tokens.css
export const C = {
  bg: '#FAFBFC',
  subtle: '#F4F6F8',
  muted: '#E2E8ED',
  fg1: '#1E2A35',
  fg2: '#6b7280',
  fg3: '#62788A',
  fg4: '#9BAAB7',
  border: '#C5D0D9',
  borderSubtle: '#E2E8ED',
  emerald: '#06b6d4',
  emeraldHover: '#0891b2',
  emeraldLight: '#ecfeff',
  emeraldBorder: '#a5f3fc',
  coral: '#D05045',
  coralHover: '#C0423A',
  coralLight: '#FDF4F3',
  coralBorder: '#F2B8B4',
  navy: '#f5f6f8',
  navyDark: '#131C24',
  amber: '#C88A1A',
  amberLight: '#FFFBF0',
  white: '#FFFFFF',
};

export const ROLE_MAP = {
  engineer: {
    name: 'Lee Sungmin',
    initials: 'LS',
    role: 'engineer',
    roleLabel: { en: 'Hardware Engineer', ko: '하드웨어 엔지니어', zh: '硬件工程师' },
  },
  designer: {
    name: 'Andrew Kim',
    initials: 'AK',
    role: 'designer',
    roleLabel: { en: 'Product Designer', ko: '제품 디자이너', zh: '产品设计师' },
  },
  lead: {
    name: 'Kim Jiyeon',
    initials: 'KJ',
    role: 'lead',
    roleLabel: { en: 'Lead User', ko: '리드 유저', zh: '主要用户' },
  },
};

export const ROLE_COLORS = {
  engineer: '#06b6d4',
  designer: '#6b7280',
  lead: '#C88A1A',
};
