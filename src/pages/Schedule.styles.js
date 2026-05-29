export const scheduleStyles = {
  input: {
    width: '100%',
    background: 'var(--input-bg)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '9px 12px',
    fontFamily: "'Inter', sans-serif",
    fontSize: 13,
    color: 'var(--text)',
    outline: 'none',
    boxSizing: 'border-box',
  },
  fieldWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: 500,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  statCard: {
    background: 'var(--card-bg)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: '16px 18px',
  },
  statLabel: {
    fontSize: 12,
    color: 'var(--text-muted)',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 600,
    letterSpacing: -0.5,
    lineHeight: 1,
    marginBottom: 6,
    color: 'var(--text)',
  },
  statDetail: {
    fontSize: 11,
    color: 'var(--text-muted)',
  },
  main: {
    background: 'var(--bg)',
    minHeight: 'calc(100vh - 56px)',
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: 600,
    letterSpacing: -0.5,
    color: 'var(--text)',
    marginBottom: 3,
  },
  subtitle: {
    fontSize: 13,
    color: 'var(--text-muted)',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: 12,
    marginBottom: 24,
  },
  errorNotice: {
    fontSize: 12,
    color: '#ef4444',
    padding: '10px 12px',
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: 10,
    marginBottom: 16,
  },
  successNotice: {
    fontSize: 12,
    color: '#16a34a',
    padding: '10px 12px',
    background: '#f0fdf4',
    border: '1px solid #bbf7d0',
    borderRadius: 10,
    marginBottom: 16,
  },
  formCard: {
    background: 'var(--card-bg)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: '20px 20px',
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--text)',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 12,
    color: 'var(--text-muted)',
    marginBottom: 16,
    lineHeight: 1.5,
  },
  formStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  daysGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
    gap: 6,
  },
  timeGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12,
  },
  saveButton: {
    width: '100%',
    padding: 10,
    background: 'var(--btn-bg)',
    border: 'none',
    borderRadius: 8,
    color: 'var(--btn-color)',
    fontFamily: "'Inter', sans-serif",
    fontSize: 13,
    fontWeight: 500,
  },
  helperNote: {
    marginTop: 16,
    padding: '10px 12px',
    background: 'var(--input-bg)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    fontSize: 12,
    color: 'var(--text-muted)',
    lineHeight: 1.5,
  },
  listCard: {
    background: 'var(--card-bg)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  listHeader: {
    padding: '16px 20px',
    borderBottom: '1px solid var(--border)',
  },
  listWrap: {
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  emptyState: {
    padding: '24px 10px',
    textAlign: 'center',
    color: 'var(--text-muted)',
    fontSize: 13,
  },
  scheduleCardText: {
    minWidth: 0,
    flex: 1,
  },
  scheduleHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    flexWrap: 'wrap',
  },
  scheduleHeadingRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 6,
  },
  scheduleUserName: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text)',
  },
  scheduleEmail: {
    fontSize: 12,
    color: 'var(--text-muted)',
    marginBottom: 6,
  },
  scheduleRule: {
    fontSize: 13,
    color: 'var(--text)',
    marginBottom: 6,
    lineHeight: 1.5,
  },
  activeWindow: {
    fontSize: 12,
    color: '#166534',
    marginBottom: 6,
  },
  upcomingWindow: {
    fontSize: 12,
    color: '#92400e',
    marginBottom: 4,
  },
  upcomingCountdown: {
    fontSize: 11,
    color: '#92400e',
    marginBottom: 6,
  },
  inactiveWindow: {
    fontSize: 12,
    color: 'var(--text-muted)',
    marginBottom: 6,
  },
  deleteButton: {
    padding: '7px 10px',
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: 8,
    color: '#ef4444',
    fontFamily: "'Inter', sans-serif",
    fontSize: 12,
    fontWeight: 500,
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  quickPreview: {
    marginTop: 10,
    fontSize: 11,
    color: 'var(--text-light)',
  },
}

export function getStatusBadgeStyle(state) {
  const statusStyles = {
    active: { background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' },
    upcoming: { background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' },
    inactive: { background: 'var(--input-bg)', color: 'var(--text-muted)', border: '1px solid var(--border)' },
  }

  return {
    fontSize: 11,
    fontWeight: 500,
    padding: '3px 8px',
    borderRadius: 20,
    ...statusStyles[state],
  }
}

export function getDayButtonStyle(selected) {
  return {
    padding: '9px 0',
    borderRadius: 8,
    border: selected ? '1px solid transparent' : '1px solid var(--border)',
    background: selected ? 'var(--btn-bg)' : 'var(--card-bg)',
    color: selected ? 'var(--btn-color)' : 'var(--text)',
    fontFamily: "'Inter', sans-serif",
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  }
}

export function getSaveButtonStyle(disabled) {
  return {
    ...scheduleStyles.saveButton,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  }
}

export function getScheduleCardStyle(state) {
  return {
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '14px 16px',
    background: state === 'active' ? 'rgba(240,253,244,0.5)' : 'var(--card-bg)',
  }
}

export function getDeleteButtonStyle(disabled) {
  return {
    ...scheduleStyles.deleteButton,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.7 : 1,
  }
}
