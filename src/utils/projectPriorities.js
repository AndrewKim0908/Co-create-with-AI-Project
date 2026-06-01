function clampValue(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 50;
  return Math.min(100, Math.max(0, Math.round(n)));
}

export function getImportanceMeta(value) {
  const v = clampValue(value);
  if (v <= 20) return { label: 'Optional', color: '#9ca3af' };
  if (v <= 40) return { label: 'Important', color: '#3b82f6' };
  if (v <= 60) return { label: 'High priority', color: '#06b6d4' };
  if (v <= 80) return { label: 'Very important', color: '#f97316' };
  return { label: 'Critical', color: '#ef4444' };
}

export function getProjectPriorities(project) {
  if (!project) return [];

  const raw = project.priorities;
  if (Array.isArray(raw) && raw.length > 0) {
    return raw
      .filter((it) => it && typeof it === 'object')
      .map((it) => ({
        label: String(it.label ?? it.left ?? it.leftHint ?? '').trim(),
        value: clampValue(it.value),
      }))
      .filter((it) => it.label.length > 0);
  }

  const legacy = [];
  if (project.priority_aesthetics_functionality != null) {
    legacy.push({
      label: 'Aesthetics ↔ Functionality',
      value: clampValue(project.priority_aesthetics_functionality),
    });
  }
  if (project.priority_cost_quality != null) {
    legacy.push({
      label: 'Cost ↔ Quality',
      value: clampValue(project.priority_cost_quality),
    });
  }
  if (project.priority_speed_stability != null) {
    legacy.push({
      label: 'Speed ↔ Stability',
      value: clampValue(project.priority_speed_stability),
    });
  }
  return legacy;
}
