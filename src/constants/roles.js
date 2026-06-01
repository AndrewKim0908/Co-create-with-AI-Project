// Shared role + expertise options for the profile settings modal and the
// stakeholders page. profiles.role stores the role `id`; profiles.expertise
// stores the selected option labels as a TEXT[] (the strings below verbatim).

export const ROLES = [
  { id: 'pm',          en: 'Project Manager',   ko: '프로젝트 매니저' },
  { id: 'designer',    en: 'Product Designer',  ko: '제품 디자이너' },
  { id: 'engineer',    en: 'Engineer',          ko: '엔지니어' },
  { id: 'marketer',    en: 'Marketer',          ko: '마케터' },
  { id: 'manufacture', en: 'Manufacture',       ko: 'Manufacture' },
  { id: 'other',       en: 'Other…',            ko: '기타…' },
];

export function getRoleLabel(id, lang) {
  const r = ROLES.find((x) => x.id === id);
  if (!r) return id || '';
  return lang === 'ko' ? r.ko : r.en;
}

// ~20 expertise options offered in the settings multi-select. Stored verbatim.
export const EXPERTISE_OPTIONS = [
  'Thermal',
  'Structural',
  'Electronics',
  'Firmware',
  'Materials',
  'Manufacturing (DFM)',
  'Sourcing',
  'Cost Analysis',
  'Sustainability',
  'UX',
  'Industrial Design',
  'Ergonomics',
  'Prototyping',
  'Testing & Validation',
  'Quality',
  'Supply Chain',
  'Requirements',
  'Mechanical Design',
  'CMF/Surface',
  'Analysis/Simulation',
  'Regulatory/Compliance',
];
