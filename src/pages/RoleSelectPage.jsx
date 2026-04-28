import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import Icon from '@/components/Icon';
import Btn from '@/components/Btn';
import LangSwitcher from '@/components/LangSwitcher';
import { C } from '@/constants/colors';
import { useLang } from '@/i18n/LangContext';

/**
 * Step 2 of sign-in: pick the role you'll use in this sprint.
 * Reached after submitting the email/password form on /.
 */
export default function RoleSelectPage({ onSelectRole }) {
  const { t } = useLang();
  const navigate = useNavigate();
  const [selected, setSelected] = useState(null);
  const [hov, setHov] = useState(null);

  const roles = [
    { id: 'engineer', label: t('roleEngineer'), sub: t('roleEngineerSub'), icon: 'cpu',        color: C.emerald },
    { id: 'designer', label: t('roleDesigner'), sub: t('roleDesignerSub'), icon: 'pen-tool',   color: '#3A6EA5' },
    { id: 'lead',     label: t('roleLead'),     sub: t('roleLeadSub'),     icon: 'user-check', color: C.amber },
  ];

  const handleEnter = () => {
    if (!selected) return;
    onSelectRole(selected);
    navigate('/hub');
  };

  return (
    <div
      style={{
        height: '100vh',
        background: 'linear-gradient(135deg,#F4F6F8 0%,#FAFBFC 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative',
      }}
    >
      <div style={{ position: 'absolute', top: 20, right: 24 }}>
        <LangSwitcher />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}
        style={{
          width: 480, display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 32,
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              fontSize: 28, fontWeight: 700, color: C.fg1,
              letterSpacing: '-0.025em',
            }}
          >
            {t('platformName')}
          </div>
          <div style={{ fontSize: 13, color: C.fg3, marginTop: 4 }}>
            {t('platformSub')}
          </div>
        </div>

        <div
          style={{
            width: '100%', background: C.white, borderRadius: 8,
            border: `1px solid ${C.border}`,
            boxShadow: '0 4px 24px rgba(30,42,53,0.08)', padding: 32,
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 600, color: C.fg1, marginBottom: 6 }}>
            {t('loginHeading')}
          </div>
          <div style={{ fontSize: 13, color: C.fg3, marginBottom: 24 }}>
            {t('loginSub')}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {roles.map((r) => {
              const isSelected = selected === r.id;
              const isHov = hov === r.id;
              return (
                <div
                  key={r.id}
                  onClick={() => setSelected(r.id)}
                  onMouseEnter={() => setHov(r.id)}
                  onMouseLeave={() => setHov(null)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '14px 16px', borderRadius: 6, cursor: 'pointer',
                    border: isSelected
                      ? `2px solid ${r.color}`
                      : `2px solid ${isHov ? C.border : C.borderSubtle}`,
                    background: isSelected
                      ? `${r.color}08`
                      : isHov ? C.subtle : C.white,
                    transition: 'all 150ms',
                    boxShadow: isSelected ? `0 0 0 3px ${r.color}20` : 'none',
                  }}
                >
                  <div
                    style={{
                      width: 38, height: 38, borderRadius: 6,
                      background: `${r.color}15`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Icon name={r.icon} size={18} color={r.color} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.fg1 }}>{r.label}</div>
                    <div style={{ fontSize: 11, color: C.fg3, marginTop: 2 }}>{r.sub}</div>
                  </div>
                  <div
                    style={{
                      width: 18, height: 18, borderRadius: '50%',
                      border: `2px solid ${isSelected ? r.color : C.border}`,
                      background: isSelected ? r.color : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 150ms',
                    }}
                  >
                    {isSelected && (
                      <div
                        style={{
                          width: 6, height: 6, borderRadius: '50%', background: '#fff',
                        }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <Btn
            variant="primary"
            size="lg"
            disabled={!selected}
            onClick={handleEnter}
            style={{ width: '100%', marginTop: 24, justifyContent: 'center' }}
          >
            {t('enterBtn')} <Icon name="arrow-right" size={15} />
          </Btn>
        </div>

        <div style={{ fontSize: 11, color: C.fg4 }}>{t('loginFooter')}</div>
      </motion.div>
    </div>
  );
}
