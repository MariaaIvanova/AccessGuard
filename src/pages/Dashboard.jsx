import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import { AI_NAME, BRAND_LOGO, BRAND_NAME } from '../branding'
import {
  formatAccessWindowShort,
  getCurrentScheduleWindow,
  getNextScheduleWindow,
  isScheduleActive,
} from '../accessSchedule'

const METHOD_LABELS = { fingerprint: 'Пръстов отпечатък', pin: 'ПИН код', nfc: 'NFC карта', qr: 'QR код', remote: 'Дистанционно' }
const DIRECTION_LABELS = { in: 'Влизане', out: 'Излизане' }
const CHAT_W = 280

function formatDate(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toLocaleDateString('bg-BG', { day: 'numeric', month: 'long', year: 'numeric' }) + ', ' +
    d.toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' })
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Добро утро'
  if (h < 18) return 'Добър ден'
  return 'Добър вечер'
}

export default function Dashboard() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [door, setDoor] = useState(null)
  const [logs, setLogs] = useState([])
  const [allLogs, setAllLogs] = useState([])
  const [todayCount, setTodayCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showPin, setShowPin] = useState(false)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState('')
  const [chatMsgs, setChatMsgs] = useState([{ role: 'ai', text: `Здравейте! Аз съм ${AI_NAME}. Задайте ми въпрос за вашите влизания или статуса на вратата.` }])
  const [chatInput, setChatInput] = useState('')
  const [reqMsg, setReqMsg] = useState('')
  const [reqError, setReqError] = useState('')
  const [reqSuccess, setReqSuccess] = useState(false)
  const [reqLoading, setReqLoading] = useState(false)
  const [accessSchedules, setAccessSchedules] = useState([])
  const [scheduleSystemEnabled, setScheduleSystemEnabled] = useState(true)
  const chatEndRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => { loadData() }, [])
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chatMsgs])

  async function loadData() {
    setLoading(true)
    const { data: { user: u } } = await supabase.auth.getUser()
    if (!u) { navigate('/login'); return }
    setUser(u)
    const { data: prof } = await supabase.from('users').select('*').eq('id', u.id).single()
    setProfile(prof)
    if (prof?.role !== 'admin') {
      const { data: scheduleData, error: scheduleError } = await supabase
        .from('schedules')
        .select('*')
        .eq('user_id', u.id)
        .limit(50)

      if (scheduleError) {
        setScheduleSystemEnabled(false)
        setAccessSchedules([])
      } else {
        setScheduleSystemEnabled(true)
        setAccessSchedules(scheduleData || [])
      }
    } else {
      setScheduleSystemEnabled(true)
      setAccessSchedules([])
    }
    const { data: doorData } = await supabase.from('doors').select('*').limit(1).single()
    setDoor(doorData)
    const { data: logsData } = await supabase.from('access_logs').select('*, doors(name)').eq('user_id', u.id).order('timestamp', { ascending: false }).limit(5)
    setLogs(logsData || [])
    const { data: allLogsData } = await supabase.from('access_logs').select('*').eq('user_id', u.id).order('timestamp', { ascending: false }).limit(200)
    setAllLogs(allLogsData || [])
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const { count } = await supabase.from('access_logs').select('*', { count: 'exact', head: true }).eq('user_id', u.id).gte('timestamp', today.toISOString())
    setTodayCount(count || 0)
    setLoading(false)
  }

  const methodCounts = allLogs.reduce((acc, l) => { acc[l.method] = (acc[l.method] || 0) + 1; return acc }, {})
  const hourCounts = Array(24).fill(0)
  allLogs.forEach(l => { hourCounts[new Date(l.timestamp).getHours()]++ })
  const maxHour = Math.max(...hourCounts, 1)
  const peakHour = hourCounts.indexOf(Math.max(...hourCounts))
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7)
  const weekLogs = allLogs.filter(l => new Date(l.timestamp) >= weekAgo)
  const isAdmin = profile?.role === 'admin'
  const activeAccessSchedule = accessSchedules.find((schedule) => isScheduleActive(schedule)) || null
  const activeAccessWindow = activeAccessSchedule ? getCurrentScheduleWindow(activeAccessSchedule) : null
  const upcomingAccessEntry =
    accessSchedules
      .map((schedule) => ({ schedule, window: getNextScheduleWindow(schedule) }))
      .filter((entry) => entry.window)
      .sort((left, right) => left.window.start.getTime() - right.window.start.getTime())[0] || null
  const upcomingAccessWindow = upcomingAccessEntry?.window || null
  const canOpenDoor = isAdmin || !scheduleSystemEnabled || Boolean(activeAccessWindow)

  function addPin(d) {
    if (pin.length >= 4) return
    const next = pin + d
    setPin(next)
    if (next.length === 4) setTimeout(() => submitPin(next), 300)
  }
  function delPin() { setPin(p => p.slice(0, -1)) }
  function clearPin() { setPin(''); setPinError('') }

  async function submitPin(p = pin) {
    if (p.length < 4) return
    if (!isAdmin && scheduleSystemEnabled && !activeAccessWindow) {
      setPinError(
        upcomingAccessWindow
          ? `Нямате активен график. Следващият прозорец е ${formatAccessWindowShort(upcomingAccessWindow.start, upcomingAccessWindow.end)}.`
          : 'Нямате активен график за дистанционно управление на вратата.'
      )
      setPin('')
      return
    }
    if (door?.is_locked) { setPinError('Аварийното заключване е активно'); setPin(''); return }
    if (p !== profile?.pin_hash) { setPinError('Грешен ПИН код'); setPin(''); return }
    await supabase.from('access_logs').insert({ user_id: user.id, door_id: door?.id, method: 'remote', direction: 'in', result: 'granted' })
    await supabase.from('doors').update({ status: 'open', last_opened_at: new Date() }).eq('id', door?.id)
    setShowPin(false); clearPin(); loadData()
    alert('Вратата е отворена успешно!')
  }

  async function closeDoor() {
    if (!canOpenDoor) return
    await supabase.from('doors').update({ status: 'closed' }).eq('id', door?.id)
    await supabase.from('access_logs').insert({ user_id: user.id, door_id: door?.id, method: 'remote', direction: 'out', result: 'granted' })
    loadData()
  }

  async function emergencyLock() {
    const newLocked = !door?.is_locked
    if (newLocked && !window.confirm('Сигурни ли сте? Аварийното заключване ще блокира ВСИЧКИ влизания незабавно. Никой няма да може да отвори вратата докато не деактивирате заключването.')) return
    await supabase.from('doors').update({ is_locked: newLocked, status: 'closed' }).eq('id', door?.id)
    await supabase.from('audit_logs').insert({ admin_id: user.id, action: newLocked ? 'emergency_lock' : 'emergency_unlock', details: { door_id: door?.id, timestamp: new Date().toISOString() } })
    loadData()
  }

  async function sendChat(text) {
  const clean = text.trim()
  if (!clean) return

  setChatInput('')

  const nextMsgs = [...chatMsgs, { role: 'user', text: clean }]
  setChatMsgs(nextMsgs)

  try {
    const today = new Date()
    const todayStr = today.toISOString().slice(0, 10)

    const safeAllLogs = Array.isArray(allLogs) ? allLogs : []

    const todayLogs = safeAllLogs.filter((log) => {
      const ts = log?.timestamp || log?.created_at || ''
      return ts.startsWith(todayStr)
    })

    const deniedToday = todayLogs.filter((log) => log?.result === 'denied').length
    const grantedToday = todayLogs.filter((log) => log?.result === 'granted').length

    const methodCountsLocal = safeAllLogs.reduce((acc, log) => {
      const method = log?.method || 'unknown'
      acc[method] = (acc[method] || 0) + 1
      return acc
    }, {})

    const mostUsedMethodKey =
      Object.entries(methodCountsLocal).sort((a, b) => b[1] - a[1])[0]?.[0] || null
    const mostUsedMethod =
      METHOD_LABELS[mostUsedMethodKey] || mostUsedMethodKey || 'Няма данни'

    const hourCountsLocal = Array(24).fill(0)
    safeAllLogs.forEach((log) => {
      const ts = log?.timestamp || log?.created_at
      if (!ts) return
      const h = new Date(ts).getHours()
      if (!Number.isNaN(h)) hourCountsLocal[h]++
    })
    const peakHour = hourCountsLocal.indexOf(Math.max(...hourCountsLocal, 0))

    const lateNightLogs = safeAllLogs.filter((log) => {
      const ts = log?.timestamp || log?.created_at
      if (!ts) return false
      const h = new Date(ts).getHours()
      return h >= 23 || h < 5
    }).length

    const deniedRecent = safeAllLogs.slice(0, 10).filter((log) => log?.result === 'denied').length

    const suspiciousFlags = []
    if (deniedToday >= 3) suspiciousFlags.push(`Има ${deniedToday} отказани опита днес.`)
    if (lateNightLogs > 0) suspiciousFlags.push(`Има ${lateNightLogs} късни влизания/опити между 23:00 и 05:00.`)
    if (door?.is_locked) suspiciousFlags.push('Вратата е в режим аварийно заключване.')
    if (deniedRecent >= 3) suspiciousFlags.push(`В последните 10 записа има ${deniedRecent} отказани опита.`)

    const recentLogsText = safeAllLogs
      .slice(0, 8)
      .map((log, i) => {
        const when = log?.timestamp ? formatDate(log.timestamp) : '—'
        const method = METHOD_LABELS[log?.method] || log?.method || '—'
        const direction = DIRECTION_LABELS[log?.direction] || log?.direction || '—'
        const result =
          log?.result === 'granted'
            ? 'Разрешен'
            : log?.result === 'denied'
            ? 'Отказан'
            : '—'

        return `${i + 1}. ${when} | ${direction} | ${method} | ${result}`
      })
      .join('\n')

    const systemPrompt = `
Ти си ${AI_NAME}, security асистент в ${BRAND_NAME}.

ПРАВИЛА:
- Отговаряй само на български.
- Бъди кратък, точен и полезен.
- Отговаряй като нормален чатбот на свободни въпроси.
- Използвай само данните от подадения контекст.
- Не измисляй факти.
- Ако няма достатъчно данни, кажи ясно, че няма достатъчно данни.
- Ако потребителят пита за риск или suspicious activity, анализирай denied attempts, late-night activity и emergency lock.
- Ако потребителят пита "кой последно влезе", отговаряй по последния наличен негов запис.
- Ако потребителят пита за "история днес", използвай today's logs.
- Ако потребителят пита за препоръка, дай кратък practical advice.

ПОТРЕБИТЕЛ:
- Име: ${profile?.first_name || ''} ${profile?.last_name || ''}
- Имейл: ${profile?.email || user?.email || 'неизвестен'}
- Роля: ${profile?.role || 'user'}

ВРАТА:
- Статус: ${door?.status || 'unknown'}
- Заключена: ${door?.is_locked ? 'Да' : 'Не'}
- Последно отваряне: ${door?.last_opened_at ? formatDate(door.last_opened_at) : 'Няма данни'}

ОБЩА СТАТИСТИКА:
- Общо заредени логове: ${safeAllLogs.length}
- Логове днес: ${todayLogs.length}
- Разрешени днес: ${grantedToday}
- Отказани днес: ${deniedToday}
- Най-използван метод: ${mostUsedMethod}
- Пиков час: ${peakHour}:00
- Късни влизания/опити: ${lateNightLogs}

ПОСЛЕДЕН ЗАПИС:
${
  safeAllLogs[0]
    ? `${formatDate(safeAllLogs[0].timestamp)} | ${
        DIRECTION_LABELS[safeAllLogs[0].direction] || safeAllLogs[0].direction || '—'
      } | ${METHOD_LABELS[safeAllLogs[0].method] || safeAllLogs[0].method || '—'} | ${
        safeAllLogs[0].result === 'granted'
          ? 'Разрешен'
          : safeAllLogs[0].result === 'denied'
          ? 'Отказан'
          : '—'
      }`
    : 'Няма данни'
}

ПОДОЗРИТЕЛНИ СИГНАЛИ:
${suspiciousFlags.length ? suspiciousFlags.map((x) => `- ${x}`).join('\n') : '- Няма явни подозрителни сигнали в наличните данни.'}

ПОСЛЕДНИ ЗАПИСИ:
${recentLogsText || 'Няма записи'}

Ако потребителят задава общ въпрос, отговори естествено и полезно.
`

    const messagesForModel = nextMsgs.map((m) => ({
      role: m.role === 'ai' ? 'assistant' : 'user',
      content: m.text,
    }))

    const { data, error } = await supabase.functions.invoke('chat', {
      body: {
        system: systemPrompt,
        messages: messagesForModel,
      },
    })

    if (error) {
      setChatMsgs((prev) => [
        ...prev,
        { role: 'ai', text: `Грешка при връзката с ${AI_NAME}: ${error.message || 'Неуспешна заявка.'}` },
      ])
      return
    }

    const reply = data?.reply || `Няма отговор от ${AI_NAME}.`

    setChatMsgs((prev) => [...prev, { role: 'ai', text: reply }])
  } catch (err) {
    setChatMsgs((prev) => [
      ...prev,
      { role: 'ai', text: `Грешка при заявката към ${AI_NAME}: ${err?.message || 'Неочаквана грешка.'}` },
    ])
  }
}

  async function submitRequest() {
    if (!reqMsg.trim()) { setReqError('Моля опишете запитването'); return }
    setReqLoading(true); setReqError(''); setReqSuccess(false)
    const { error } = await supabase.from('requests').insert({ user_id: user.id, type: 'other', message: reqMsg, status: 'pending' })
    if (error) setReqError('Грешка при изпращане')
    else { setReqSuccess(true); setReqMsg('') }
    setReqLoading(false)
  }

  function downloadReport() {
    const rows = [
      [`Седмичен отчет — ${BRAND_NAME}`],
      ['Период', `${weekAgo.toLocaleDateString('bg-BG')} — ${new Date().toLocaleDateString('bg-BG')}`],
      ['Общо влизания', weekLogs.length],
      ['Разрешени', weekLogs.filter(l => l.result === 'granted').length],
      ['Отказани', weekLogs.filter(l => l.result === 'denied').length],
      [''],
      ['Дата и час', 'Метод', 'Посока', 'Статус'],
      ...weekLogs.map(l => [formatDate(l.timestamp), METHOD_LABELS[l.method] || l.method, DIRECTION_LABELS[l.direction] || '—', l.result === 'granted' ? 'Разрешен' : 'Отказан'])
    ]
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'отчет.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <Layout><div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Зареждане...</div></Layout>

  const lastLog = logs[0]
  const isLocked = door?.is_locked
  const closeBlocked = !canOpenDoor
  const openBlocked = isLocked || !canOpenDoor
  const scheduleNoticeTone = activeAccessWindow ? 'active' : upcomingAccessWindow ? 'upcoming' : 'inactive'
  const scheduleNoticeStyles = {
    active: { background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', iconBg: '#16a34a' },
    upcoming: { background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', iconBg: '#f59e0b' },
    inactive: { background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', iconBg: '#ef4444' },
  }
  const currentScheduleNotice = scheduleNoticeStyles[scheduleNoticeTone]

  return (
    <Layout>
      <div style={{ display: 'flex', background: 'var(--bg)', minHeight: 'calc(100vh - 56px)' }}>
        <main style={{ flex: 1, marginRight: CHAT_W, padding: '28px 28px 40px' }}>

          {isLocked && (
            <div style={{ background: '#fef2f2', border: '2px solid #ef4444', borderRadius: 10, padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 32, height: 32, background: '#ef4444', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#ef4444' }}>АВАРИЙНОТО ЗАКЛЮЧВАНЕ Е АКТИВНО</div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Никой не може да отвори вратата. Само администратор може да деактивира заключването.</div>
              </div>
              {profile?.role === 'admin' && (
                <button onClick={emergencyLock} style={{ padding: '7px 14px', background: '#ef4444', border: 'none', borderRadius: 8, color: '#fff', fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  Деактивирай
                </button>
              )}
            </div>
          )}

          {!isAdmin && scheduleSystemEnabled && (
            <div style={{ background: currentScheduleNotice.background, border: currentScheduleNotice.border, borderRadius: 10, padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ width: 32, height: 32, background: currentScheduleNotice.iconBg, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {activeAccessSchedule ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>
                )}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: currentScheduleNotice.color }}>
                  {activeAccessWindow
                    ? 'Имате активен прозорец за достъп'
                    : upcomingAccessWindow
                    ? 'Имате предстоящ график за достъп'
                    : 'В момента нямате активен график'}
                </div>
                <div style={{ fontSize: 12, color: currentScheduleNotice.color, marginTop: 2, lineHeight: 1.5 }}>
                  {activeAccessWindow
                    ? `Можете да управлявате вратата само в периода ${formatAccessWindowShort(activeAccessWindow.start, activeAccessWindow.end)}.`
                    : upcomingAccessWindow
                    ? `Следващият ви период за управление е ${formatAccessWindowShort(upcomingAccessWindow.start, upcomingAccessWindow.end)}.`
                    : 'Дистанционното управление е разрешено само в период, зададен от администратор.'}
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.5, color: 'var(--text)', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 10 }}>
                {greeting()}, {profile?.first_name}
                {profile?.role === 'admin' && <span style={{ fontSize: 11, fontWeight: 500, background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text-muted)', padding: '3px 8px', borderRadius: 20 }}>Администратор</span>}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                {new Date().toLocaleDateString('bg-BG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {profile?.role === 'admin' && !isLocked && (
                <button onClick={emergencyLock} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: 8, fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                  Аварийно заключване
                </button>
              )}
              {door?.status === 'open' && !isLocked && (
                <button onClick={() => !closeBlocked && closeDoor()} title={!canOpenDoor ? 'Дистанционното управление е достъпно само в активен график' : 'Затвори врата'} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', background: closeBlocked ? 'var(--input-bg)' : 'var(--card-bg)', color: closeBlocked ? 'var(--text-muted)' : 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 500, cursor: closeBlocked ? 'not-allowed' : 'pointer', opacity: closeBlocked ? 0.5 : 1 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  Затвори врата
                </button>
              )}
              <button onClick={() => !openBlocked && setShowPin(true)} title={!canOpenDoor ? 'Дистанционното управление е достъпно само в активен график' : 'Отвори с ПИН'} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', background: openBlocked ? 'var(--input-bg)' : 'var(--btn-bg)', color: openBlocked ? 'var(--text-muted)' : 'var(--btn-color)', border: openBlocked ? '1px solid var(--border)' : 'none', borderRadius: 8, fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 500, cursor: openBlocked ? 'not-allowed' : 'pointer', opacity: openBlocked ? 0.5 : 1 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                Отвори с ПИН
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
            <div style={{ background: 'var(--card-bg)', border: isLocked ? '2px solid #ef4444' : '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', transition: 'border 0.2s' }}>
              <div style={{ fontSize: 12, color: isLocked ? '#ef4444' : 'var(--text-muted)', marginBottom: 8, fontWeight: isLocked ? 600 : 400 }}>
                Статус на врата
              </div>
              <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: -0.5, lineHeight: 1, marginBottom: 6, color: isLocked ? '#ef4444' : door?.status === 'open' ? '#22c55e' : 'var(--text)' }}>
                {isLocked ? 'Заключена' : door?.status === 'open' ? 'Отворена' : 'Затворена'}
              </div>
              <div style={{ fontSize: 11, color: isLocked ? '#ef4444' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: isLocked ? '#ef4444' : '#22c55e', display: 'inline-block' }} />
                {isLocked ? 'Аварийно заключена' : 'Системата е активна'}
              </div>
            </div>

            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Последно влизане</div>
              <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: -0.5, lineHeight: 1, marginBottom: 6, color: 'var(--text)' }}>
                {lastLog ? new Date(lastLog.timestamp).toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' }) : '—'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {lastLog ? `${new Date(lastLog.timestamp).toLocaleDateString('bg-BG')} · ${METHOD_LABELS[lastLog.method]}` : 'Няма данни'}
              </div>
            </div>

            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Влизания днес</div>
              <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: -0.5, lineHeight: 1, marginBottom: 6, color: 'var(--text)' }}>{todayCount}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>общо за деня</div>
            </div>

            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Тази седмица</div>
              <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: -0.5, lineHeight: 1, marginBottom: 6, color: 'var(--text)' }}>{weekLogs.length}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {weekLogs.filter(l => l.result === 'granted').length} разрешени · {weekLogs.filter(l => l.result === 'denied').length} отказани
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>Методи на достъп</div>
              {Object.keys(methodCounts).length === 0
                ? <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>Няма данни</div>
                : Object.entries(methodCounts).sort((a, b) => b[1] - a[1]).map(([method, count]) => {
                    const pct = allLogs.length ? Math.round(count / allLogs.length * 100) : 0
                    return (
                      <div key={method} style={{ marginBottom: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 12, color: 'var(--text)' }}>{METHOD_LABELS[method] || method}</span>
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{count} ({pct}%)</span>
                        </div>
                        <div style={{ height: 6, background: 'var(--input-bg)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: 'var(--btn-bg)', borderRadius: 3 }} />
                        </div>
                      </div>
                    )
                  })
              }
            </div>

            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Активност по часове</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>Най-натоварен: {peakHour}:00 — {peakHour + 1}:00</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 60 }}>
                {hourCounts.map((count, h) => (
                  <div key={h} title={`${h}:00 — ${count}`} style={{ flex: 1, background: h === peakHour ? 'var(--btn-bg)' : 'var(--input-bg)', borderRadius: 2, height: `${Math.max(4, count / maxHour * 100)}%` }} />
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>0:00</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>12:00</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>23:00</span>
              </div>
            </div>
          </div>

          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 3 }}>Седмичен отчет</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{weekLogs.length} влизания · от {weekAgo.toLocaleDateString('bg-BG')} до днес</div>
            </div>
            <button onClick={downloadReport} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 500, cursor: 'pointer', color: 'var(--text)' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Изтегли CSV
            </button>
          </div>

          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>История на достъп</div>
              <a href="#" onClick={e => { e.preventDefault(); navigate('/history') }} style={{ fontSize: 12, color: '#3b82f6', textDecoration: 'none', fontWeight: 500 }}>Виж цялата история →</a>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--table-head)' }}>
                  {['Дата и час', 'Посока', 'Метод', 'Статус'].map(h => (
                    <th key={h} style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, padding: '10px 20px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.length === 0
                  ? <tr><td colSpan={4} style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Няма записи</td></tr>
                  : logs.map((log, i) => (
                      <tr key={log.id} style={{ borderBottom: i < logs.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <td style={{ padding: '11px 20px', fontSize: 13, color: 'var(--text)' }}>{formatDate(log.timestamp)}</td>
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

          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Изпрати запитване към администратор</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>За промяна на метод на достъп или друг въпрос, отидете в <a href="#" onClick={e => { e.preventDefault(); navigate('/profile') }} style={{ color: '#3b82f6', textDecoration: 'none' }}>Профил → Запитвания</a></div>
            </div>
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {reqSuccess && <div style={{ fontSize: 12, color: '#16a34a', padding: '8px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8 }}>Запитването е изпратено успешно!</div>}
              {reqError && <div style={{ fontSize: 12, color: '#ef4444', padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8 }}>{reqError}</div>}
              <div style={{ display: 'flex', gap: 10 }}>
                <textarea
                  style={{ flex: 1, background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', fontFamily: "'Inter', sans-serif", fontSize: 13, color: 'var(--text)', outline: 'none', resize: 'none', minHeight: 60, lineHeight: 1.5 }}
                  placeholder="Опишете вашия въпрос или проблем..."
                  value={reqMsg}
                  onChange={e => setReqMsg(e.target.value)}
                />
                <button onClick={submitRequest} disabled={reqLoading} style={{ padding: '0 18px', background: 'var(--btn-bg)', border: 'none', borderRadius: 8, color: 'var(--btn-color)', fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap', alignSelf: 'flex-end', height: 40 }}>
                  {reqLoading ? 'Изпращане...' : 'Изпрати'}
                </button>
              </div>
            </div>
          </div>
        </main>

        {showPin && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => { if (e.target === e.currentTarget) { setShowPin(false); clearPin() } }}>
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 28, width: '100%', maxWidth: 320, boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Дистанционно отваряне</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>Въведете вашия 4-цифрен ПИН код</div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 20 }}>
                {[0,1,2,3].map(i => <div key={i} style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${i < pin.length ? 'var(--text)' : 'var(--border)'}`, background: i < pin.length ? 'var(--text)' : 'transparent', transition: 'all 0.15s' }} />)}
              </div>
              {pinError && <div style={{ fontSize: 12, color: '#ef4444', textAlign: 'center', marginBottom: 12 }}>{pinError}</div>}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
                {['1','2','3','4','5','6','7','8','9','C','0','⌫'].map(k => (
                  <button key={k} style={{ padding: 14, background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 8, fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 500, cursor: 'pointer', color: 'var(--text)', textAlign: 'center' }}
                    onClick={() => { if (k === 'C') clearPin(); else if (k === '⌫') delPin(); else addPin(k) }}>{k}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={{ flex: 1, padding: 10, borderRadius: 8, fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)' }} onClick={() => { setShowPin(false); clearPin() }}>Отказ</button>
                <button style={{ flex: 1, padding: 10, borderRadius: 8, fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 500, cursor: 'pointer', background: 'var(--btn-bg)', color: 'var(--btn-color)', border: 'none' }} onClick={() => submitPin()}>Потвърди</button>
              </div>
            </div>
          </div>
        )}

        <aside style={{ width: CHAT_W, background: 'var(--surface)', borderLeft: '1px solid var(--border)', position: 'fixed', top: 56, right: 0, bottom: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <div style={{ width: 28, height: 28, background: 'rgba(255,255,255,0.78)', border: '1px solid var(--border)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  <img src={BRAND_LOGO} alt={AI_NAME} style={{ width: '88%', height: '88%', objectFit: 'contain' }} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{AI_NAME}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>AI достъп до вашите данни</div>
                </div>
              </div>
              <div style={{ fontSize: 11, color: '#16a34a' }}>online</div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {['Кой последно влезе?', 'Статус на врата', 'История днес'].map(c => (
                <button key={c} style={{ padding: '4px 10px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 20, fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: "'Inter', sans-serif" }} onClick={() => sendChat(c)}>{c}</button>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {chatMsgs.map((m, i) => (
              <div key={i} style={{ padding: '10px 12px', borderRadius: 10, fontSize: 12, lineHeight: 1.6, maxWidth: '90%', ...(m.role === 'ai' ? { background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text)', alignSelf: 'flex-start' } : { background: 'var(--btn-bg)', color: 'var(--btn-color)', alignSelf: 'flex-end' }) }}>{m.text}</div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
            <input style={{ flex: 1, background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', fontFamily: "'Inter', sans-serif", fontSize: 12, color: 'var(--text)', outline: 'none' }} placeholder={`Попитайте ${AI_NAME}...`} value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendChat(chatInput)} />
            <button style={{ width: 32, height: 32, background: 'var(--btn-bg)', border: 'none', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }} onClick={() => sendChat(chatInput)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--btn-color)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </div>
        </aside>
      </div>
    </Layout>
  )
}
