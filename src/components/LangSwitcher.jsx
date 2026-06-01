import { C } from '@/constants/colors';

export default function LangSwitcher() {
  return (
    <div
      style={{
        display: 'flex', gap: 2, background: C.subtle, borderRadius: 5,
        padding: 2, border: `1px solid ${C.border}`,
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          padding: '3px 9px',
          borderRadius: 3,
          background: C.white,
          color: C.fg1,
          border: `1px solid ${C.border}`,
          boxShadow: '0 1px 2px rgba(30,42,53,0.08)',
          lineHeight: 1.4,
          fontFamily: 'Inter, system-ui, sans-serif',
        }}
      >
        EN
      </span>
    </div>
  );
}
