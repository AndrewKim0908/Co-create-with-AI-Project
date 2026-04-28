import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Icon from './Icon';
import { C } from '@/constants/colors';

/**
 * Section header with a chevron toggle and a smoothly animated body.
 * The chevron rotates on toggle; the body uses height + opacity tweening
 * via framer-motion's AnimatePresence so it animates on both open and close.
 */
export default function CollapsibleSection({
  title,
  defaultOpen = true,
  rightSlot,
  children,
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section>
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 12, gap: 12,
        }}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'none', border: 'none', padding: '4px 0',
            cursor: 'pointer', color: C.fg3,
          }}
        >
          <motion.span
            animate={{ rotate: open ? 0 : -90 }}
            transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
            style={{
              display: 'inline-flex', alignItems: 'center',
              transformOrigin: 'center',
            }}
          >
            <Icon name="chevron-down" size={14} color={C.fg3} />
          </motion.span>
          <span
            style={{
              fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
              letterSpacing: '0.08em', color: C.fg3, userSelect: 'none',
            }}
          >
            {title}
          </span>
        </button>
        {rightSlot}
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height:  { duration: 0.28, ease: [0.2, 0, 0, 1] },
              opacity: { duration: 0.18, ease: 'easeOut' },
            }}
            style={{ overflow: 'hidden' }}
          >
            {/* extra wrapper so motion's height calc isn't affected by margin */}
            <div style={{ paddingBottom: 4 }}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
