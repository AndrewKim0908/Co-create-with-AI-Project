import { useState } from 'react';
import Icon from '@/components/Icon';
import { C } from '@/constants/colors';
import { getImportanceMeta } from '@/utils/projectPriorities';

function PrioritySliderRow({
  value,
  onChange,
  leftHint,
  disabled,
  editing,
  onRemove,
  onLeftHintChange,
}) {
  const [labelEditing, setLabelEditing] = useState(false);
  const importance = getImportanceMeta(value);

  const hintInputStyle = {
    fontSize: 12,
    color: C.fg1,
    background: '#fff',
    border: `1px solid ${C.border}`,
    borderRadius: 4,
    padding: '2px 6px',
    fontFamily: 'inherit',
    width: '100%',
    boxSizing: 'border-box',
  };

  const labelEditable = editing && onLeftHintChange;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 144, flexShrink: 0 }}>
        {labelEditable && labelEditing ? (
          <input
            type="text"
            value={leftHint}
            autoFocus
            onChange={(e) => onLeftHintChange(e.target.value)}
            onBlur={() => setLabelEditing(false)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') setLabelEditing(false); }}
            placeholder="e.g. Speed"
            disabled={disabled}
            style={hintInputStyle}
          />
        ) : (
          <span
            onClick={() => { if (labelEditable) setLabelEditing(true); }}
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: C.fg1,
              cursor: labelEditable ? 'text' : 'default',
              display: 'inline-block',
              borderBottom: labelEditable ? '1px dashed transparent' : 'none',
            }}
            onMouseEnter={(e) => { if (labelEditable) e.currentTarget.style.borderBottomColor = C.border; }}
            onMouseLeave={(e) => { if (labelEditable) e.currentTarget.style.borderBottomColor = 'transparent'; }}
          >
            {leftHint || (labelEditable ? 'Click to edit' : '—')}
          </span>
        )}
      </div>

      <div style={{ flex: 1, position: 'relative', height: 22, display: 'flex', alignItems: 'center', minWidth: 0 }}>
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            height: 6,
            borderRadius: 3,
            background: `linear-gradient(to right, #e5e7eb 0%, ${importance.color} 100%)`,
            pointerEvents: 'none',
          }}
        />
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{
            position: 'relative',
            width: '100%',
            height: 22,
            margin: 0,
            background: 'transparent',
            accentColor: importance.color,
          }}
        />
      </div>

      <div style={{ width: 32, flexShrink: 0, textAlign: 'right', fontSize: 11, fontWeight: 700, color: C.fg2, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>

      <div style={{ width: 110, flexShrink: 0, fontSize: 11, fontWeight: 600, color: importance.color, textAlign: 'left' }}>
        {importance.label}
      </div>

      <div style={{ width: 22, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {editing && onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            aria-label="Remove slider"
            style={{
              width: 22,
              height: 22,
              borderRadius: '50%',
              border: '1px solid #fca5a5',
              background: '#fff',
              color: '#f87171',
              cursor: disabled ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              fontSize: 14,
              fontWeight: 700,
              lineHeight: 1,
              flexShrink: 0,
              fontFamily: 'inherit',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.borderColor = '#dc2626'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.borderColor = '#fca5a5'; }}
          >
            −
          </button>
        ) : null}
      </div>
    </div>
  );
}

function clamp(v) {
  const n = Math.round(Number(v) || 0);
  return Math.min(100, Math.max(0, n));
}

function makeId() {
  return `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Shared "Conflict priority" section.
 *
 * @param {Array<{id?: string, label: string, value: number}>} priorities
 * @param {(next: Array<{id: string, label: string, value: number}>) => void} onChange
 * @param {string} projectDescription — fed into AI Suggest prompt
 * @param {boolean} disabled
 */
export default function ConflictPrioritySection({
  priorities,
  onChange,
  projectDescription = '',
  disabled = false,
}) {
  const [editing, setEditing] = useState(false);
  const [suggestState, setSuggestState] = useState({ status: 'idle', message: '' });
  const [suggestCount, setSuggestCount] = useState(3);

  const totalSliders = priorities.length;

  function updateAt(i, patch) {
    onChange(priorities.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }

  function removeAt(i) {
    onChange(priorities.filter((_, idx) => idx !== i));
  }

  function addPriority() {
    onChange([...priorities, { id: makeId(), label: '', value: 50 }]);
  }

  function toggleEditing() {
    if (disabled) return;
    if (editing && totalSliders === 0) {
      setSuggestState({ status: 'error', message: 'Please add at least one priority.' });
      return;
    }
    setEditing((v) => !v);
  }

  async function handleAISuggest() {
    const desc = String(projectDescription || '').trim();
    if (!desc) {
      setSuggestState({
        status: 'hint',
        message: '💡 Please fill in the Detailed description first so AI can suggest relevant priorities.',
      });
      return;
    }

    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey || String(apiKey).trim() === '') {
      setSuggestState({ status: 'error', message: 'Gemini API key is not configured.' });
      return;
    }

    const maxNew = suggestCount;
    const existingList = priorities.map((p) => p.label || '?').join(', ') || 'none';

    const GEMINI_MODEL = 'gemini-2.5-flash';
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const systemPrompt = 'You are a JSON-only API. Never include markdown, explanation, or code blocks. Return only raw JSON array.';
    const userPrompt = `Project description: ${desc}\n\nCurrently tracked priorities: ${existingList}\n\nSuggest ${maxNew} project priorities as JSON array.\n\nResponse example: [{"label":"Performance","value":50},{"label":"Cost","value":50}]\n\nRules:\n- Use single word labels only, e.g. Performance, Cost, Speed\n- value 50 = neutral/balanced starting point\n- Do not duplicate existing priorities\n- Exactly ${maxNew} items\n- No special characters in labels (no & + / etc.)`;

    const loadingMessages = ['Suggesting...', 'Retrying...', 'Almost there...'];
    const MAX_ATTEMPTS = 3;
    const RETRY_DELAY_MS = 1500;

    let lastError = null;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      setSuggestState({ status: 'loading', message: loadingMessages[attempt] });
      try {
        const requestBody = {
          contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 4096 },
        };
        const res = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        });

        if (!res.ok) {
          const errBody = await res.text();
          const err = new Error(`Gemini ${res.status}: ${errBody.slice(0, 500)}`);
          err.status = res.status;
          throw err;
        }

        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error('Empty response');

        const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const fixJson = (str) => {
          const lastBrace = str.lastIndexOf('}');
          if (lastBrace === -1) return '[]';
          return str.slice(0, lastBrace + 1) + ']';
        };

        let parsed;
        try {
          parsed = JSON.parse(cleaned);
        } catch (parseErr) {
          try {
            parsed = JSON.parse(fixJson(cleaned));
          } catch {
            throw new Error(`JSON parse failed: ${parseErr.message}`);
          }
        }
        if (!Array.isArray(parsed)) throw new Error('Expected array');

        const newSliders = parsed.slice(0, maxNew).map((item, i) => ({
          id: `ai-${Date.now()}-${i}`,
          label: String(item.label || item.left || item.leftHint || ''),
          value: typeof item.value === 'number' ? clamp(item.value) : 50,
        }));

        const wouldExceed = totalSliders + newSliders.length > 10;
        onChange([...priorities, ...newSliders]);
        setEditing(true);
        setSuggestState(
          wouldExceed
            ? { status: 'error', message: `Added ${newSliders.length} priorities (total now exceeds 10 — consider removing some).` }
            : { status: 'idle', message: '' },
        );
        return;
      } catch (err) {
        lastError = err;
        const retryable = err.status === 503 || err.status === 429;
        const hasMoreAttempts = attempt < MAX_ATTEMPTS - 1;
        if (!retryable || !hasMoreAttempts) break;
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }

    setSuggestState({
      status: 'error',
      message: `Failed to get AI suggestions: ${lastError?.message || 'unknown error'}`,
    });
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.fg1, letterSpacing: '0.02em' }}>
          Conflict priority
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            type="button"
            onClick={handleAISuggest}
            disabled={disabled || suggestState.status === 'loading'}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: (disabled || suggestState.status === 'loading') ? 'default' : 'pointer',
              padding: '2px 4px',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              fontWeight: 500,
              color: disabled ? '#a5f3fc' : '#06b6d4',
              fontFamily: 'inherit',
            }}
          >
            {suggestState.status === 'loading' ? (
              <>
                <Icon name="loader" size={12} color="#06b6d4" />
                {suggestState.message || 'Suggesting...'}
              </>
            ) : (
              <>✨ Suggest with AI</>
            )}
          </button>
          <input
            type="number"
            min={1}
            max={10}
            value={suggestCount}
            onChange={(e) => {
              const v = Math.min(Math.max(1, parseInt(e.target.value, 10) || 1), 10);
              setSuggestCount(v);
            }}
            disabled={disabled}
            style={{
              width: 36,
              textAlign: 'center',
              fontSize: 11,
              fontWeight: 600,
              color: C.fg2,
              background: C.white,
              border: `1px solid ${C.border}`,
              borderRadius: 4,
              padding: '2px 4px',
              fontFamily: 'inherit',
            }}
          />
          <button
            type="button"
            onClick={toggleEditing}
            disabled={disabled}
            aria-label={editing ? 'Finish editing' : 'Edit priorities'}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: disabled ? 'default' : 'pointer',
              padding: 4,
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name={editing ? 'check' : 'pencil'} size={15} color={editing ? '#06b6d4' : '#6b7280'} />
          </button>
        </div>
      </div>

      <div style={{ fontSize: 11, color: C.fg3, lineHeight: 1.45 }}>
        Set how much each factor matters in this project (0 = ignore, 100 = critical)
      </div>

      {suggestState.status === 'hint' && (
        <div style={{ fontSize: 11, color: '#b45309', lineHeight: 1.45 }}>
          {suggestState.message}
        </div>
      )}

      {priorities.map((p, i) => (
        <PrioritySliderRow
          key={p.id ?? `${p.label}-${i}`}
          value={p.value}
          onChange={(v) => updateAt(i, { value: v })}
          leftHint={p.label}
          disabled={disabled}
          editing={editing}
          onRemove={() => removeAt(i)}
          onLeftHintChange={(v) => updateAt(i, { label: v })}
        />
      ))}

      {suggestState.status === 'error' && (
        <div style={{ fontSize: 11, color: C.coral, lineHeight: 1.45 }}>
          {suggestState.message}
        </div>
      )}

      {editing && totalSliders === 0 && (
        <div style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', padding: '8px 0' }}>
          Please add at least one priority to guide AI decisions.
        </div>
      )}

      {editing ? (
        <button
          type="button"
          onClick={addPriority}
          disabled={disabled}
          style={{
            width: '100%',
            padding: '8px 12px',
            borderRadius: 6,
            border: '1px dashed #67e8f9',
            background: 'transparent',
            color: '#06b6d4',
            fontSize: 12,
            fontWeight: 600,
            cursor: disabled ? 'default' : 'pointer',
            fontFamily: 'inherit',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>
          Add priority
        </button>
      ) : null}

      <div style={{ fontSize: 11, color: '#9ca3af', lineHeight: 1.45 }}>
        💡 AI will prioritize Critical factors when suggesting trade-offs
      </div>
    </>
  );
}

export function makeInitialNewProjectPriorities() {
  return [
    { id: makeId(), label: 'Aesthetics', value: 50 },
    { id: makeId(), label: 'Cost savings', value: 50 },
  ];
}

export function withIds(priorities) {
  if (!Array.isArray(priorities)) return [];
  return priorities.map((p) => ({
    id: p.id ?? makeId(),
    label: String(p.label ?? p.left ?? p.leftHint ?? ''),
    value: clamp(p.value),
  }));
}

export function stripIds(priorities) {
  if (!Array.isArray(priorities)) return [];
  return priorities
    .map((p) => ({ label: String(p.label || '').trim(), value: clamp(p.value) }))
    .filter((p) => p.label.length > 0);
}
