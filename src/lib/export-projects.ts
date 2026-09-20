import { format } from 'date-fns';
import type { Project } from '../types';

export type ProjectsExport = {
  version: 1;
  exportedAt: string;
  projects: Project[];
};

export function downloadProjectsExport(payload: ProjectsExport) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `noxen-export-${format(new Date(), 'yyyy-MM-dd')}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
