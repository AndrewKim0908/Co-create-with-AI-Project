import Icon from '@/components/Icon';
import { C } from '@/constants/colors';

export default function LanguageDropdown() {
  return (
    <div style={{ position: 'relative' }}>
      <div
        aria-label="Language: English"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          height: 36,
          padding: '0 10px',
          background: C.white,
          border: `1px solid ${C.border}`,
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 600,
          color: C.fg2,
          fontFamily: 'inherit',
        }}
      >
        <Icon name="globe" size={16} color={C.fg3} />
        EN
      </div>
    </div>
  );
}
