import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import AppLoader from '../components/AppLoader'
import { supabase } from '../supabase'

const METHOD_LABELS = { fingerprint: 'Пръстов отпечатък', pin: 'ПИН код', nfc: 'NFC карта', qr: 'QR код', remote: 'Дистанционно' }
const DIRECTION_LABELS = { in: 'Влизане', out: 'Излизане' }

const inp = {
  background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 8,
  padding: '8px 12px', fontFamily: "'Inter', sans-serif", fontSize: 12,
  color: 'var(--text)', outline: 'none', minWidth: 0,
}

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
      <main className="page-main" style={{ background: 'var(--bg)', minHeight: 'calc(100vh - 56px)' }}>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.5, color: 'var(--text)', marginBottom: 3 }}>История на достъп</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {isAdmin ? 'Всички потребители' : 'Само вашите влизания'} — {filtered.length} записа
            </div>
          </div>
          <button onClick={exportCSV} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 500, cursor: 'pointer', color: 'var(--text)', whiteSpace: 'nowrap', flexShrink: 0 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Изтегли CSV
          </button>
        </div>

        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: '2 1 180px' }}>
              <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)', pointerEvents: 'none' }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input style={{ ...inp, width: '100%', paddingLeft: 32 }} placeholder="Търсене..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            {isAdmin && (
              <select style={{ ...inp, flex: '1 1 140px' }} value={filterUser} onChange={(e) => setFilterUser(e.target.value)}>
                <option value="all">Всички потребители</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
              </select>
            )}
            <select style={{ ...inp, flex: '1 1 130px' }} value={filterMethod} onChange={(e) => setFilterMethod(e.target.value)}>
              <option value="all">Всички методи</option>
              <option value="fingerprint">Пръстов отпечатък</option>
              <option value="pin">ПИН код</option>
              <option value="nfc">NFC карта</option>
              <option value="remote">Дистанционно</option>
            </select>
            <select style={{ ...inp, flex: '1 1 130px' }} value={filterDirection} onChange={(e) => setFilterDirection(e.target.value)}>
              <option value="all">Влизане и излизане</option>
              <option value="in">Само влизания</option>
              <option value="out">Само излизания</option>
            </select>
            <select style={{ ...inp, flex: '1 1 120px' }} value={filterResult} onChange={(e) => setFilterResult(e.target.value)}>
              <option value="all">Всички статуси</option>
              <option value="granted">Разрешени</option>
              <option value="denied">Отказани</option>
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>От:</span>
              <input type="date" style={{ ...inp, minWidth: 0 }} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>До:</span>
              <input type="date" style={{ ...inp, minWidth: 0 }} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            {hasFilters && (
              <button style={{ padding: '8px 14px', background: 'none', border: '1px solid var(--border)', borderRadius: 8, fontFamily: "'Inter', sans-serif", fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }} onClick={clearFilters}>
                Изчисти филтрите
              </button>
            )}
          </div>
        </div>

        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12 }}>
          <div className="table-scroll">
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: isAdmin ? 520 : 400 }}>
              <thead>
                <tr style={{ background: 'var(--table-head)' }}>
                  {['Дата и час', ...(isAdmin ? ['Потребител'] : []), 'Посока', 'Метод', 'Статус'].map((h) => (
                    <th key={h} style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, padding: '10px 16px', textAlign: 'left', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={isAdmin ? 5 : 4} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>{hasFilters ? 'Няма резултати' : 'Няма записи'}</td></tr>
                ) : filtered.map((log, i) => (
                  <tr key={log.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <td style={{ padding: '11px 16px', fontSize: 12, color: 'var(--text)', whiteSpace: 'nowrap' }}>{formatDate(log.timestamp)}</td>
                    {isAdmin && <td style={{ padding: '11px 16px', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{log.users ? `${log.users.first_name} ${log.users.last_name}` : '—'}</td>}
                    <td style={{ padding: '11px 16px', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{DIRECTION_LABELS[log.direction] || '—'}</td>
                    <td style={{ padding: '11px 16px', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{METHOD_LABELS[log.method] || log.method}</td>
                    <td style={{ padding: '11px 16px', whiteSpace: 'nowrap' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 500, padding: '3px 8px', borderRadius: 20, background: log.result === 'granted' ? '#f0fdf4' : '#fef2f2', color: log.result === 'granted' ? '#16a34a' : '#ef4444', border: `1px solid ${log.result === 'granted' ? '#bbf7d0' : '#fecaca'}` }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: log.result === 'granted' ? '#16a34a' : '#ef4444', display: 'inline-block' }} />
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
          <div style={{ display: 'flex', gap: 20, marginTop: 14, fontSize: 12, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
            <span>Общо: <strong style={{ color: 'var(--text)' }}>{filtered.length}</strong></span>
            <span>Разрешени: <strong style={{ color: '#16a34a' }}>{filtered.filter((l) => l.result === 'granted').length}</strong></span>
            <span>Отказани: <strong style={{ color: '#ef4444' }}>{filtered.filter((l) => l.result === 'denied').length}</strong></span>
          </div>
        )}
      </main>
    </Layout>
  )
}