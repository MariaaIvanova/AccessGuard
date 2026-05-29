export const historyStyles = {
  inputBase: {
    background: 'var(--input-bg)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '8px 12px',
    fontFamily: "'Inter', sans-serif",
    fontSize: 12,
    color: 'var(--text)',
    outline: 'none',
    minWidth: 0,
  },
  main: {
    background: 'var(--bg)',
    minHeight: 'calc(100vh - 56px)',
  },
  headerRow: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 20,
    flexWrap: 'wrap',
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
  exportButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    padding: '8px 14px',
    background: 'var(--card-bg)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    fontFamily: "'Inter', sans-serif",
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    color: 'var(--text)',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  filtersCard: {
    background: 'var(--card-bg)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: '14px 16px',
    marginBottom: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  filtersRow: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  searchWrap: {
    position: 'relative',
    flex: '2 1 180px',
  },
  searchIcon: {
    position: 'absolute',
    left: 10,
    top: '50%',
    transform: 'translateY(-50%)',
    color: 'var(--text-light)',
    pointerEvents: 'none',
  },
  searchInput: {
    background: 'var(--input-bg)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '8px 12px 8px 32px',
    fontFamily: "'Inter', sans-serif",
    fontSize: 12,
    color: 'var(--text)',
    outline: 'none',
    minWidth: 0,
    width: '100%',
  },
  userSelect: {
    background: 'var(--input-bg)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '8px 12px',
    fontFamily: "'Inter', sans-serif",
    fontSize: 12,
    color: 'var(--text)',
    outline: 'none',
    minWidth: 0,
    flex: '1 1 140px',
  },
  methodSelect: {
    background: 'var(--input-bg)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '8px 12px',
    fontFamily: "'Inter', sans-serif",
    fontSize: 12,
    color: 'var(--text)',
    outline: 'none',
    minWidth: 0,
    flex: '1 1 130px',
  },
  directionSelect: {
    background: 'var(--input-bg)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '8px 12px',
    fontFamily: "'Inter', sans-serif",
    fontSize: 12,
    color: 'var(--text)',
    outline: 'none',
    minWidth: 0,
    flex: '1 1 130px',
  },
  resultSelect: {
    background: 'var(--input-bg)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '8px 12px',
    fontFamily: "'Inter', sans-serif",
    fontSize: 12,
    color: 'var(--text)',
    outline: 'none',
    minWidth: 0,
    flex: '1 1 120px',
  },
  datesRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  dateGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  dateLabel: {
    fontSize: 12,
    color: 'var(--text-muted)',
    whiteSpace: 'nowrap',
  },
  dateInput: {
    background: 'var(--input-bg)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '8px 12px',
    fontFamily: "'Inter', sans-serif",
    fontSize: 12,
    color: 'var(--text)',
    outline: 'none',
    minWidth: 0,
  },
  clearButton: {
    padding: '8px 14px',
    background: 'none',
    border: '1px solid var(--border)',
    borderRadius: 8,
    fontFamily: "'Inter', sans-serif",
    fontSize: 12,
    color: 'var(--text-muted)',
    cursor: 'pointer',
  },
  tableCard: {
    background: 'var(--card-bg)',
    border: '1px solid var(--border)',
    borderRadius: 12,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  tableHeadRow: {
    background: 'var(--table-head)',
  },
  tableHeadCell: {
    fontSize: 11,
    fontWeight: 500,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    padding: '10px 16px',
    textAlign: 'left',
    borderBottom: '1px solid var(--border)',
    whiteSpace: 'nowrap',
  },
  emptyState: {
    padding: 32,
    textAlign: 'center',
    color: 'var(--text-muted)',
    fontSize: 13,
  },
  tableText: {
    padding: '11px 16px',
    fontSize: 12,
    color: 'var(--text)',
    whiteSpace: 'nowrap',
  },
  tableMutedText: {
    padding: '11px 16px',
    fontSize: 12,
    color: 'var(--text-muted)',
    whiteSpace: 'nowrap',
  },
  resultCell: {
    padding: '11px 16px',
    whiteSpace: 'nowrap',
  },
  summaryRow: {
    display: 'flex',
    gap: 20,
    marginTop: 14,
    fontSize: 12,
    color: 'var(--text-muted)',
    flexWrap: 'wrap',
  },
  summaryStrong: {
    color: 'var(--text)',
  },
  summaryGranted: {
    color: '#16a34a',
  },
  summaryDenied: {
    color: '#ef4444',
  },
}

export function getTableStyle(isAdmin) {
  return {
    width: '100%',
    borderCollapse: 'collapse',
    minWidth: isAdmin ? 520 : 400,
  }
}

export function getTableRowStyle(isLastRow) {
  return {
    borderBottom: isLastRow ? 'none' : '1px solid var(--border)',
  }
}

export function getResultBadgeStyle(result) {
  const granted = result === 'granted'

  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 11,
    fontWeight: 500,
    padding: '3px 8px',
    borderRadius: 20,
    background: granted ? '#f0fdf4' : '#fef2f2',
    color: granted ? '#16a34a' : '#ef4444',
    border: `1px solid ${granted ? '#bbf7d0' : '#fecaca'}`,
  }
}

export function getResultDotStyle(result) {
  return {
    width: 5,
    height: 5,
    borderRadius: '50%',
    background: result === 'granted' ? '#16a34a' : '#ef4444',
    display: 'inline-block',
  }
}
