import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import AppLoader from '../components/AppLoader'
import { supabase } from '../supabase'
import {
  getResultBadgeStyle,
  getResultDotStyle,
  getTableRowStyle,
  getTableStyle,
  historyStyles,
} from './History.styles'

const METHOD_LABELS = { fingerprint: 'Пръстов отпечатък', pin: 'ПИН код', nfc: 'NFC карта', qr: 'QR код', remote: 'Дистанционно' }
const DIRECTION_LABELS = { in: 'Влизане', out: 'Излизане' }

function formatDate(timestamp) {
  if (!timestamp) return '—'
  const date = new Date(timestamp)
  return `${date.toLocaleDateString('bg-BG', { day: 'numeric', month: 'long', year: 'numeric' })}, ${date.toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' })}`
}

export default function History() {
  const [profile, setProfile] = useState(null)
  const [logs, setLogs] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterMethod, setFilterMethod] = useState('all')
  const [filterResult, setFilterResult] = useState('all')
  const [filterDirection, setFilterDirection] = useState('all')
  const [filterUser, setFilterUser] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const navigate = useNavigate()

  const loadData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { navigate('/login'); return }
    const { data: prof } = await supabase.from('users').select('*').eq('id', user.id).single()
    setProfile(prof)
    if (prof?.role === 'admin') {
      const { data } = await supabase.from('access_logs').select('*, doors(name), users(first_name, last_name, email)').order('timestamp', { ascending: false }).limit(1000)
      setLogs(data || [])
      const { data: allUsers } = await supabase.from('users').select('id, first_name, last_name').eq('status', 'active').order('first_name')
      setUsers(allUsers || [])
    } else {
      const { data } = await supabase.from('access_logs').select('*, doors(name)').eq('user_id', user.id).order('timestamp', { ascending: false }).limit(500)
      setLogs(data || [])
    }
    setLoading(false)
  }, [navigate])

  useEffect(() => {
    const id = window.setTimeout(() => void loadData(), 0)
    return () => window.clearTimeout(id)
  }, [loadData])

  // Realtime: ако bridge запише нов ред, го добавяме веднага в списъка
  useEffect(() => {
    if (!profile) return
    const channel = supabase.channel('history-access-logs')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'access_logs',
      }, async (msg) => {
        const newLog = msg.new
        // Не-админ потребители виждат само своите логове
        if (profile.role !== 'admin' && newLog.user_id !== profile.id) return
        // Догребваме join-натите данни (doors.name, users.first_name)
        const { data } = await supabase.from('access_logs')
          .select('*, doors(name), users(first_name, last_name, email)')
          .eq('id', newLog.id).single()
        if (data) setLogs((prev) => [data, ...prev])
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [profile])

  function clearFilters() {
    setSearch(''); setFilterMethod('all'); setFilterResult('all')
    setFilterDirection('all'); setFilterUser('all'); setDateFrom(''); setDateTo('')
  }

  function exportCSV() {
    const isAdmin = profile?.role === 'admin'
    const headers = isAdmin ? ['Дата и час', 'Потребител', 'Посока', 'Метод', 'Статус', 'Врата'] : ['Дата и час', 'Посока', 'Метод', 'Статус', 'Врата']
    const rows = [headers, ...filtered.map((log) => [
      formatDate(log.timestamp),
      ...(isAdmin ? [`${log.users?.first_name || ''} ${log.users?.last_name || ''}`] : []),
      DIRECTION_LABELS[log.direction] || '—', METHOD_LABELS[log.method] || log.method,
      log.result === 'granted' ? 'Разрешен' : 'Отказан', log.doors?.name || '—',
    ])]
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'история.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const hasFilters = filterMethod !== 'all' || filterResult !== 'all' || filterDirection !== 'all' || filterUser !== 'all' || dateFrom || dateTo || search
  const isAdmin = profile?.role === 'admin'
  let filtered = [...logs]
  if (filterMethod !== 'all') filtered = filtered.filter((l) => l.method === filterMethod)
  if (filterResult !== 'all') filtered = filtered.filter((l) => l.result === filterResult)
  if (filterDirection !== 'all') filtered = filtered.filter((l) => l.direction === filterDirection)
  if (filterUser !== 'all') filtered = filtered.filter((l) => l.user_id === filterUser)
  if (dateFrom) filtered = filtered.filter((l) => new Date(l.timestamp) >= new Date(dateFrom))
  if (dateTo) filtered = filtered.filter((l) => new Date(l.timestamp) <= new Date(`${dateTo}T23:59:59`))
  if (search.trim()) {
    const q = search.toLowerCase()
    filtered = filtered.filter((l) =>
      formatDate(l.timestamp).toLowerCase().includes(q) ||
      (METHOD_LABELS[l.method] || '').toLowerCase().includes(q) ||
      `${l.users?.first_name || ''} ${l.users?.last_name || ''}`.toLowerCase().includes(q)
    )
  }

  if (loading) return <Layout><AppLoader /></Layout>

  return (
    <Layout>
      <main className="page-main" style={historyStyles.main}>

        <div style={historyStyles.headerRow}>
          <div>
            <div style={historyStyles.title}>История на достъп</div>
            <div style={historyStyles.subtitle}>
              {isAdmin ? 'Всички потребители' : 'Само вашите влизания'} — {filtered.length} записа
            </div>
          </div>
          <button onClick={exportCSV} style={historyStyles.exportButton}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Изтегли CSV
          </button>
        </div>

        <div style={historyStyles.filtersCard}>
          <div style={historyStyles.filtersRow}>
            <div style={historyStyles.searchWrap}>
              <svg style={historyStyles.searchIcon} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input style={historyStyles.searchInput} placeholder="Търсене..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            {isAdmin && (
              <select style={historyStyles.userSelect} value={filterUser} onChange={(e) => setFilterUser(e.target.value)}>
                <option value="all">Всички потребители</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
              </select>
            )}
            <select style={historyStyles.methodSelect} value={filterMethod} onChange={(e) => setFilterMethod(e.target.value)}>
              <option value="all">Всички методи</option>
              <option value="fingerprint">Пръстов отпечатък</option>
              <option value="pin">ПИН код</option>
              <option value="nfc">NFC карта</option>
              <option value="remote">Дистанционно</option>
            </select>
            <select style={historyStyles.directionSelect} value={filterDirection} onChange={(e) => setFilterDirection(e.target.value)}>
              <option value="all">Влизане и излизане</option>
              <option value="in">Само влизания</option>
              <option value="out">Само излизания</option>
            </select>
            <select style={historyStyles.resultSelect} value={filterResult} onChange={(e) => setFilterResult(e.target.value)}>
              <option value="all">Всички статуси</option>
              <option value="granted">Разрешени</option>
              <option value="denied">Отказани</option>
            </select>
          </div>
          <div style={historyStyles.datesRow}>
            <div style={historyStyles.dateGroup}>
              <span style={historyStyles.dateLabel}>От:</span>
              <input type="date" style={historyStyles.dateInput} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div style={historyStyles.dateGroup}>
              <span style={historyStyles.dateLabel}>До:</span>
              <input type="date" style={historyStyles.dateInput} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            {hasFilters && (
              <button style={historyStyles.clearButton} onClick={clearFilters}>
                Изчисти филтрите
              </button>
            )}
          </div>
        </div>

        <div style={historyStyles.tableCard}>
          <div className="table-scroll">
            <table style={getTableStyle(isAdmin)}>
              <thead>
                <tr style={historyStyles.tableHeadRow}>
                  {['Дата и час', ...(isAdmin ? ['Потребител'] : []), 'Посока', 'Метод', 'Статус'].map((h) => (
                    <th key={h} style={historyStyles.tableHeadCell}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={isAdmin ? 5 : 4} style={historyStyles.emptyState}>{hasFilters ? 'Няма резултати' : 'Няма записи'}</td></tr>
                ) : filtered.map((log, i) => (
                  <tr key={log.id} style={getTableRowStyle(i === filtered.length - 1)}>
                    <td style={historyStyles.tableText}>{formatDate(log.timestamp)}</td>
                    {isAdmin && <td style={historyStyles.tableMutedText}>{log.users ? `${log.users.first_name} ${log.users.last_name}` : '—'}</td>}
                    <td style={historyStyles.tableMutedText}>{DIRECTION_LABELS[log.direction] || '—'}</td>
                    <td style={historyStyles.tableMutedText}>{METHOD_LABELS[log.method] || log.method}</td>
                    <td style={historyStyles.resultCell}>
                      <span style={getResultBadgeStyle(log.result)}>
                        <span style={getResultDotStyle(log.result)} />
                        {log.result === 'granted' ? 'Разрешен' : 'Отказан'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {filtered.length > 0 && (
          <div style={historyStyles.summaryRow}>
            <span>Общо: <strong style={historyStyles.summaryStrong}>{filtered.length}</strong></span>
            <span>Разрешени: <strong style={historyStyles.summaryGranted}>{filtered.filter((l) => l.result === 'granted').length}</strong></span>
            <span>Отказани: <strong style={historyStyles.summaryDenied}>{filtered.filter((l) => l.result === 'denied').length}</strong></span>
          </div>
        )}
      </main>
    </Layout>
  )
}
