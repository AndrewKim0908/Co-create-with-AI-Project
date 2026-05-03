/** One-line project summary for hub, workspace header, cards (prefers `description_short`, falls back to legacy `description`). */
export function projectShortDescription(row) {
  if (!row || typeof row !== 'object') return '';
  const short = row.description_short;
  if (short != null && String(short).trim() !== '') return String(short).trim();
  const legacy = row.description;
  if (legacy != null && String(legacy).trim() !== '') return String(legacy).trim();
  return '';
}
