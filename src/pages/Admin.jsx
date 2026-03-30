import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import { useDialog } from '../context/DialogContext'
import {
  REQUEST_LABELS,
  REQUEST_STATUS_LABELS,
  REQUEST_STATUS_STYLES,
  getRequestResponseMap,
} from '../requestUtils'

function formatDate(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('bg-BG', { day: 'numeric', month: 'long', year: 'numeric' }) + ', ' +
    new Date(ts).toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' })
}

const inp = {
  background: 'var(--input-bg)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '8px 12px',
  fontFamily: "'Inter', sans-serif",
  fontSize: 13,
  color: 'var(--text)',
  outline: 'none',
}

function Badge({ type }) {
  const styles = {
    green: { background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' },
    red: { background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca' },
    amber: { background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' },
    gray: { background: 'var(--input-bg)', color: 'var(--text-muted)', border: '1px solid var(--border)' },
  }

  const map = {
    active: ['green', 'Активен'],
    blocked: ['red', 'Блокиран'],
    pending: ['amber', 'Изчаква'],
    admin: ['amber', 'Администратор'],
    user: ['gray', 'Потребител'],
    approved: ['green', 'Прието'],
    rejected: ['red', 'Отказано'],
  }

  const [color, label] = map[type] || ['gray', type]
  return <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 8px', borderRadius: 20, ...styles[color] }}>{label}</span>
}

const TABS = ['Потребители', 'Запитвания', 'Черен списък', 'Одит лог']
const ACTION_LABELS = {
  emergency_lock: 'Аварийно заключване',
  emergency_unlock: 'Деактивиране',
  approve_user: 'Одобрен потребител',
  block_user: 'Блокиран потребител',
  make_admin: 'Направен администратор',
  blacklist_user: 'Добавен в черен списък',
  unblacklist_user: 'Премахнат от черен списък',
  request_approved: 'Прието запитване',
  request_rejected: 'Отказано запитване',
}

export default function Admin() {
  const [tab, setTab] = useState(0)
  const [users, setUsers] = useState([])
  const [requests, setRequests] = useState([])
  const [auditLogs, setAuditLogs] = useState([])
  const [requestLogs, setRequestLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState(null)
  const [search, setSearch] = useState('')
  const [responseDrafts, setResponseDrafts] = useState({})
  const [requestErrors, setRequestErrors] = useState({})
  const navigate = useNavigate()
  const { showConfirm } = useDialog()

  const loadData = useCallback(async () => {
    setLoading(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      navigate('/login')
      return
    }

    setCurrentUser(user)

    const { data: prof } = await supabase.from('users').select('role').eq('id', user.id).single()
    if (prof?.role !== 'admin') {
      navigate('/dashboard')
      return
    }

    const [usersResult, requestsResult, auditResult, requestLogsResult] = await Promise.all([
      supabase.from('users').select('*').order('created_at', { ascending: false }),
      supabase
        .from('requests')
        .select('*, request_user:users!requests_user_id_fkey(first_name, last_name, email)')
        .order('created_at', { ascending: false }),
      supabase
        .from('audit_logs')
        .select('*, admin:users!audit_logs_admin_id_fkey(first_name, last_name)')
        .order('timestamp', { ascending: false })
        .limit(100),
      supabase.from('audit_logs')
        .select('*, admin:users!audit_logs_admin_id_fkey(first_name, last_name)')
        .in('action', ['request_approved', 'request_rejected'])
        .order('timestamp', { ascending: false })
        .limit(300),
    ])

    setUsers(usersResult.data || [])
    setRequests(requestsResult.data || [])
    setAuditLogs(auditResult.data || [])
    setRequestLogs(requestLogsResult.data || [])
    setLoading(false)
  }, [navigate])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadData()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [loadData])

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
    const confirmed = await showConfirm({
      title: 'Направи администратор',
      message: 'Сигурни ли сте? Потребителят ще получи пълни права.',
      confirmLabel: 'Направи админ',
      cancelLabel: 'Отказ',
      tone: 'warning',
    })

    if (!confirmed) return
    await supabase.from('users').update({ role: 'admin' }).eq('id', id)
    await logAction('make_admin', id)
    loadData()
  }

  async function toggleBlacklist(id, current) {
    const newValue = !current
    await supabase.from('users').update({ is_blacklisted: newValue }).eq('id', id)
    await logAction(newValue ? 'blacklist_user' : 'unblacklist_user', id)
    loadData()
  }

  async function handleRequest(request, status) {
    const response = (responseDrafts[request.id] || '').trim()
    if (!response) {
      setRequestErrors((current) => ({
        ...current,
        [request.id]: 'Добавете кратък отговор към потребителя.',
      }))
      return
    }

    setRequestErrors((current) => ({
      ...current,
      [request.id]: '',
    }))

    await supabase.from('requests').update({ status, handled_by: currentUser.id }).eq('id', request.id)
    await logAction(`request_${status}`, request.user_id, {
      request_id: request.id,
      response,
    })

    setResponseDrafts((current) => ({
      ...current,
      [request.id]: '',
    }))

    loadData()
  }

  async function logAction(action, targetId, details = {}) {
    await supabase.from('audit_logs').insert({
      admin_id: currentUser.id,
      action,
      target_user_id: targetId,
      details,
    })
  }

  const filteredUsers = users.filter((user) =>
    !search || `${user.first_name} ${user.last_name} ${user.email}`.toLowerCase().includes(search.toLowerCase())
  )
  const blacklisted = users.filter((user) => user.is_blacklisted)
  const pendingReqs = requests.filter((request) => request.status === 'pending')
  const responseByRequestId = useMemo(() => getRequestResponseMap(requestLogs), [requestLogs])

  if (loading) {
    return <Layout><div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Зареждане...</div></Layout>
  }

  return (
    <Layout>
      <main style={{ padding: '28px 32px 40px', background: 'var(--bg)', minHeight: 'calc(100vh - 56px)' }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.5, color: 'var(--text)', marginBottom: 3 }}>Администрация</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {users.length} потребители · {pendingReqs.length} чакащи запитвания · {blacklisted.length} в черен списък
          </div>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
          {TABS.map((label, index) => (
            <button
              key={label}
              onClick={() => setTab(index)}
              style={{
                padding: '8px 16px',
                background: 'none',
                border: 'none',
                borderBottom: `2px solid ${tab === index ? 'var(--text)' : 'transparent'}`,
                fontFamily: "'Inter', sans-serif",
                fontSize: 13,
                fontWeight: 500,
                color: tab === index ? 'var(--text)' : 'var(--text-muted)',
                cursor: 'pointer',
                marginBottom: -1,
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {label}
              {index === 1 && pendingReqs.length > 0 && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 10, background: '#f59e0b', color: '#fff' }}>{pendingReqs.length}</span>
              )}
              {index === 2 && blacklisted.length > 0 && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 10, background: '#ef4444', color: '#fff' }}>{blacklisted.length}</span>
              )}
            </button>
          ))}
        </div>

        {tab === 0 && (
          <div>
            <input
              style={{ ...inp, width: 300, marginBottom: 16 }}
              placeholder="Търсене по име или имейл..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--table-head)' }}>
                    {['Потребител', 'Имейл', 'Роля', 'Статус', 'Действия'].map((header) => (
                      <th key={header} style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, padding: '10px 20px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user, index) => (
                    <tr key={user.id} style={{ borderBottom: index < filteredUsers.length - 1 ? '1px solid var(--border)' : 'none', opacity: user.is_blacklisted ? 0.55 : 1 }}>
                      <td style={{ padding: '12px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--input-bg)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
                            {user.avatar_url ? <img src={user.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} /> : `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}`}
                          </div>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{user.first_name} {user.last_name}</div>
                            {user.is_blacklisted && <div style={{ fontSize: 10, color: '#ef4444', fontWeight: 500 }}>Черен списък</div>}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--text-muted)' }}>{user.email}</td>
                      <td style={{ padding: '12px 20px' }}><Badge type={user.role} /></td>
                      <td style={{ padding: '12px 20px' }}><Badge type={user.status} /></td>
                      <td style={{ padding: '12px 20px' }}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {user.status === 'pending' && (
                            <button onClick={() => approveUser(user.id)} style={{ padding: '4px 10px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 500, cursor: 'pointer', color: '#16a34a' }}>Одобри</button>
                          )}
                          {user.status === 'active' && user.id !== currentUser?.id && (
                            <button onClick={() => blockUser(user.id)} style={{ padding: '4px 10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 500, cursor: 'pointer', color: '#ef4444' }}>Блокирай</button>
                          )}
                          {user.role !== 'admin' && user.id !== currentUser?.id && (
                            <button onClick={() => makeAdmin(user.id)} style={{ padding: '4px 10px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 500, cursor: 'pointer', color: '#92400e' }}>Направи админ</button>
                          )}
                          {user.id !== currentUser?.id && (
                            <button onClick={() => toggleBlacklist(user.id, user.is_blacklisted)} style={{ padding: '4px 10px', background: user.is_blacklisted ? '#f0fdf4' : '#fef2f2', border: `1px solid ${user.is_blacklisted ? '#bbf7d0' : '#fecaca'}`, borderRadius: 6, fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 500, cursor: 'pointer', color: user.is_blacklisted ? '#16a34a' : '#ef4444' }}>
                              {user.is_blacklisted ? 'Премахни от ЧС' : 'Черен списък'}
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

        {tab === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {requests.length === 0 ? (
              <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Няма запитвания</div>
            ) : (
              requests.map((request) => {
                const responseEntry = responseByRequestId[request.id]
                const draft = responseDrafts[request.id] || ''

                return (
                  <div key={request.id} style={{ background: 'var(--card-bg)', border: `1px solid ${request.status === 'pending' ? '#fde68a' : 'var(--border)'}`, borderRadius: 12, padding: '16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{request.request_user?.first_name} {request.request_user?.last_name}</div>
                          <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 8px', borderRadius: 20, background: 'var(--input-bg)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>{REQUEST_LABELS[request.type] || request.type}</span>
                          <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 8px', borderRadius: 20, ...REQUEST_STATUS_STYLES[request.status] }}>{REQUEST_STATUS_LABELS[request.status] || request.status}</span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{request.request_user?.email}</div>
                        <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5, marginBottom: 8 }}>{request.message}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-light)' }}>{formatDate(request.created_at)}</div>

                        {request.status === 'pending' ? (
                          <div style={{ marginTop: 14 }}>
                            <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>Отговор към потребителя</div>
                            <textarea
                              style={{ ...inp, width: '100%', minHeight: 84, resize: 'vertical', lineHeight: 1.5 }}
                              placeholder="Напр. Приемам заявката. Елате утре в 10:00 за регистрация."
                              value={draft}
                              onChange={(event) => {
                                const value = event.target.value
                                setResponseDrafts((current) => ({ ...current, [request.id]: value }))
                                if (requestErrors[request.id]) {
                                  setRequestErrors((current) => ({ ...current, [request.id]: '' }))
                                }
                              }}
                            />
                            {requestErrors[request.id] && (
                              <div style={{ fontSize: 12, color: '#ef4444', marginTop: 6 }}>{requestErrors[request.id]}</div>
                            )}
                          </div>
                        ) : (
                          <div style={{ marginTop: 14, padding: '10px 12px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 8 }}>
                            <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>Отговор към потребителя</div>
                            <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>
                              {responseEntry?.response || 'Няма добавен текстов отговор.'}
                            </div>
                            {responseEntry?.timestamp && (
                              <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 6 }}>
                                {responseEntry.adminName ? `${responseEntry.adminName} · ` : ''}{formatDate(responseEntry.timestamp)}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {request.status === 'pending' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0, width: 150 }}>
                          <button onClick={() => handleRequest(request, 'approved')} style={{ padding: '8px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 500, cursor: 'pointer', color: '#16a34a' }}>Приеми</button>
                          <button onClick={() => handleRequest(request, 'rejected')} style={{ padding: '8px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 500, cursor: 'pointer', color: '#ef4444' }}>Откажи</button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}

        {tab === 2 && (
          <div>
            {blacklisted.length === 0 ? (
              <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Черният списък е празен</div>
            ) : (
              <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--table-head)' }}>
                      {['Потребител', 'Имейл', 'Статус акаунт', 'Действие'].map((header) => (
                        <th key={header} style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, padding: '10px 20px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {blacklisted.map((user, index) => (
                      <tr key={user.id} style={{ borderBottom: index < blacklisted.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <td style={{ padding: '12px 20px', fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{user.first_name} {user.last_name}</td>
                        <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--text-muted)' }}>{user.email}</td>
                        <td style={{ padding: '12px 20px' }}><Badge type={user.status} /></td>
                        <td style={{ padding: '12px 20px' }}>
                          <button onClick={() => toggleBlacklist(user.id, true)} style={{ padding: '6px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 500, cursor: 'pointer', color: '#16a34a' }}>
                            Премахни от черния списък
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === 3 && (
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--table-head)' }}>
                  {['Дата и час', 'Администратор', 'Действие'].map((header) => (
                    <th key={header} style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, padding: '10px 20px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {auditLogs.length === 0 ? (
                  <tr><td colSpan={3} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Няма записи</td></tr>
                ) : (
                  auditLogs.map((log, index) => (
                    <tr key={log.id} style={{ borderBottom: index < auditLogs.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <td style={{ padding: '11px 20px', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{formatDate(log.timestamp)}</td>
                      <td style={{ padding: '11px 20px', fontSize: 13, color: 'var(--text)' }}>{log.admin?.first_name} {log.admin?.last_name}</td>
                      <td style={{ padding: '11px 20px', fontSize: 13, color: 'var(--text)' }}>{ACTION_LABELS[log.action] || log.action}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </Layout>
  )
}
