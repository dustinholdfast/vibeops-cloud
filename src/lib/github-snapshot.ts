import type { Project } from '../types';

export function renderProjectSnapshot(project: Project): string {
  const lines = [
    `# ${project.name}`,
    '',
    `Stage: ${project.stage}`,
    `Priority: ${project.priority}`,
    `Health: ${project.health}`,
    `Progress: ${project.progress}%`,
    project.targetDate ? `Target: ${project.targetDate}` : 'Target: none',
    `Last touched: ${project.lastTouched}`,
    '',
    '## Next action',
    '',
    project.nextAction || '_No next action defined._',
    '',
  ];
  if (project.liveUrl) {
    lines.push(`Live: ${project.liveUrl}`, '');
  }
  if (project.repoUrl) {
    lines.push(`Repo: ${project.repoUrl}`, '');
  }
  if (project.activity.length) {
    lines.push('## Recent activity', '');
    for (const item of project.activity.slice(0, 12)) {
      lines.push(`- ${item.timestamp.slice(0, 10)} — ${item.message}`);
    }
    lines.push('');
  }
  lines.push('_Written by Vibe / Ops Cloud._', '');
  return lines.join('\n');
}
