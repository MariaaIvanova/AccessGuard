import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'

const METHOD_LABELS = { fingerprint: 'Пръстов отпечатък', pin: 'ПИН код', nfc: 'NFC карта', qr: 'QR код', remote: 'Дистанционно' }
const DIRECTION_LABELS = { in: 'Влизане', out: 'Излизане' }

function formatDate(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toLocaleDateString('bg-BG', { day: 'numeric', month: 'long', year: 'numeric' }) + ', ' +
    d.toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' })
}

const inp = { background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontFamily: "'Inter', sans-serif", fontSize: 12, color: 'var(--text)', outline: 'none', minWidth: 0 }

export default function History() {
  const [profile, setProfile] = useState(null)
  const [logs, setLogs] = useState([])
  const [filtered, setFiltered] = useState([])
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

  useEffect(() => { loadData() }, [])

  useEffect(() => {
    let res = [...logs]
    if (filterMethod !== 'all') res = res.filter(l => l.method === filterMethod)
    if (filterResult !== 'all') res = res.filter(l => l.result === filterResult)
    if (filterDirection !== 'all') res = res.filter(l => l.direction === filterDirection)
    if (filterUser !== 'all') res = res.filter(l => l.user_id === filterUser)
    if (dateFrom) res = res.filter(l => new Date(l.timestamp) >= new Date(dateFrom))
    if (dateTo) res = res.filter(l => new Date(l.timestamp) <= new Date(dateTo + 'T23:59:59'))
    if (search.trim()) {
      const q = search.toLowerCase()
      res = res.filter(l =>
        formatDate(l.timestamp).toLowerCase().includes(q) ||
        (METHOD_LABELS[l.method] || '').toLowerCase().includes(q) ||
        (l.users?.first_name + ' ' + l.users?.last_name).toLowerCase().includes(q)
      )
    }
    setFiltered(res)
  }, [logs, search, filterMethod, filterResult, filterDirection, filterUser, dateFrom, dateTo])

  async function loadData() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { navigate('/login'); return }

    const { data: prof } = await supabase.from('users').select('*').eq('id', user.id).single()
    setProfile(prof)

    if (prof?.role === 'admin') {
      // Admin sees all logs with user info
      const { data } = await supabase
        .from('access_logs')
        .select('*, doors(name), users(first_name, last_name, email)')
        .order('timestamp', { ascending: false })
        .limit(1000)
      setLogs(data || [])

      const { data: allUsers } = await supabase.from('users').select('id, first_name, last_name').eq('status', 'active').order('first_name')
      setUsers(allUsers || [])
    } else {
      // Regular user sees only their own logs
      const { data } = await supabase
        .from('access_logs')
        .select('*, doors(name)')
        .eq('user_id', user.id)
        .order('timestamp', { ascending: false })
        .limit(500)
      setLogs(data || [])
    }

    setLoading(false)
  }

  function clearFilters() {
    setSearch(''); setFilterMethod('all'); setFilterResult('all')
    setFilterDirection('all'); setFilterUser('all'); setDateFrom(''); setDateTo('')
  }

  function exportCSV() {
    const isAdmin = profile?.role === 'admin'
    const headers = isAdmin
      ? ['Дата и час', 'Потребител', 'Посока', 'Метод', 'Статус', 'Врата']
      : ['Дата и час', 'Посока', 'Метод', 'Статус', 'Врата']
    const rows = [
      headers,
      ...filtered.map(l => {
        const base = [
          formatDate(l.timestamp),
          ...(isAdmin ? [`${l.users?.first_name || ''} ${l.users?.last_name || ''}`] : []),
          DIRECTION_LABELS[l.direction] || '—',
          METHOD_LABELS[l.method] || l.method,
          l.result === 'granted' ? 'Разрешен' : 'Отказан',
          l.doors?.name || '—',
        ]
        return base
      })
    ]
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'история.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const hasFilters = filterMethod !== 'all' || filterResult !== 'all' || filterDirection !== 'all' || filterUser !== 'all' || dateFrom || dateTo || search
  const isAdmin = profile?.role === 'admin'

  if (loading) return <Layout><div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Зареждане...</div></Layout>

  return (
    <Layout>
      <main style={{ padding: '28px 32px 40px', background: 'var(--bg)', minHeight: 'calc(100vh - 56px)' }}>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.5, color: 'var(--text)', marginBottom: 3 }}>История на достъп</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {isAdmin ? 'Всички потребители' : 'Само вашите влизания'} — {filtered.length} записа
            </div>
          </div>
          <button onClick={exportCSV} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 500, cursor: 'pointer', color: 'var(--text)', whiteSpace: 'nowrap' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Изтегли CSV
          </button>
        </div>

        {/* Filters */}
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 2, minWidth: 180 }}>
              <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)', pointerEvents: 'none' }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input style={{ ...inp, width: '100%', paddingLeft: 32 }} placeholder="Търсене..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>

            {/* Admin only — user filter */}
            {isAdmin && (
              <select style={{ ...inp, flex: 1 }} value={filterUser} onChange={e => setFilterUser(e.target.value)}>
                <option value="all">Всички потребители</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
              </select>
            )}

            <select style={{ ...inp, flex: 1 }} value={filterMethod} onChange={e => setFilterMethod(e.target.value)}>
              <option value="all">Всички методи</option>
              <option value="fingerprint">Пръстов отпечатък</option>
              <option value="pin">ПИН код</option>
              <option value="nfc">NFC карта</option>
              <option value="remote">Дистанционно</option>
            </select>
            <select style={{ ...inp, flex: 1 }} value={filterDirection} onChange={e => setFilterDirection(e.target.value)}>
              <option value="all">Влизане и излизане</option>
              <option value="in">Само влизания</option>
              <option value="out">Само излизания</option>
            </select>
            <select style={{ ...inp, flex: 1 }} value={filterResult} onChange={e => setFilterResult(e.target.value)}>
              <option value="all">Всички статуси</option>
              <option value="granted">Разрешени</option>
              <option value="denied">Отказани</option>
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>От:</span>
              <input type="date" style={inp} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>До:</span>
              <input type="date" style={inp} value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
            {hasFilters && (
              <button style={{ padding: '8px 14px', background: 'none', border: '1px solid var(--border)', borderRadius: 8, fontFamily: "'Inter', sans-serif", fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }} onClick={clearFilters}>
                Изчисти филтрите
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--table-head)' }}>
                {[
                  'Дата и час',
                  ...(isAdmin ? ['Потребител'] : []),
                  'Посока', 'Метод', 'Статус'
                ].map(h => (
                  <th key={h} style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, padding: '10px 20px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0
                ? <tr><td colSpan={isAdmin ? 5 : 4} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>{hasFilters ? 'Няма резултати' : 'Няма записи'}</td></tr>
                : filtered.map((log, i) => (
                  <tr key={log.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <td style={{ padding: '11px 20px', fontSize: 13, color: 'var(--text)' }}>{formatDate(log.timestamp)}</td>
                    {isAdmin && (
                      <td style={{ padding: '11px 20px', fontSize: 12, color: 'var(--text-muted)' }}>
                        {log.users ? `${log.users.first_name} ${log.users.last_name}` : '—'}
                      </td>
                    )}
                    <td style={{ padding: '11px 20px', fontSize: 12, color: 'var(--text-muted)' }}>{DIRECTION_LABELS[log.direction] || '—'}</td>
                    <td style={{ padding: '11px 20px', fontSize: 12, color: 'var(--text-muted)' }}>{METHOD_LABELS[log.method] || log.method}</td>
                    <td style={{ padding: '11px 20px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 500, padding: '3px 8px', borderRadius: 20, background: log.result === 'granted' ? '#f0fdf4' : '#fef2f2', color: log.result === 'granted' ? '#16a34a' : '#ef4444', border: `1px solid ${log.result === 'granted' ? '#bbf7d0' : '#fecaca'}` }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: log.result === 'granted' ? '#16a34a' : '#ef4444', display: 'inline-block' }} />
                        {log.result === 'granted' ? 'Разрешен' : 'Отказан'}
                      </span>
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>

        {filtered.length > 0 && (
          <div style={{ display: 'flex', gap: 24, marginTop: 14, fontSize: 12, color: 'var(--text-muted)' }}>
            <span>Общо: <strong style={{ color: 'var(--text)' }}>{filtered.length}</strong></span>
            <span>Разрешени: <strong style={{ color: '#16a34a' }}>{filtered.filter(l => l.result === 'granted').length}</strong></span>
            <span>Отказани: <strong style={{ color: '#ef4444' }}>{filtered.filter(l => l.result === 'denied').length}</strong></span>
          </div>
        )}
      </main>
    </Layout>
  )
}