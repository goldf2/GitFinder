import React from 'react';

const DEFAULTS = { server: 'server', deployment: 'deployment', endpoint: 'endpoint', repository: 'repository', project: 'project' };
const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };

export function defaultCardIcon(type) {
  return DEFAULTS[type] || 'service';
}

export default function CardIcon({ name }) {
  if (name === 'none') return null;
  if (name === 'server') return <svg viewBox="0 0 24 24" data-card-icon={name} {...common}><rect x="3" y="4" width="18" height="6" rx="2"/><rect x="3" y="14" width="18" height="6" rx="2"/><path d="M7 7h.01M7 17h.01M11 7h6M11 17h6"/></svg>;
  if (name === 'deployment') return <svg viewBox="0 0 24 24" data-card-icon={name} {...common}><path d="m12 3 8 6-8 6-8-6 8-6Z"/><path d="m4 13 8 6 8-6"/></svg>;
  if (name === 'endpoint') return <svg viewBox="0 0 24 24" data-card-icon={name} {...common}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/></svg>;
  if (name === 'repository') return <svg viewBox="0 0 24 24" data-card-icon={name} {...common}><circle cx="7" cy="5" r="2"/><circle cx="17" cy="7" r="2"/><circle cx="7" cy="19" r="2"/><path d="M7 7v10M9 9h3a5 5 0 0 0 5-5"/></svg>;
  if (name === 'project') return <svg viewBox="0 0 24 24" data-card-icon={name} {...common}><path d="M3 7.5h7l2-3h9v15H3v-12Z"/></svg>;
  if (name === 'database') return <svg viewBox="0 0 24 24" data-card-icon={name} {...common}><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7"/></svg>;
  return <svg viewBox="0 0 24 24" data-card-icon="service" {...common}><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/></svg>;
}
