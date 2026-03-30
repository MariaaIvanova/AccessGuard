import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'

function formatDate(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('bg-BG', { day: 'numeric', month: 'long', year: 'numeric' }) + ', ' +
    new Date(ts).toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' })
}

const inp = { background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontFamily: "'Inter', sans-serif", fontSize: 13, color: 'var(--text)', outline: 'none' }

function Badge({ type }) {
  const styles = {
    green: { background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' },
    red: { background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca' },
    amber: { background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' },
    gray: { background: 'var(--input-bg)', color: 'var(--text-muted)', border: '1px solid var(--border)' },
  }
  const map = {
    active: ['green', 'Активен'], blocked: ['red', 'Блокиран'], pending: ['amber', 'Изчаква'],
    admin: ['amber', 'Администратор'], user: ['gray', 'Потребител'],
    approved: ['green', 'Одобрено'], rejected: ['red', 'Отказано'],
  }
  const [color, label] = map[type] || ['gray', type]
  return <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 8px', borderRadius: 20, ...styles[color] }}>{label}</span>
}

const TABS = ['Потребители', 'Запитвания', 'Черен списък', 'Одит лог']
const REQUEST_LABELS = { pin: 'ПИН код', fingerprint: 'Пръстов отпечатък', nfc: 'NFC карта', other: 'Друго' }
const ACTION_LABELS = {
  emergency_lock: 'Аварийно заключване',
  emergency_unlock: 'Деактивиране',
  approve_user: 'Одобрен потребител',
  block_user: 'Блокиран потребител',
  make_admin: 'Направен администратор',
  blacklist_user: 'Добавен в черен списък',
  unblacklist_user: 'Премахнат от черен списък',
  request_approved: 'Одобрено запитване',
  request_rejected: 'Отказано запитване',
}

export default function Admin() {
  const [tab, setTab] = useState(0)
  const [users, setUsers] = useState([])
  const [requests, setRequests] = useState([])
  const [auditLogs, setAuditLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState(null)
  const [search, setSearch] = useState('')
  const navigate = useNavigate()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { navigate('/login'); return }
    setCurrentUser(user)

    const { data: prof } = await supabase.from('users').select('role').eq('id', user.id).single()
    if (prof?.role !== 'admin') { navigate('/dashboard'); return }

    const { data: u } = await supabase.from('users').select('*').order('created_at', { ascending: false })
    setUsers(u || [])

    const { data: r } = await supabase.from('requests')
      .select('*, users(first_name, last_name, email)')
      .order('created_at', { ascending: false })
    setRequests(r || [])

    const { data: a } = await supabase.from('audit_logs')
      .select('*, users:admin_id(first_name, last_name)')
      .order('timestamp', { ascending: false })
      .limit(100)
    setAuditLogs(a || [])

    setLoading(false)
  }

  async function approveUser(id) {
    await supabase.from('users').update({ status: 'active' }).eq('id', id)
    await logAction('approve_user', id)
    loadData()
  }

  async function blockUser(id) {
    await supabase.from('users').update({ status: 'blocked' }).eq('id', id)
    await logAction('block_user', id)
    loadData()
  }

  async function makeAdmin(id) {
    if (!window.confirm('Сигурни ли сте? Потребителят ще получи пълни права.')) return
    await supabase.from('users').update({ role: 'admin' }).eq('id', id)
    await logAction('make_admin', id)
    loadData()
  }

  async function toggleBlacklist(id, current) {
    const newVal = !current
    await supabase.from('users').update({ is_blacklisted: newVal }).eq('id', id)
    await logAction(newVal ? 'blacklist_user' : 'unblacklist_user', id)
    loadData()
  }

  async function handleRequest(id, status, userId) {
    await supabase.from('requests').update({ status, handled_by: currentUser.id }).eq('id', id)
    await logAction(`request_${status}`, userId, { request_id: id })
    loadData()
  }

  async function logAction(action, targetId, details = {}) {
    await supabase.from('audit_logs').insert({ admin_id: currentUser.id, action, target_user_id: targetId, details })
  }

  const filteredUsers = users.filter(u =>
    !search || (u.first_name + ' ' + u.last_name + ' ' + u.email).toLowerCase().includes(search.toLowerCase())
  )
  const blacklisted = users.filter(u => u.is_blacklisted)
  const pendingReqs = requests.filter(r => r.status === 'pending')

  if (loading) return <Layout><div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Зареждане...</div></Layout>

  return (
    <Layout>
      <main style={{ padding: '28px 32px 40px', background: 'var(--bg)', minHeight: 'calc(100vh - 56px)' }}>

        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.5, color: 'var(--text)', marginBottom: 3 }}>Администрация</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {users.length} потребители · {pendingReqs.length} чакащи запитвания · {blacklisted.length} в черен списък
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
          {TABS.map((t, i) => (
            <button key={t} onClick={() => setTab(i)} style={{ padding: '8px 16px', background: 'none', border: 'none', borderBottom: `2px solid ${tab === i ? 'var(--text)' : 'transparent'}`, fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 500, color: tab === i ? 'var(--text)' : 'var(--text-muted)', cursor: 'pointer', marginBottom: -1, position: 'relative', display: 'flex', alignItems: 'center', gap: 6 }}>
              {t}
              {i === 1 && pendingReqs.length > 0 && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 10, background: '#f59e0b', color: '#fff' }}>{pendingReqs.length}</span>}
              {i === 2 && blacklisted.length > 0 && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 10, background: '#ef4444', color: '#fff' }}>{blacklisted.length}</span>}
            </button>
          ))}
        </div>

        {/* USERS */}
        {tab === 0 && (
          <div>
            <input style={{ ...inp, width: 300, marginBottom: 16 }} placeholder="Търсене по име или имейл..." value={search} onChange={e => setSearch(e.target.value)} />
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--table-head)' }}>
                    {['Потребител', 'Имейл', 'Роля', 'Статус', 'Действия'].map(h => (
                      <th key={h} style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, padding: '10px 20px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((u, i) => (
                    <tr key={u.id} style={{ borderBottom: i < filteredUsers.length - 1 ? '1px solid var(--border)' : 'none', opacity: u.is_blacklisted ? 0.55 : 1 }}>
                      <td style={{ padding: '12px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--input-bg)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
                            {u.avatar_url ? <img src={u.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} /> : `${u.first_name?.[0] || ''}${u.last_name?.[0] || ''}`}
                          </div>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{u.first_name} {u.last_name}</div>
                            {u.is_blacklisted && <div style={{ fontSize: 10, color: '#ef4444', fontWeight: 500 }}>Черен списък</div>}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--text-muted)' }}>{u.email}</td>
                      <td style={{ padding: '12px 20px' }}><Badge type={u.role} /></td>
                      <td style={{ padding: '12px 20px' }}><Badge type={u.status} /></td>
                      <td style={{ padding: '12px 20px' }}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {u.status === 'pending' && (
                            <button onClick={() => approveUser(u.id)} style={{ padding: '4px 10px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 500, cursor: 'pointer', color: '#16a34a' }}>Одобри</button>
                          )}
                          {u.status === 'active' && u.id !== currentUser?.id && (
                            <button onClick={() => blockUser(u.id)} style={{ padding: '4px 10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 500, cursor: 'pointer', color: '#ef4444' }}>Блокирай</button>
                          )}
                          {u.role !== 'admin' && u.id !== currentUser?.id && (
                            <button onClick={() => makeAdmin(u.id)} style={{ padding: '4px 10px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 500, cursor: 'pointer', color: '#92400e' }}>Направи админ</button>
                          )}
                          {u.id !== currentUser?.id && (
                            <button onClick={() => toggleBlacklist(u.id, u.is_blacklisted)} style={{ padding: '4px 10px', background: u.is_blacklisted ? '#f0fdf4' : '#fef2f2', border: `1px solid ${u.is_blacklisted ? '#bbf7d0' : '#fecaca'}`, borderRadius: 6, fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 500, cursor: 'pointer', color: u.is_blacklisted ? '#16a34a' : '#ef4444' }}>
                              {u.is_blacklisted ? 'Премахни от ЧС' : 'Черен списък'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* REQUESTS */}
        {tab === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {requests.length === 0
              ? <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Няма запитвания</div>
              : requests.map(r => (
                <div key={r.id} style={{ background: 'var(--card-bg)', border: `1px solid ${r.status === 'pending' ? '#fde68a' : 'var(--border)'}`, borderRadius: 12, padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{r.users?.first_name} {r.users?.last_name}</div>
                        <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 8px', borderRadius: 20, background: 'var(--input-bg)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>{REQUEST_LABELS[r.type] || r.type}</span>
                        <Badge type={r.status} />
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{r.users?.email}</div>
                      <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>{r.message}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 6 }}>{formatDate(r.created_at)}</div>
                    </div>
                    {r.status === 'pending' && (
                      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                        <button onClick={() => handleRequest(r.id, 'approved', r.user_id)} style={{ padding: '7px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 500, cursor: 'pointer', color: '#16a34a' }}>Одобри</button>
                        <button onClick={() => handleRequest(r.id, 'rejected', r.user_id)} style={{ padding: '7px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 500, cursor: 'pointer', color: '#ef4444' }}>Откажи</button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            }
          </div>
        )}

        {/* BLACKLIST */}
        {tab === 2 && (
          <div>
            {blacklisted.length === 0
              ? <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Черният списък е празен</div>
              : (
                <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'var(--table-head)' }}>
                        {['Потребител', 'Имейл', 'Статус акаунт', 'Действие'].map(h => (
                          <th key={h} style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, padding: '10px 20px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {blacklisted.map((u, i) => (
                        <tr key={u.id} style={{ borderBottom: i < blacklisted.length - 1 ? '1px solid var(--border)' : 'none' }}>
                          <td style={{ padding: '12px 20px', fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{u.first_name} {u.last_name}</td>
                          <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--text-muted)' }}>{u.email}</td>
                          <td style={{ padding: '12px 20px' }}><Badge type={u.status} /></td>
                          <td style={{ padding: '12px 20px' }}>
                            <button onClick={() => toggleBlacklist(u.id, true)} style={{ padding: '6px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 500, cursor: 'pointer', color: '#16a34a' }}>
                              Премахни от черния списък
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            }
          </div>
        )}

        {/* AUDIT LOG */}
        {tab === 3 && (
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--table-head)' }}>
                  {['Дата и час', 'Администратор', 'Действие'].map(h => (
                    <th key={h} style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, padding: '10px 20px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {auditLogs.length === 0
                  ? <tr><td colSpan={3} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Няма записи</td></tr>
                  : auditLogs.map((a, i) => (
                    <tr key={a.id} style={{ borderBottom: i < auditLogs.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <td style={{ padding: '11px 20px', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{formatDate(a.timestamp)}</td>
                      <td style={{ padding: '11px 20px', fontSize: 13, color: 'var(--text)' }}>{a.users?.first_name} {a.users?.last_name}</td>
                      <td style={{ padding: '11px 20px', fontSize: 13, color: 'var(--text)' }}>{ACTION_LABELS[a.action] || a.action}</td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        )}
      </main>
    </Layout>
  )
}
