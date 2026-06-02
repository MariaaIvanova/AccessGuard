import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import AppLoader from '../components/AppLoader'
import { AI_NAME, BRAND_LOGO, BRAND_NAME } from '../branding'
import { useDialog } from '../context/DialogContext'
import {
  formatAccessWindowShort,
  getCurrentScheduleWindow,
  getNextScheduleWindow,
  isScheduleActive,
} from '../accessSchedule'

const METHOD_LABELS = { fingerprint: 'Пръстов отпечатък', pin: 'ПИН код', nfc: 'NFC карта', qr: 'QR код', remote: 'Дистанционно' }
const DIRECTION_LABELS = { in: 'Влизане', out: 'Излизане' }

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
  const [chatOpen, setChatOpen] = useState(false)
  const [chatMsgs, setChatMsgs] = useState([{ role: 'ai', text: `Здравейте! Аз съм ${AI_NAME}. Мога да отговарям на въпроси за вашите влизания и да изпълнявам команди — например „затвори вратата", „статус", „аварийно заключване".` }])
  const [chatInput, setChatInput] = useState('')
  const [accessSchedules, setAccessSchedules] = useState([])
  const chatEndRef = useRef(null)
  const navigate = useNavigate()
  const { showAlert, showConfirm } = useDialog()

  const loadData = useCallback(async () => {
    setLoading(true)
    const { data: { user: u } } = await supabase.auth.getUser()
    if (!u) { navigate('/login'); return }
    setUser(u)
    const { data: prof } = await supabase.from('users').select('*').eq('id', u.id).single()
    setProfile(prof)
    if (prof?.role !== 'admin') {
      const scheduleRequests = [
        supabase.from('schedules').select('*').eq('user_id', u.id).eq('is_active', true).limit(50),
      ]
      if (prof?.group_id) {
        scheduleRequests.push(
          supabase.from('group_schedules').select('*').eq('group_id', prof.group_id).eq('is_active', true).limit(50)
        )
      }
      const [userSchedulesResult, groupSchedulesResult] = await Promise.all(scheduleRequests)
      setAccessSchedules([...(userSchedulesResult.data || []), ...(groupSchedulesResult?.data || [])])
    } else {
      setAccessSchedules([])
    }
    const { data: doorData } = await supabase.from('doors').select('*').limit(1).single()
    setDoor(doorData)
    const { data: logsData } = await supabase.from('access_logs').select('*, doors(name)').eq('user_id', u.id).order('timestamp', { ascending: false }).limit(5)
    setLogs(logsData || [])
    const { data: allLogsData } = await supabase.from('access_logs').select('*').eq('user_id', u.id).order('timestamp', { ascending: false }).limit(200)
    setAllLogs(allLogsData || [])
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const { count } = await supabase.from('access_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', u.id)
      .eq('direction', 'in')
      .eq('result', 'granted')
      .gte('timestamp', today.toISOString())
    setTodayCount(count || 0)
    setLoading(false)
  }, [navigate])

  useEffect(() => { loadData() }, [loadData])
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chatMsgs])

  // Realtime: всеки път, когато админ или ESP32 промени doors → обновяваме веднага
  useEffect(() => {
    const channel = supabase.channel('dashboard-door-realtime')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'doors' }, (payload) => {
        setDoor(payload.new)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  // Realtime: ако се появят нови access_logs за този потребител, добавяме ги в списъка
  useEffect(() => {
    if (!user?.id) return
    const channel = supabase.channel('dashboard-logs-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'access_logs' }, async (msg) => {
        const newLog = msg.new
        if (newLog.user_id !== user.id) return
        const { data } = await supabase.from('access_logs').select('*, doors(name)').eq('id', newLog.id).single()
        if (data) {
          setLogs((prev) => [data, ...prev].slice(0, 5))
          setAllLogs((prev) => [data, ...prev].slice(0, 200))
          const today = new Date(); today.setHours(0, 0, 0, 0)
          if (data.direction === 'in' && data.result === 'granted' && new Date(data.timestamp) >= today) {
            setTodayCount((c) => c + 1)
          }
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user?.id])

  const methodCounts = allLogs.reduce((acc, l) => { acc[l.method] = (acc[l.method] || 0) + 1; return acc }, {})
  const hourCounts = Array(24).fill(0)
  allLogs.forEach(l => { hourCounts[new Date(l.timestamp).getHours()]++ })
  const maxHour = Math.max(...hourCounts, 1)
  const peakHour = hourCounts.indexOf(Math.max(...hourCounts))
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7)
  const weekLogs = allLogs.filter(l => new Date(l.timestamp) >= weekAgo)
  const isAdmin = profile?.role === 'admin'
  const activeAccessSchedule = accessSchedules.find((s) => isScheduleActive(s)) || null
  const activeAccessWindow = activeAccessSchedule ? getCurrentScheduleWindow(activeAccessSchedule) : null
  const upcomingAccessEntry = accessSchedules.map((s) => ({ schedule: s, window: getNextScheduleWindow(s) })).filter((e) => e.window).sort((a, b) => a.window.start.getTime() - b.window.start.getTime())[0] || null
  const upcomingAccessWindow = upcomingAccessEntry?.window || null
  const canOpenDoor = isAdmin || Boolean(activeAccessWindow)

  function addPin(d) {
    if (pin.length >= 4) return
    const next = pin + d
    setPin(next)
    if (next.length === 4) setTimeout(() => submitPin(next), 300)
  }
  function delPin() { setPin(p => p.slice(0, -1)) }
  function clearPin() { setPin(''); setPinError('') }

  async function issueDashboardCommand(command, payload = {}) {
    if (!door?.id) return { ok: false, message: 'Няма намерена врата.' }
    if (!door?.device_id) return { ok: false, message: 'Вратата няма свързано устройство.' }

    const { error } = await supabase.from('device_commands').insert({
      door_id: door.id,
      command,
      payload,
      issued_by: user.id,
      status: 'pending',
    })

    if (error) return { ok: false, message: error.message || 'Командата не можа да бъде изпратена.' }
    return { ok: true }
  }

  async function submitPin(p = pin) {
    if (p.length < 4) return
    if (!door?.id) { setPinError('Няма свързана врата'); setPin(''); return }
    // Сървърната RPC прави ВСИЧКИ проверки атомарно (PIN, активност, blacklist,
    // schedule, аварийно заключване, поддръжка) — заобикаля RLS, праща command
    // и записва access_log с един atomic call.
    const { data, error } = await supabase.rpc('request_remote_unlock', {
      p_door_id: door.id, p_pin: p,
    })
    if (error) { setPinError(`Грешка: ${error.message}`); setPin(''); return }
    if (!data?.success) {
      const REASONS = {
        not_authenticated: 'Не сте логнат.',
        no_profile:        'Профилът липсва.',
        inactive_user:     'Профилът не е активен.',
        blacklisted:       'Профилът е в черен списък.',
        wrong_pin:         'Грешен ПИН код',
        no_door:           'Няма свързана врата',
        no_device:         'Устройството не е свързано',
        emergency_lock:    'Аварийното заключване е активно',
        maintenance:       'Достъпът е блокиран — режим на поддръжка',
        no_schedule:       upcomingAccessWindow
          ? `Нямате активен график. Следващият прозорец: ${formatAccessWindowShort(upcomingAccessWindow.start, upcomingAccessWindow.end)}.`
          : 'Нямате активен график за дистанционно управление.',
      }
      setPinError(REASONS[data?.reason] || 'Не може да бъде отворено')
      setPin(''); return
    }
    setShowPin(false); clearPin()
    setDoor((d) => d ? { ...d, status: 'open', last_opened_at: new Date().toISOString() } : d)  // Optimistic update
    await showAlert({ title: 'Успешно действие', message: 'Командата е изпратена. Вратата ще щракне след секунда.', confirmLabel: 'Разбрах', tone: 'success' })
  }

  async function closeDoor() {
    if (!canOpenDoor || !door?.id) return
    const { data, error } = await supabase.rpc('request_remote_close', { p_door_id: door.id })
    if (error) {
      await showAlert({ title: 'Грешка', message: error.message, confirmLabel: 'Разбрах', tone: 'danger' })
      return
    }
    if (!data?.success) {
      await showAlert({ title: 'Не може да бъде затворено', message: data?.reason || 'Неизвестна причина', confirmLabel: 'Разбрах', tone: 'warning' })
      return
    }
    setDoor((d) => d ? { ...d, status: 'closed' } : d)  // Optimistic update
  }

  async function emergencyLock() {
    const newLocked = !door?.is_locked
    if (newLocked) {
      const confirmed = await showConfirm({ title: 'Аварийно заключване', message: 'Сигурни ли сте? Аварийното заключване ще блокира ВСИЧКИ влизания незабавно.', confirmLabel: 'Активирай', cancelLabel: 'Отказ', tone: 'danger' })
      if (!confirmed) return
    }
    const commandResult = await issueDashboardCommand(newLocked ? 'emergency_lock' : 'emergency_unlock')
    if (!commandResult.ok) {
      await showAlert({ title: 'Грешка', message: `Командата не можа да бъде изпратена: ${commandResult.message}`, confirmLabel: 'Разбрах', tone: 'danger' })
      return
    }
    // Обновяваме doors.is_locked директно за мигновен UI feedback (оптимистично)
    await supabase.from('doors').update({ is_locked: newLocked, status: 'closed' }).eq('id', door.id)
    await supabase.from('audit_logs').insert({ admin_id: user.id, action: newLocked ? 'emergency_lock' : 'emergency_unlock', details: { door_id: door?.id, timestamp: new Date().toISOString() } })
  }

  function detectIntent(text) {
    const t = ' ' + text.toLowerCase().trim() + ' '
    // Статус — провери първо, защото „вратата отворена ли е" не е команда
    if (/(стат|как е вратата|каква.*врата|какво.*състояни|изправн|онлайн ли|е ли отворена|е ли затворена)/i.test(t)) {
      return { type: 'status' }
    }
    // Аварийно отключване
    if (/(деактивир|спри.*заключ|отключи аварий|махни.*заключ|emergency.*off|emergency.*unlock)/i.test(t)) {
      return { type: 'emergency_unlock' }
    }
    // Аварийно заключване
    if (/(аварийн|спешн|блокирай|emergency.*lock)/i.test(t) || (/заключи/i.test(t) && !/отключ/i.test(t))) {
      return { type: 'emergency_lock' }
    }
    // Затваряне
    if (/(затвор|close.*door|relock)/i.test(t)) {
      return { type: 'close' }
    }
    // Отваряне (изисква PIN)
    if (/(отвор|пусни|open.*door|unlock)/i.test(t)) {
      return { type: 'open_with_pin' }
    }
    // Колко влизания днес
    if (/(колко.*влиз|колко.*днес|брой.*днес|how many.*today)/i.test(t)) {
      return { type: 'count_today' }
    }
    return null
  }

  function pushAIMessage(text) {
    setChatMsgs((prev) => [...prev, { role: 'ai', text }])
  }

  async function executeAIIntent(intent) {
    if (intent.type === 'status') {
      const physicalState = isLocked ? '🔒 Аварийно заключена' : door?.status === 'open' ? '🟢 Отворена' : '⚪ Затворена'
      const onlineState = door?.last_heartbeat
        ? (Date.now() - new Date(door.last_heartbeat).getTime() < 90000 ? 'устройството е онлайн' : 'устройството е офлайн')
        : 'устройството не е свързано'
      pushAIMessage(`Вратата в момента е ${physicalState}, ${onlineState}. Днес имам регистрирани ${todayCount} влизания.`)
      return
    }
    if (intent.type === 'count_today') {
      pushAIMessage(`Днес имам ${todayCount} ${todayCount === 1 ? 'влизане' : 'влизания'} общо.`)
      return
    }
    if (intent.type === 'open_with_pin') {
      if (openBlocked) {
        if (isLocked) pushAIMessage('Не мога да отворя — аварийното заключване е активно.')
        else if (inMaintenance) pushAIMessage('Не мога да отворя — системата е в режим на поддръжка.')
        else pushAIMessage('Нямате активен график за дистанционно отваряне в момента.')
        return
      }
      pushAIMessage('За дистанционно отваряне ми трябва вашият ПИН. Отварям клавиатурата сега — въведете 4-цифрения си код.')
      setShowPin(true)
      return
    }
    if (intent.type === 'close') {
      if (!canOpenDoor) {
        pushAIMessage('Нямате право да затворите вратата от ваше име — необходим е активен график или администраторски достъп.')
        return
      }
      if (!door?.id) {
        pushAIMessage('Няма свързана врата.')
        return
      }
      pushAIMessage('Изпращам команда за затваряне...')
      const { data, error } = await supabase.rpc('request_remote_close', { p_door_id: door.id })
      if (error) {
        pushAIMessage(`Възникна грешка: ${error.message}`)
      } else if (!data?.success) {
        pushAIMessage(`Не успях да затворя вратата (${data?.reason || 'неизвестна причина'}).`)
      } else {
        setDoor((d) => d ? { ...d, status: 'closed' } : d)  // Optimistic update — мигновен UI feedback
        pushAIMessage('✓ Командата е изпратена. Вратата ще се затвори след секунда.')
      }
      return
    }
    if (intent.type === 'emergency_lock') {
      if (!isAdmin) {
        pushAIMessage('Само администратор може да активира аварийно заключване.')
        return
      }
      if (door?.is_locked) {
        pushAIMessage('Вратата вече е в режим на аварийно заключване.')
        return
      }
      pushAIMessage('⚠ Активирам аварийно заключване — всички влизания ще бъдат блокирани.')
      await supabase.from('doors').update({ is_locked: true, status: 'closed' }).eq('id', door.id)
      await supabase.from('audit_logs').insert({
        admin_id: user.id, action: 'emergency_lock',
        details: { door_id: door.id, source: 'ai_chat', timestamp: new Date().toISOString() },
      })
      await supabase.from('device_commands').insert({
        door_id: door.id, command: 'emergency_lock', status: 'pending', issued_by: user.id,
      })
      pushAIMessage('✓ Аварийното заключване е активно. За деактивиране — кажи „деактивирай заключването".')
      return
    }
    if (intent.type === 'emergency_unlock') {
      if (!isAdmin) {
        pushAIMessage('Само администратор може да деактивира аварийно заключване.')
        return
      }
      if (!door?.is_locked) {
        pushAIMessage('Аварийното заключване не е активно в момента.')
        return
      }
      pushAIMessage('Деактивирам аварийното заключване...')
      await supabase.from('doors').update({ is_locked: false, status: 'closed' }).eq('id', door.id)
      await supabase.from('audit_logs').insert({
        admin_id: user.id, action: 'emergency_unlock',
        details: { door_id: door.id, source: 'ai_chat', timestamp: new Date().toISOString() },
      })
      await supabase.from('device_commands').insert({
        door_id: door.id, command: 'emergency_unlock', status: 'pending', issued_by: user.id,
      })
      pushAIMessage('✓ Аварийното заключване е деактивирано. Системата приема нормален достъп.')
      return
    }
  }

  async function sendChat(text) {
    const clean = text.trim()
    if (!clean) return
    setChatInput('')
    const nextMsgs = [...chatMsgs, { role: 'user', text: clean }]
    setChatMsgs(nextMsgs)

    // Първо: ако е известна команда — изпълни я директно (без LLM)
    const intent = detectIntent(clean)
    if (intent) {
      await executeAIIntent(intent)
      return
    }

    try {
      const today = new Date(); const todayStr = today.toISOString().slice(0, 10)
      const safeAllLogs = Array.isArray(allLogs) ? allLogs : []
      const todayLogs = safeAllLogs.filter((log) => (log?.timestamp || '').startsWith(todayStr))
      const deniedToday = todayLogs.filter((log) => log?.result === 'denied').length
      const grantedToday = todayLogs.filter((log) => log?.result === 'granted').length
      const methodCountsLocal = safeAllLogs.reduce((acc, log) => { const m = log?.method || 'unknown'; acc[m] = (acc[m] || 0) + 1; return acc }, {})
      const mostUsedMethodKey = Object.entries(methodCountsLocal).sort((a, b) => b[1] - a[1])[0]?.[0] || null
      const mostUsedMethod = METHOD_LABELS[mostUsedMethodKey] || mostUsedMethodKey || 'Няма данни'
      const hourCountsLocal = Array(24).fill(0)
      safeAllLogs.forEach((log) => { const ts = log?.timestamp; if (!ts) return; const h = new Date(ts).getHours(); if (!Number.isNaN(h)) hourCountsLocal[h]++ })
      const peakHourLocal = hourCountsLocal.indexOf(Math.max(...hourCountsLocal, 0))
      const lateNightLogs = safeAllLogs.filter((log) => { const ts = log?.timestamp; if (!ts) return false; const h = new Date(ts).getHours(); return h >= 23 || h < 5 }).length
      const deniedRecent = safeAllLogs.slice(0, 10).filter((log) => log?.result === 'denied').length
      const suspiciousFlags = []
      if (deniedToday >= 3) suspiciousFlags.push(`Има ${deniedToday} отказани опита днес.`)
      if (lateNightLogs > 0) suspiciousFlags.push(`Има ${lateNightLogs} късни влизания между 23:00 и 05:00.`)
      if (door?.is_locked) suspiciousFlags.push('Вратата е в режим аварийно заключване.')
      if (deniedRecent >= 3) suspiciousFlags.push(`В последните 10 записа има ${deniedRecent} отказани опита.`)
      const recentLogsText = safeAllLogs.slice(0, 8).map((log, i) => `${i + 1}. ${log?.timestamp ? formatDate(log.timestamp) : '—'} | ${DIRECTION_LABELS[log?.direction] || '—'} | ${METHOD_LABELS[log?.method] || '—'} | ${log?.result === 'granted' ? 'Разрешен' : log?.result === 'denied' ? 'Отказан' : '—'}`).join('\n')
      const systemPrompt = `Ти си ${AI_NAME}, security асистент в ${BRAND_NAME}.
Освен да отговаряш на въпроси, можеш и да изпълняваш команди (тези команди се обработват от системата автоматично, не от тебе):
- „затвори вратата" → затваря вратата
- „отвори вратата" → отваря клавиатурата за ПИН
- „аварийно заключване" / „заключи" → активира блокировка (само админи)
- „деактивирай заключването" → изключва блокировката (само админи)
- „статус" / „как е вратата" → връща текущо състояние
- „колко влизания днес" → връща брой

Ако потребителят пита за нещо, което не е команда, отговаряй кратко и точно на български.

ПОТРЕБИТЕЛ: ${profile?.first_name || ''} ${profile?.last_name || ''}, ${profile?.role || 'user'}
ВРАТА: ${door?.status || 'unknown'}, Заключена: ${door?.is_locked ? 'Да' : 'Не'}
СТАТИСТИКА: Логове днес: ${todayLogs.length}, Разрешени: ${grantedToday}, Отказани: ${deniedToday}, Пиков час: ${peakHourLocal}:00, Най-използван метод: ${mostUsedMethod}
ПОДОЗРИТЕЛНО: ${suspiciousFlags.length ? suspiciousFlags.join(' ') : 'Няма'}
ПОСЛЕДНИ ЗАПИСИ:
${recentLogsText || 'Няма'}`
      const messagesForModel = nextMsgs.map((m) => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.text }))
      const { data, error } = await supabase.functions.invoke('chat', { body: { system: systemPrompt, messages: messagesForModel } })
      if (error) { setChatMsgs((prev) => [...prev, { role: 'ai', text: `Грешка: ${error.message || 'Неуспешна заявка.'}` }]); return }
      setChatMsgs((prev) => [...prev, { role: 'ai', text: data?.reply || `Няма отговор от ${AI_NAME}.` }])
    } catch (err) {
      setChatMsgs((prev) => [...prev, { role: 'ai', text: `Грешка: ${err?.message || 'Неочаквана грешка.'}` }])
    }
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

  if (loading) return <Layout><AppLoader /></Layout>

  const lastLog = logs[0]
  const isLocked = door?.is_locked
  // Maintenance check (от DB, синхронизирано за всички потребители)
  const inMaintenance = (() => {
    if (!door?.maintenance_enabled) return false
    const now = new Date()
    const cur = now.getHours() * 60 + now.getMinutes()
    const parseT = (t) => {
      if (!t) return 0
      const [h, m] = String(t).slice(0, 5).split(':').map(Number)
      return h * 60 + m
    }
    const s = parseT(door.maintenance_start)
    const e = parseT(door.maintenance_end)
    return s <= e ? (cur >= s && cur <= e) : (cur >= s || cur <= e)
  })()
  const closeBlocked = !canOpenDoor || inMaintenance
  const openBlocked = isLocked || !canOpenDoor || inMaintenance
  const scheduleNoticeTone = activeAccessWindow ? 'active' : upcomingAccessWindow ? 'upcoming' : 'inactive'
  const scheduleNoticeStyles = {
    active: { background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', iconBg: '#16a34a' },
    upcoming: { background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', iconBg: '#f59e0b' },
    inactive: { background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', iconBg: '#ef4444' },
  }
  const currentScheduleNotice = scheduleNoticeStyles[scheduleNoticeTone]

  return (
    <Layout>
      <div style={{ background: 'var(--bg)', minHeight: 'calc(100vh - 56px)' }}>
        <main className="page-main">

          {isLocked && (
            <div style={{ background: '#fef2f2', border: '2px solid #ef4444', borderRadius: 10, padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ width: 32, height: 32, background: '#ef4444', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#ef4444' }}>АВАРИЙНОТО ЗАКЛЮЧВАНЕ Е АКТИВНО</div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Никой не може да отвори вратата.</div>
              </div>
              {profile?.role === 'admin' && (
                <button onClick={emergencyLock} style={{ padding: '7px 14px', background: '#ef4444', border: 'none', borderRadius: 8, color: '#fff', fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>Деактивирай</button>
              )}
            </div>
          )}

          {inMaintenance && !isLocked && (
            <div style={{ background: '#fffbeb', border: '2px solid #f59e0b', borderRadius: 10, padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ width: 32, height: 32, background: '#f59e0b', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#92400e' }}>РЕЖИМ НА ПОДДРЪЖКА</div>
                <div style={{ fontSize: 12, color: '#a16207', marginTop: 2 }}>
                  Достъпът е блокиран ({String(door?.maintenance_start || '').slice(0,5)} – {String(door?.maintenance_end || '').slice(0,5)}).
                </div>
              </div>
            </div>
          )}

          {!isAdmin && (
            <div style={{ background: currentScheduleNotice.background, border: currentScheduleNotice.border, borderRadius: 10, padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ width: 32, height: 32, background: currentScheduleNotice.iconBg, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {activeAccessSchedule
                  ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                  : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>
                }
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: currentScheduleNotice.color }}>
                  {activeAccessWindow ? 'Имате активен прозорец за достъп' : upcomingAccessWindow ? 'Имате предстоящ график за достъп' : 'В момента нямате активен график'}
                </div>
                <div style={{ fontSize: 12, color: currentScheduleNotice.color, marginTop: 2, lineHeight: 1.5 }}>
                  {activeAccessWindow ? `Можете да управлявате вратата само в периода ${formatAccessWindowShort(activeAccessWindow.start, activeAccessWindow.end)}.` : upcomingAccessWindow ? `Следващият ви период за управление е ${formatAccessWindowShort(upcomingAccessWindow.start, upcomingAccessWindow.end)}.` : 'Дистанционното управление е разрешено само в период, зададен от администратор.'}
                </div>
              </div>
            </div>
          )}

          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.5, color: 'var(--text)', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  {greeting()}, {profile?.first_name}
                  {profile?.role === 'admin' && <span style={{ fontSize: 11, fontWeight: 500, background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text-muted)', padding: '3px 8px', borderRadius: 20 }}>Администратор</span>}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  {new Date().toLocaleDateString('bg-BG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {profile?.role === 'admin' && !isLocked && (
                  <button onClick={emergencyLock} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: 8, fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                    Аварийно заключване
                  </button>
                )}
                {door?.status === 'open' && !isLocked && (
                  <button onClick={() => !closeBlocked && closeDoor()} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', background: closeBlocked ? 'var(--input-bg)' : 'var(--card-bg)', color: closeBlocked ? 'var(--text-muted)' : 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 500, cursor: closeBlocked ? 'not-allowed' : 'pointer', opacity: closeBlocked ? 0.5 : 1 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    Затвори врата
                  </button>
                )}
                <button data-tour="open-pin-btn" onClick={() => !openBlocked && setShowPin(true)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', background: openBlocked ? 'var(--input-bg)' : 'var(--btn-bg)', color: openBlocked ? 'var(--text-muted)' : 'var(--btn-color)', border: openBlocked ? '1px solid var(--border)' : 'none', borderRadius: 8, fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 500, cursor: openBlocked ? 'not-allowed' : 'pointer', opacity: openBlocked ? 0.5 : 1 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  Отвори с ПИН
                </button>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 24 }}>
            <div data-tour="door-status" style={{ background: 'var(--card-bg)', border: isLocked ? '2px solid #ef4444' : '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', transition: 'border 0.2s' }}>
              <div style={{ fontSize: 12, color: isLocked ? '#ef4444' : 'var(--text-muted)', marginBottom: 8, fontWeight: isLocked ? 600 : 400 }}>Статус на врата</div>
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
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{lastLog ? `${new Date(lastLog.timestamp).toLocaleDateString('bg-BG')} · ${METHOD_LABELS[lastLog.method]}` : 'Няма данни'}</div>
            </div>
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Влизания днес</div>
              <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: -0.5, lineHeight: 1, marginBottom: 6, color: 'var(--text)' }}>{todayCount}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>общо за деня</div>
            </div>
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Тази седмица</div>
              <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: -0.5, lineHeight: 1, marginBottom: 6, color: 'var(--text)' }}>{weekLogs.length}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{weekLogs.filter(l => l.result === 'granted').length} разрешени · {weekLogs.filter(l => l.result === 'denied').length} отказани</div>
            </div>
          </div>

          <div className="grid-2col" style={{ marginBottom: 16 }}>
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

          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 3 }}>Седмичен отчет</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{weekLogs.length} влизания · от {weekAgo.toLocaleDateString('bg-BG')} до днес</div>
            </div>
            <button onClick={downloadReport} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 500, cursor: 'pointer', color: 'var(--text)', flexShrink: 0 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Изтегли CSV
            </button>
          </div>

          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>История на достъп</div>
              <a href="#" onClick={e => { e.preventDefault(); navigate('/history') }} style={{ fontSize: 12, color: '#3b82f6', textDecoration: 'none', fontWeight: 500 }}>Виж цялата история →</a>
            </div>
            <div className="table-scroll">
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 400 }}>
                <thead>
                  <tr style={{ background: 'var(--table-head)' }}>
                    {['Дата и час', 'Посока', 'Метод', 'Статус'].map(h => (
                      <th key={h} style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, padding: '10px 16px', textAlign: 'left', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logs.length === 0
                    ? <tr><td colSpan={4} style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Няма записи</td></tr>
                    : logs.map((log, i) => (
                        <tr key={log.id} style={{ borderBottom: i < logs.length - 1 ? '1px solid var(--border)' : 'none' }}>
                          <td style={{ padding: '11px 16px', fontSize: 12, color: 'var(--text)', whiteSpace: 'nowrap' }}>{formatDate(log.timestamp)}</td>
                          <td style={{ padding: '11px 16px', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{DIRECTION_LABELS[log.direction] || '—'}</td>
                          <td style={{ padding: '11px 16px', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{METHOD_LABELS[log.method] || log.method}</td>
                          <td style={{ padding: '11px 16px', whiteSpace: 'nowrap' }}>
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
          </div>

          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Запитвания към администратор</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>Изпращайте запитвания и виждайте отговорите от профила си.</div>
            </div>
            <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, flex: 1 }}>
                Изпратете ново запитване, а след решение ще видите дали е прието или отказано.
              </div>
              <button onClick={() => navigate('/profile')} style={{ padding: '8px 14px', background: 'var(--btn-bg)', border: 'none', borderRadius: 8, color: 'var(--btn-color)', fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
                Отвори запитванията
              </button>
            </div>
          </div>
        </main>

        {showPin && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={e => { if (e.target === e.currentTarget) { setShowPin(false); clearPin() } }}>
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

        <button onClick={() => setChatOpen(o => !o)} style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 300, width: 52, height: 52, borderRadius: '50%', background: 'linear-gradient(135deg, #dd7fa2, #c9638b)', border: 'none', cursor: 'pointer', boxShadow: '0 4px 20px rgba(201,99,139,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title={AI_NAME}>
          {chatOpen
            ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            : <img src={BRAND_LOGO} alt={AI_NAME} style={{ width: 30, height: 30, objectFit: 'contain' }} />
          }
        </button>

        {chatOpen && (
          <div style={{ position: 'fixed', bottom: 88, right: 16, zIndex: 299, width: 'min(320px, calc(100vw - 32px))', height: 'min(460px, calc(100vh - 120px))', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 16, boxShadow: '0 8px 40px rgba(0,0,0,0.35)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ width: 26, height: 26, background: 'rgba(255,255,255,0.78)', border: '1px solid var(--border)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  <img src={BRAND_LOGO} alt={AI_NAME} style={{ width: '88%', height: '88%', objectFit: 'contain' }} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{AI_NAME}</div>
                  <div style={{ fontSize: 10, color: '#16a34a' }}>● online</div>
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {['Кой последно влезе?', 'Статус на врата', 'История днес'].map(c => (
                  <button key={c} style={{ padding: '3px 9px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 20, fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: "'Inter', sans-serif" }} onClick={() => sendChat(c)}>{c}</button>
                ))}
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 9 }}>
              {chatMsgs.map((m, i) => (
                <div key={i} style={{ padding: '9px 11px', borderRadius: 10, fontSize: 12, lineHeight: 1.6, maxWidth: '88%', ...(m.role === 'ai' ? { background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text)', alignSelf: 'flex-start' } : { background: 'var(--btn-bg)', color: 'var(--btn-color)', alignSelf: 'flex-end' }) }}>{m.text}</div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', display: 'flex', gap: 7 }}>
              <input style={{ flex: 1, background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 11px', fontFamily: "'Inter', sans-serif", fontSize: 12, color: 'var(--text)', outline: 'none', minWidth: 0 }} placeholder={`Попитайте ${AI_NAME}...`} value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendChat(chatInput)} autoFocus />
              <button style={{ width: 32, height: 32, background: 'var(--btn-bg)', border: 'none', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }} onClick={() => sendChat(chatInput)}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--btn-color)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
