import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import AppLoader from '../components/AppLoader'
import { useDialog } from '../context/DialogContext'
import {
  REQUEST_LABELS, REQUEST_STATUS_LABELS, REQUEST_STATUS_STYLES, getRequestResponseMap,
} from '../requestUtils'

function formatDate(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('bg-BG', { day: 'numeric', month: 'long', year: 'numeric' }) + ', ' +
    new Date(ts).toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' })
}

const inp = {
  background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 8,
  padding: '8px 12px', fontFamily: "'Inter', sans-serif", fontSize: 13,
  color: 'var(--text)', outline: 'none',
}

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
    approved: ['green', 'Прието'], rejected: ['red', 'Отказано'],
  }
  const [color, label] = map[type] || ['gray', type]
  return <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 8px', borderRadius: 20, ...styles[color] }}>{label}</span>
}

function Toggle({ value, onChange }) {
  return (
    <button onClick={() => onChange(!value)} style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', background: value ? '#16a34a' : 'var(--border)', position: 'relative', flexShrink: 0, transition: 'background 0.2s' }}>
      <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: value ? 23 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
    </button>
  )
}

const TABS = ['Потребители', 'Запитвания', 'Черен списък', 'Одит лог', 'Врата']
const ACTION_LABELS = {
  emergency_lock: 'Аварийно заключване', emergency_unlock: 'Деактивиране',
  approve_user: 'Одобрен потребител', block_user: 'Блокиран потребител',
  make_admin: 'Направен администратор', blacklist_user: 'Добавен в черен списък',
  unblacklist_user: 'Премахнат от черен списък', request_approved: 'Прието запитване',
  request_rejected: 'Отказано запитване', door_settings_updated: 'Настройки на вратата обновени',
  failed_attempts_reset: 'Нулирани неуспешни опити', temp_access_created: 'Генериран временен QR достъп',
}

const MAINTENANCE_KEY = 'door_maintenance_settings'

function getTempAccessAuditKey(doorId, validUntil) {
  return `door:${doorId || ''}|until:${validUntil || ''}`
}

function getInitialMaintenanceSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(MAINTENANCE_KEY) || 'null')
    if (!saved) return { enabled: false, start: '23:00', end: '06:00' }
    return { enabled: saved.enabled ?? false, start: saved.start ?? '23:00', end: saved.end ?? '06:00' }
  } catch { return { enabled: false, start: '23:00', end: '06:00' } }
}

function isInMaintenance(enabled, start, end) {
  if (!enabled) return false
  const now = new Date()
  const cur = now.getHours() * 60 + now.getMinutes()
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const s = sh * 60 + sm; const e = eh * 60 + em
  return s <= e ? (cur >= s && cur <= e) : (cur >= s || cur <= e)
}

