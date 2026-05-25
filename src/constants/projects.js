// Single source of truth for projects across the app.
// Both HubPage (the grid) and Sidebar / detail pages (route lookups)
// read from here.

// Per-team accent dot used in the project grid.
export const TEAM_DOT = {
  'Hardware Core':     '#06b6d4', // cyan
  'Industrial Design': '#3A6EA5', // blue
  'Electronics':       '#7F56D9', // violet
  'Structural':        '#D05045', // coral
  'Thermal':           '#0EA5B7', // teal
  'Mechanical':        '#C88A1A', // amber
  'Quality':           '#475569', // slate
};

export const ACTIVE_PROJECTS = [
  { id: 'EV-TH', name: 'EV Thermal Module A',  team: 'Hardware Core',     status: 'active',   conflicts: 3, consensus: 67, sprint: 14, progress: 67,  risk: 'high',   updated: '2 min ago' },
  { id: 'EV-EN', name: 'EV Enclosure Design',  team: 'Industrial Design', status: 'pending',  conflicts: 1, consensus: 82, sprint: 9,  progress: 44,  risk: 'medium', updated: '1h ago' },
  { id: 'PCB-A', name: 'PCB Layout Rev. 3',    team: 'Electronics',       status: 'resolved', conflicts: 0, consensus: 94, sprint: 7,  progress: 100, risk: 'low',    updated: '3h ago' },
  { id: 'FM-02', name: 'Frame Mounting System',team: 'Structural',        status: 'pending',  conflicts: 2, consensus: 55, sprint: 11, progress: 30,  risk: 'high',   updated: 'Yesterday' },
  { id: 'BMS-1', name: 'BMS Integration',      team: 'Electronics',       status: 'active',   conflicts: 1, consensus: 78, sprint: 6,  progress: 80,  risk: 'medium', updated: '5h ago' },
  { id: 'COOL',  name: 'Cooling Loop Routing', team: 'Thermal',           status: 'resolved', conflicts: 0, consensus: 91, sprint: 5,  progress: 100, risk: 'low',    updated: '2 days ago' },
];

export const COMPLETED_PROJECTS = [
  { id: 'EV-TH-V1', name: 'EV Thermal Module A',  team: 'Hardware Core',     status: 'completed', conflicts: 0, consensus: 96, sprint: 12, progress: 100, risk: 'low', updated: 'Mar 12, 2026' },
  { id: 'EV-EN-V2', name: 'EV Enclosure Design',  team: 'Industrial Design', status: 'completed', conflicts: 0, consensus: 92, sprint: 10, progress: 100, risk: 'low', updated: 'Feb 28, 2026' },
  { id: 'BR-CAL',   name: 'Brake Caliper Spec',   team: 'Mechanical',        status: 'completed', conflicts: 0, consensus: 89, sprint: 8,  progress: 100, risk: 'low', updated: 'Feb 14, 2026' },
];

export const ALL_PROJECTS = [...ACTIVE_PROJECTS, ...COMPLETED_PROJECTS];

export function getProjectById(id) {
  if (!id) return null;
  return ALL_PROJECTS.find((p) => p.id === id) || null;
}

// Sensible default so direct deep-link to /project/:id with a stale ID
// still renders something readable instead of "undefined".
export const DEFAULT_PROJECT = ACTIVE_PROJECTS[0];
