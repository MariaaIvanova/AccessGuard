export const REQUEST_LABELS = {
  other: 'Запитване',
  pin: 'ПИН код',
  fingerprint: 'Пръстов отпечатък',
  nfc: 'NFC карта',
}

export const REQUEST_STATUS_STYLES = {
  pending: { background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' },
  approved: { background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' },
  rejected: { background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca' },
}

export const REQUEST_STATUS_LABELS = {
  pending: 'Изчаква',
  approved: 'Прието',
  rejected: 'Отказано',
}

export function getRequestResponseMap(auditLogs) {
  if (!Array.isArray(auditLogs)) return {}

  return auditLogs.reduce((accumulator, log) => {
    const requestId = log?.details?.request_id
    const admin = log?.admin || log?.users
    if (!requestId || accumulator[requestId]) return accumulator

    accumulator[requestId] = {
      response: log?.details?.response || '',
      timestamp: log?.timestamp || null,
      adminName: admin ? `${admin.first_name || ''} ${admin.last_name || ''}`.trim() : '',
      action: log?.action || '',
    }

    return accumulator
  }, {})
}