export default function Admin() {
  const initialMaintenance = getInitialMaintenanceSettings()
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
  const [door, setDoor] = useState(null)
  const [doorWarning, setDoorWarning] = useState(5)
  const [doorAutoClose, setDoorAutoClose] = useState(false)
  const [doorSaving, setDoorSaving] = useState(false)
  const [doorSaveMsg, setDoorSaveMsg] = useState('')
  const [isLive, setIsLive] = useState(false)
  const [resettingAttempts, setResettingAttempts] = useState(false)
  const [maintEnabled, setMaintEnabled] = useState(initialMaintenance.enabled)
  const [maintStart, setMaintStart] = useState(initialMaintenance.start)
  const [maintEnd, setMaintEnd] = useState(initialMaintenance.end)
  const [maintSaved, setMaintSaved] = useState(false)
  const [qrGuest, setQrGuest] = useState('')
  const [qrFrom, setQrFrom] = useState('')
  const [qrUntil, setQrUntil] = useState('')
  const [qrGenerating, setQrGenerating] = useState(false)
  const [qrLatest, setQrLatest] = useState(null)
  const [tempCodes, setTempCodes] = useState([])
  const [tempAccessGuestNames, setTempAccessGuestNames] = useState({})
  const navigate = useNavigate()
  const { showConfirm, showAlert } = useDialog()

  const loadData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { navigate('/login'); return }
    setCurrentUser(user)
    const { data: prof } = await supabase.from('users').select('role').eq('id', user.id).single()
    if (prof?.role !== 'admin') { navigate('/dashboard'); return }
    const [usersResult, requestsResult, auditResult, requestLogsResult, doorResult] = await Promise.all([
      supabase.from('users').select('*').order('created_at', { ascending: false }),
      supabase.from('requests').select('*, request_user:users!requests_user_id_fkey(first_name, last_name, email)').order('created_at', { ascending: false }),
      supabase.from('audit_logs').select('*, admin:users!audit_logs_admin_id_fkey(first_name, last_name)').order('timestamp', { ascending: false }).limit(100),
      supabase.from('audit_logs').select('*, admin:users!audit_logs_admin_id_fkey(first_name, last_name)').in('action', ['request_approved', 'request_rejected']).order('timestamp', { ascending: false }).limit(300),
      supabase.from('doors').select('*').limit(1).single(),
    ])
    setUsers(usersResult.data || [])
    setRequests(requestsResult.data || [])
    setAuditLogs(auditResult.data || [])
    setRequestLogs(requestLogsResult.data || [])
    if (doorResult.data) {
      const { data: tempAccessData } = await supabase.from('temp_access').select('*').eq('door_id', doorResult.data.id).order('valid_from', { ascending: false }).limit(15)
      setDoor(doorResult.data)
      setDoorWarning(doorResult.data.open_warning_minutes ?? 5)
      setDoorAutoClose(doorResult.data.auto_close_enabled ?? false)
      setTempCodes(tempAccessData || [])
    }
    setLoading(false)
  }, [navigate])

  useEffect(() => {
    const id = window.setTimeout(() => void loadData(), 0)
    return () => window.clearTimeout(id)
  }, [loadData])

  useEffect(() => {
    const channel = supabase.channel('admin-door-realtime')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'doors' }, (payload) => { setDoor(payload.new) })
      .subscribe((status) => { setIsLive(status === 'SUBSCRIBED') })
    return () => { supabase.removeChannel(channel) }
  }, [])

  const loadTempCodes = useCallback(async (doorId) => {
    const { data } = await supabase.from('temp_access').select('*').eq('door_id', doorId).order('valid_from', { ascending: false }).limit(15)
    setTempCodes(data || [])
  }, [])

  async function approveUser(id) { await supabase.from('users').update({ status: 'active' }).eq('id', id); await logAction('approve_user', id); loadData() }
  async function blockUser(id) { await supabase.from('users').update({ status: 'blocked' }).eq('id', id); await logAction('block_user', id); loadData() }
  async function makeAdmin(id) {
    const ok = await showConfirm({ title: 'Направи администратор', message: 'Потребителят ще получи пълни права.', confirmLabel: 'Направи админ', cancelLabel: 'Отказ', tone: 'warning' })
    if (!ok) return
    await supabase.from('users').update({ role: 'admin' }).eq('id', id); await logAction('make_admin', id); loadData()
  }
  async function toggleBlacklist(id, current) {
    const newValue = !current
    await supabase.from('users').update({ is_blacklisted: newValue }).eq('id', id)
    await logAction(newValue ? 'blacklist_user' : 'unblacklist_user', id); loadData()
  }
  async function handleRequest(request, status) {
    const response = (responseDrafts[request.id] || '').trim()
    if (!response) { setRequestErrors(c => ({ ...c, [request.id]: 'Добавете кратък отговор.' })); return }
    setRequestErrors(c => ({ ...c, [request.id]: '' }))
    await supabase.from('requests').update({ status, handled_by: currentUser.id }).eq('id', request.id)
    await logAction(`request_${status}`, request.user_id, { request_id: request.id, response })
    setResponseDrafts(c => ({ ...c, [request.id]: '' })); loadData()
  }
  async function logAction(action, targetId, details = {}) {
    await supabase.from('audit_logs').insert({ admin_id: currentUser.id, action, target_user_id: targetId, details })
  }
  async function saveDoorSettings() {
    if (!door) return
    const minutes = parseInt(doorWarning, 10)
    if (isNaN(minutes) || minutes < 1 || minutes > 120) { setDoorSaveMsg('error:Въведете стойност между 1 и 120 минути.'); return }
    setDoorSaving(true); setDoorSaveMsg('')
    const { error } = await supabase.from('doors').update({ open_warning_minutes: minutes, auto_close_enabled: doorAutoClose }).eq('id', door.id)
    if (error) { setDoorSaveMsg('error:Грешка при запазване.') }
    else { await supabase.from('audit_logs').insert({ admin_id: currentUser.id, action: 'door_settings_updated', details: { open_warning_minutes: minutes, auto_close_enabled: doorAutoClose } }); setDoorSaveMsg('success:Настройките са запазени.') }
    setDoorSaving(false)
  }
  async function resetFailedAttempts() {
    if (!door) return
    const ok = await showConfirm({ title: 'Нулирай неуспешни опити', message: `Текущият брой е ${door.failed_attempts}. Сигурни ли сте?`, confirmLabel: 'Нулирай', cancelLabel: 'Отказ', tone: 'warning' })
    if (!ok) return
    setResettingAttempts(true)
    await supabase.from('doors').update({ failed_attempts: 0 }).eq('id', door.id)
    await logAction('failed_attempts_reset', null, { door_id: door.id, previous: door.failed_attempts })
    setResettingAttempts(false); loadData()
  }
  function saveMaintenance() {
    localStorage.setItem(MAINTENANCE_KEY, JSON.stringify({ enabled: maintEnabled, start: maintStart, end: maintEnd }))
    setMaintSaved(true); setTimeout(() => setMaintSaved(false), 2000)
  }
  async function generateQR() {
    if (!qrGuest || !qrFrom || !qrUntil) { await showAlert({ title: 'Непълни данни', message: 'Въведете име на госта и задайте период.', confirmLabel: 'Разбрах', tone: 'warning' }); return }
    if (new Date(qrUntil) <= new Date(qrFrom)) { await showAlert({ title: 'Невалиден период', message: '"Валиден до" трябва да е след "Валиден от".', confirmLabel: 'Разбрах', tone: 'warning' }); return }
    setQrGenerating(true)
    const qrCode = crypto.randomUUID(); const guestName = qrGuest.trim()
    const { data, error } = await supabase.from('temp_access').insert({ door_id: door.id, qr_code: qrCode, valid_from: new Date(qrFrom).toISOString(), valid_until: new Date(qrUntil).toISOString(), created_by: currentUser.id, is_used: false }).select().single()
    if (error || !data) { await showAlert({ title: 'Грешка', message: 'Временният достъп не можа да бъде записан.', confirmLabel: 'Разбрах', tone: 'danger' }); setQrGenerating(false); return }
    setTempAccessGuestNames(c => ({ ...c, [data.id]: guestName, [`qr:${data.qr_code}`]: guestName, [getTempAccessAuditKey(data.door_id, data.valid_until)]: guestName }))
    setQrLatest({ ...data, guest_name: guestName })
    await logAction('temp_access_created', null, { door_id: door.id, guest_name: guestName, valid_until: data.valid_until, qr_code: data.qr_code, temp_access_id: data.id })
    loadTempCodes(door.id); setQrFrom(''); setQrUntil(''); setQrGuest('')
    setQrGenerating(false)
  }
  async function revokeQR(id) { await supabase.from('temp_access').update({ is_used: true }).eq('id', id); loadTempCodes(door.id) }

  const filteredUsers = users.filter(u => !search || `${u.first_name} ${u.last_name} ${u.email}`.toLowerCase().includes(search.toLowerCase()))
  const blacklisted = users.filter(u => u.is_blacklisted)
  const pendingReqs = requests.filter(r => r.status === 'pending')
  const responseByRequestId = useMemo(() => getRequestResponseMap(requestLogs), [requestLogs])
  const auditTempAccessGuestNames = useMemo(() => {
    const next = {}
    auditLogs.forEach(log => {
      if (log.action !== 'temp_access_created') return
      const details = log.details || {}
      const guestName = typeof details.guest_name === 'string' ? details.guest_name.trim() : ''
      if (!guestName) return
      if (details.temp_access_id) next[details.temp_access_id] = guestName
      if (details.qr_code) next[`qr:${details.qr_code}`] = guestName
      if (details.door_id && details.valid_until) next[getTempAccessAuditKey(details.door_id, details.valid_until)] = guestName
    })
    return next
  }, [auditLogs])
  const tempAccessGuestNameMap = useMemo(() => ({ ...auditTempAccessGuestNames, ...tempAccessGuestNames }), [auditTempAccessGuestNames, tempAccessGuestNames])
  const inMaintenance = isInMaintenance(maintEnabled, maintStart, maintEnd)
  function getTempAccessGuestName(tc) {
    return tempAccessGuestNameMap[tc.id] || tempAccessGuestNameMap[`qr:${tc.qr_code}`] || tempAccessGuestNameMap[getTempAccessAuditKey(tc.door_id, tc.valid_until)] || tc.guest_name || 'Временен достъп'
  }

  if (loading) return <Layout><AppLoader /></Layout>

  return (
    <Layout>
      <main className="page-main" style={{ background: 'var(--bg)', minHeight: 'calc(100vh - 56px)' }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.5, color: 'var(--text)', marginBottom: 3 }}>Администрация</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{users.length} потребители · {pendingReqs.length} чакащи запитвания · {blacklisted.length} в черен списък</div>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 24, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {TABS.map((label, index) => (
            <button key={label} onClick={() => setTab(index)} style={{
              padding: '8px 14px', background: 'none', border: 'none', whiteSpace: 'nowrap',
              borderBottom: `2px solid ${tab === index ? 'var(--text)' : 'transparent'}`,
              fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 500,
              color: tab === index ? 'var(--text)' : 'var(--text-muted)',
              cursor: 'pointer', marginBottom: -1, display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {label}
              {index === 1 && pendingReqs.length > 0 && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 10, background: '#f59e0b', color: '#fff' }}>{pendingReqs.length}</span>}
              {index === 2 && blacklisted.length > 0 && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 10, background: '#ef4444', color: '#fff' }}>{blacklisted.length}</span>}
              {index === 4 && inMaintenance && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 10, background: '#f59e0b', color: '#fff' }}>MAINT</span>}
            </button>
          ))}
        </div>

        {tab === 0 && (
          <div>
            <input style={{ ...inp, width: '100%', maxWidth: 300, marginBottom: 16 }} placeholder="Търсене по име или имейл..." value={search} onChange={e => setSearch(e.target.value)} />
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12 }}>
              <div className="table-scroll">
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                  <thead><tr style={{ background: 'var(--table-head)' }}>{['Потребител', 'Имейл', 'Роля', 'Статус', 'Действия'].map(h => <th key={h} style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, padding: '10px 16px', textAlign: 'left', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {filteredUsers.map((u, i) => (
                      <tr key={u.id} style={{ borderBottom: i < filteredUsers.length - 1 ? '1px solid var(--border)' : 'none', opacity: u.is_blacklisted ? 0.55 : 1 }}>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--input-bg)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
                              {u.avatar_url ? <img src={u.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} /> : `${u.first_name?.[0] || ''}${u.last_name?.[0] || ''}`}
                            </div>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap' }}>{u.first_name} {u.last_name}</div>
                              {u.is_blacklisted && <div style={{ fontSize: 10, color: '#ef4444', fontWeight: 500 }}>Черен списък</div>}
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{u.email}</td>
                        <td style={{ padding: '12px 16px' }}><Badge type={u.role} /></td>
                        <td style={{ padding: '12px 16px' }}><Badge type={u.status} /></td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {u.status === 'pending' && <button onClick={() => approveUser(u.id)} style={{ padding: '4px 10px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 500, cursor: 'pointer', color: '#16a34a', whiteSpace: 'nowrap' }}>Одобри</button>}
                            {u.status === 'active' && u.id !== currentUser?.id && <button onClick={() => blockUser(u.id)} style={{ padding: '4px 10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 500, cursor: 'pointer', color: '#ef4444', whiteSpace: 'nowrap' }}>Блокирай</button>}
                            {u.role !== 'admin' && u.id !== currentUser?.id && <button onClick={() => makeAdmin(u.id)} style={{ padding: '4px 10px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 500, cursor: 'pointer', color: '#92400e', whiteSpace: 'nowrap' }}>Направи админ</button>}
                            {u.id !== currentUser?.id && <button onClick={() => toggleBlacklist(u.id, u.is_blacklisted)} style={{ padding: '4px 10px', background: u.is_blacklisted ? '#f0fdf4' : '#fef2f2', border: `1px solid ${u.is_blacklisted ? '#bbf7d0' : '#fecaca'}`, borderRadius: 6, fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 500, cursor: 'pointer', color: u.is_blacklisted ? '#16a34a' : '#ef4444', whiteSpace: 'nowrap' }}>{u.is_blacklisted ? 'Премахни от ЧС' : 'Черен списък'}</button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {tab === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {requests.length === 0 ? (
              <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Няма запитвания</div>
            ) : requests.map((request) => {
              const responseEntry = responseByRequestId[request.id]
              const draft = responseDrafts[request.id] || ''
              return (
                <div key={request.id} style={{ background: 'var(--card-bg)', border: `1px solid ${request.status === 'pending' ? '#fde68a' : 'var(--border)'}`, borderRadius: 12, padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
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
                          <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>Отговор</div>
                          <textarea style={{ ...inp, width: '100%', minHeight: 84, resize: 'vertical', lineHeight: 1.5 }} placeholder="Напр. Приемам заявката." value={draft}
                            onChange={e => { setResponseDrafts(c => ({ ...c, [request.id]: e.target.value })); if (requestErrors[request.id]) setRequestErrors(c => ({ ...c, [request.id]: '' })) }} />
                          {requestErrors[request.id] && <div style={{ fontSize: 12, color: '#ef4444', marginTop: 6 }}>{requestErrors[request.id]}</div>}
                        </div>
                      ) : (
                        <div style={{ marginTop: 14, padding: '10px 12px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 8 }}>
                          <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>Отговор</div>
                          <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>{responseEntry?.response || 'Няма текстов отговор.'}</div>
                          {responseEntry?.timestamp && <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 6 }}>{responseEntry.adminName ? `${responseEntry.adminName} · ` : ''}{formatDate(responseEntry.timestamp)}</div>}
                        </div>
                      )}
                    </div>
                    {request.status === 'pending' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0, width: 140 }}>
                        <button onClick={() => handleRequest(request, 'approved')} style={{ padding: '8px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 500, cursor: 'pointer', color: '#16a34a' }}>Приеми</button>
                        <button onClick={() => handleRequest(request, 'rejected')} style={{ padding: '8px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 500, cursor: 'pointer', color: '#ef4444' }}>Откажи</button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {tab === 2 && (
          <div>
            {blacklisted.length === 0 ? (
              <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Черният списък е празен</div>
            ) : (
              <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12 }}>
                <div className="table-scroll">
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 400 }}>
                    <thead><tr style={{ background: 'var(--table-head)' }}>{['Потребител', 'Имейл', 'Статус', 'Действие'].map(h => <th key={h} style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, padding: '10px 16px', textAlign: 'left', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
                    <tbody>
                      {blacklisted.map((u, i) => (
                        <tr key={u.id} style={{ borderBottom: i < blacklisted.length - 1 ? '1px solid var(--border)' : 'none' }}>
                          <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap' }}>{u.first_name} {u.last_name}</td>
                          <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{u.email}</td>
                          <td style={{ padding: '12px 16px' }}><Badge type={u.status} /></td>
                          <td style={{ padding: '12px 16px' }}><button onClick={() => toggleBlacklist(u.id, true)} style={{ padding: '6px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 500, cursor: 'pointer', color: '#16a34a', whiteSpace: 'nowrap' }}>Премахни от черния списък</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 3 && (
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12 }}>
            <div className="table-scroll">
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 400 }}>
                <thead><tr style={{ background: 'var(--table-head)' }}>{['Дата и час', 'Администратор', 'Действие'].map(h => <th key={h} style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, padding: '10px 16px', textAlign: 'left', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {auditLogs.length === 0
                    ? <tr><td colSpan={3} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Няма записи</td></tr>
                    : auditLogs.map((log, i) => (
                      <tr key={log.id} style={{ borderBottom: i < auditLogs.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <td style={{ padding: '11px 16px', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{formatDate(log.timestamp)}</td>
                        <td style={{ padding: '11px 16px', fontSize: 13, color: 'var(--text)', whiteSpace: 'nowrap' }}>{log.admin?.first_name} {log.admin?.last_name}</td>
                        <td style={{ padding: '11px 16px', fontSize: 13, color: 'var(--text)' }}>{ACTION_LABELS[log.action] || log.action}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 4 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {!door ? (
              <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Няма намерена врата.</div>
            ) : (<>
              <div className="grid-2col">
                <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Текущо състояние</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: isLive ? '#16a34a' : 'var(--text-muted)' }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: isLive ? '#16a34a' : '#94a3b8', boxShadow: isLive ? '0 0 6px #16a34a' : 'none' }} />
                      {isLive ? 'Live' : 'Свързване...'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                    <div><div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>Врата</div><div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{door.name}</div></div>
                    <div><div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>Статус</div><div style={{ fontSize: 14, fontWeight: 600, color: door.status === 'open' ? '#16a34a' : 'var(--text)' }}>{door.status === 'open' ? 'Отворена' : door.status === 'locked' ? 'Заключена' : 'Затворена'}</div></div>
                    <div><div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>Аварийно заключване</div><div style={{ fontSize: 14, fontWeight: 600, color: door.is_locked ? '#ef4444' : '#16a34a' }}>{door.is_locked ? 'Активно' : 'Неактивно'}</div></div>
                    {inMaintenance && <div><div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>Режим</div><div style={{ fontSize: 14, fontWeight: 600, color: '#f59e0b' }}>Поддръжка</div></div>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 9, background: door.failed_attempts > 0 ? '#fef2f2' : 'var(--input-bg)', border: `1px solid ${door.failed_attempts > 0 ? '#fecaca' : 'var(--border)'}` }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 500, color: door.failed_attempts > 0 ? '#ef4444' : 'var(--text-muted)', marginBottom: 2 }}>Неуспешни опити</div>
                      <div style={{ fontSize: 28, fontWeight: 700, color: door.failed_attempts > 0 ? '#ef4444' : 'var(--text)', lineHeight: 1 }}>{door.failed_attempts}</div>
                    </div>
                    {door.failed_attempts > 0 && (
                      <button onClick={resetFailedAttempts} disabled={resettingAttempts} style={{ padding: '7px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 500, cursor: 'pointer', color: '#ef4444', opacity: resettingAttempts ? 0.6 : 1 }}>
                        {resettingAttempts ? 'Нулиране...' : 'Нулирай'}
                      </button>
                    )}
                  </div>
                </div>
                <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }}>
                  <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 16 }}>Настройки</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, padding: '12px 14px', background: 'var(--input-bg)', borderRadius: 9, border: '1px solid var(--border)' }}>
                    <div><div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 2 }}>Автоматично затваряне</div><div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>Затваря след предупредителното време</div></div>
                    <Toggle value={doorAutoClose} onChange={setDoorAutoClose} />
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, display: 'block', marginBottom: 8 }}>Предупреждение след (мин.)</label>
                    <input type="number" min={1} max={120} value={doorWarning} onChange={e => setDoorWarning(e.target.value)} style={{ ...inp, width: '100%' }} />
                  </div>
                  {doorSaveMsg && (
                    <div style={{ fontSize: 12, padding: '8px 12px', borderRadius: 8, marginBottom: 12, ...(doorSaveMsg.startsWith('error:') ? { background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca' } : { background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }) }}>
                      {doorSaveMsg.replace(/^(error|success):/, '')}
                    </div>
                  )}
                  <button onClick={saveDoorSettings} disabled={doorSaving} style={{ width: '100%', padding: '9px', background: 'linear-gradient(135deg, #dd7fa2, #c9638b)', border: 'none', borderRadius: 9, color: '#fff', fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, cursor: doorSaving ? 'not-allowed' : 'pointer', opacity: doorSaving ? 0.7 : 1, boxShadow: '0 8px 18px rgba(201,99,139,0.2)' }}>
                    {doorSaving ? 'Запазване...' : 'Запази настройките'}
                  </button>
                </div>
              </div>

              <div className="grid-2col" style={{ alignItems: 'start' }}>
                <div style={{ background: 'var(--card-bg)', border: `1px solid ${inMaintenance ? '#fde68a' : 'var(--border)'}`, borderRadius: 12, padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Режим на поддръжка</div>
                      {inMaintenance && <div style={{ fontSize: 12, color: '#92400e', marginTop: 3, fontWeight: 500 }}>⚠ Активен ({maintStart} – {maintEnd})</div>}
                    </div>
                    <Toggle value={maintEnabled} onChange={setMaintEnabled} />
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }}>Блокира достъпа в зададения период.</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, display: 'block', marginBottom: 6 }}>От час</label>
                      <input type="time" value={maintStart} onChange={e => setMaintStart(e.target.value)} style={{ ...inp, width: '100%' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, display: 'block', marginBottom: 6 }}>До час</label>
                      <input type="time" value={maintEnd} onChange={e => setMaintEnd(e.target.value)} style={{ ...inp, width: '100%' }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button onClick={saveMaintenance} style={{ padding: '8px 18px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 8, fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 500, cursor: 'pointer', color: 'var(--text)' }}>Запази</button>
                    {maintSaved && <span style={{ fontSize: 12, color: '#16a34a' }}>✓ Запазено</span>}
                  </div>
                </div>
                <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }}>
                  <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 12 }}>Временен QR достъп за гост</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }}>Еднократен QR код за гост — не изисква акаунт.</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, display: 'block', marginBottom: 6 }}>Име на госта</label>
                      <input type="text" placeholder="напр. Иван Петров" value={qrGuest} onChange={e => setQrGuest(e.target.value)} style={{ ...inp, width: '100%' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, display: 'block', marginBottom: 6 }}>Валиден от</label>
                      <input type="datetime-local" value={qrFrom} onChange={e => setQrFrom(e.target.value)} style={{ ...inp, width: '100%' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, display: 'block', marginBottom: 6 }}>Валиден до</label>
                      <input type="datetime-local" value={qrUntil} onChange={e => setQrUntil(e.target.value)} style={{ ...inp, width: '100%' }} />
                    </div>
                  </div>
                  <button onClick={generateQR} disabled={qrGenerating} style={{ width: '100%', padding: '9px', background: 'linear-gradient(135deg, #dd7fa2, #c9638b)', border: 'none', borderRadius: 9, color: '#fff', fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, cursor: qrGenerating ? 'not-allowed' : 'pointer', opacity: qrGenerating ? 0.7 : 1, boxShadow: '0 8px 18px rgba(201,99,139,0.2)', marginBottom: qrLatest ? 14 : 0 }}>
                    {qrGenerating ? 'Генериране...' : 'Генерирай QR код'}
                  </button>
                  {qrLatest && (
                    <div style={{ padding: '14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                      <img src={`https://api.qrserver.com/v1/create-qr-code/?size=90x90&data=ACCESSGUARD:${qrLatest.qr_code}`} alt="QR" style={{ width: 90, height: 90, borderRadius: 6, border: '2px solid #fff', flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#16a34a', marginBottom: 3 }}>Готово!</div>
                        <div style={{ fontSize: 11, color: '#166534', marginBottom: 2 }}>Гост: {getTempAccessGuestName(qrLatest)}</div>
                        <div style={{ fontSize: 11, color: '#166534', marginBottom: 2 }}>До: {formatDate(qrLatest.valid_until)}</div>
                        <div style={{ fontSize: 10, color: '#4ade80', fontWeight: 500, marginTop: 4 }}>Еднократна употреба</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {tempCodes.length > 0 && (
                <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }}>
                  <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 12 }}>Издадени кодове</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {tempCodes.map(tc => {
                      const expired = new Date(tc.valid_until) < new Date()
                      return (
                        <div key={tc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 9, border: '1px solid var(--border)', background: tc.is_used || expired ? 'var(--input-bg)' : 'var(--card-bg)', opacity: tc.is_used || expired ? 0.6 : 1, flexWrap: 'wrap', gap: 8 }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{getTempAccessGuestName(tc)}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>До: {formatDate(tc.valid_until)}</div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {tc.is_used
                              ? <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: 'var(--input-bg)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Използван</span>
                              : expired
                                ? <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca' }}>Изтекъл</span>
                                : <>
                                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }}>Активен</span>
                                  <button onClick={() => revokeQR(tc.id)} style={{ fontSize: 11, padding: '4px 10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, cursor: 'pointer', color: '#ef4444', fontFamily: "'Inter', sans-serif", fontWeight: 500 }}>Отмени</button>
                                </>
                            }
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>)}
          </div>
        )}
      </main>
    </Layout>
  )
}