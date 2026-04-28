import { useState } from 'react';
import { C } from '@/constants/colors';

export default function Btn({
  children,
  variant = 'default',
  size = 'md',
  onClick,
  disabled,
  style = {},
  type = 'button',
}) {
  const [hov, setHov] = useState(false);
  const [press, setPress] = useState(false);

  const variants = {
    primary: { bg: hov ? C.emeraldHover : C.emerald, color: '#fff', border: 'none' },
    danger:  { bg: hov ? C.coralHover : C.coral, color: '#fff', border: 'none' },
    ghost:   { bg: hov ? C.muted : 'transparent', color: C.fg2, border: `1px solid ${hov ? C.border : 'transparent'}` },
    default: { bg: hov ? C.subtle : C.white, color: C.fg2, border: `1px solid ${C.border}` },
  };
  const sizes = {
    sm: { fontSize: 11, padding: '5px 11px' },
    md: { fontSize: 13, padding: '7px 14px' },
    lg: { fontSize: 14, padding: '10px 20px', fontWeight: 600 },
  };
  const v = variants[variant];
  const s = sizes[size];

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => { setHov(false); setPress(false); }}
      onMouseDown={() => setPress(true)}
      onMouseUp={() => setPress(false)}
      style={{
        ...s,
        background: v.bg,
        color: v.color,
        border: v.border,
        borderRadius: 4,
        fontWeight: 500,
        fontFamily: 'Inter, system-ui, sans-serif',
        cursor: disabled ? 'default' : 'pointer',
        transition: 'background 120ms, box-shadow 120ms',
        transform: press ? 'scale(0.985)' : 'scale(1)',
        opacity: disabled ? 0.5 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        ...style,
      }}
    >
      {children}
    </button>
  );
}
