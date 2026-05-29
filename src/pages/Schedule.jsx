import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import AppLoader from '../components/AppLoader'
import { supabase } from '../supabase'
import { useDialog } from '../context/DialogContext'
import {
  getDayButtonStyle,
  getDeleteButtonStyle,
  getSaveButtonStyle,
  getScheduleCardStyle,
  getStatusBadgeStyle,
  scheduleStyles,
} from './Schedule.styles'
import {
  DAY_OPTIONS, formatAccessWindowShort, formatCountdown, formatScheduleRule,
  getCurrentScheduleWindow, getDefaultScheduleDays, getNextScheduleWindow,
  getScheduleState, normalizeScheduleDays, overlapsSchedule,
} from '../accessSchedule'
const statusLabels = { active: 'Активен', upcoming: 'Предстоящ', inactive: 'Неактивен' }

function Field({ label, children }) {
  return (
    <div style={scheduleStyles.fieldWrap}>
      <label style={scheduleStyles.fieldLabel}>{label}</label>
      {children}
    </div>
  )
}

function StatCard({ label, value, detail }) {
  return (
    <div style={scheduleStyles.statCard}>
      <div style={scheduleStyles.statLabel}>{label}</div>
      <div style={scheduleStyles.statValue}>{value}</div>
      <div style={scheduleStyles.statDetail}>{detail}</div>
    </div>
  )
}

function ScheduleBadge({ state }) {
  return <span style={getStatusBadgeStyle(state)}>{statusLabels[state]}</span>
}

function getInitialForm() {
  return { userId: '', days: getDefaultScheduleDays(), openTime: '09:00', closeTime: '18:00' }
}

function toggleDay(days, value) {
  const normalized = normalizeScheduleDays(days)
  return normalized.includes(value)
    ? normalized.filter(d => d !== value)
    : normalizeScheduleDays([...normalized, value])
}

function toDatabaseTime(value) {
  return value.length === 5 ? `${value}:00` : value
}

export default function Schedule() {
  const navigate = useNavigate()
  const [users, setUsers] = useState([])
  const [schedules, setSchedules] = useState([])
  const [doorId, setDoorId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [form, setForm] = useState(getInitialForm)
  const { showConfirm } = useDialog()

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { navigate('/login'); return }
    const { data: prof } = await supabase.from('users').select('*').eq('id', user.id).single()
    if (!prof || prof.role !== 'admin') { navigate('/dashboard'); return }
    const [usersResult, schedulesResult, doorResult] = await Promise.all([
      supabase.from('users').select('*').order('first_name'),
      supabase.from('schedules').select('*').limit(200),
      supabase.from('doors').select('*').limit(1),
    ])
    if (usersResult.error || schedulesResult.error || doorResult.error) { setError('Грешка при зареждане.'); setLoading(false); return }
    const primaryDoorId = doorResult.data?.[0]?.id || ''
    if (!primaryDoorId) { setError('Няма конфигурирана врата.'); setLoading(false); return }
    const allUsers = usersResult.data || []
    setUsers(allUsers); setSchedules(schedulesResult.data || []); setDoorId(primaryDoorId)
    const firstUser = allUsers.find(u => u.status === 'active' && u.role !== 'admin')?.id || ''
    setForm(c => ({ ...c, userId: c.userId || firstUser }))
    setLoading(false)
  }, [navigate])

  useEffect(() => {
    const id = window.setTimeout(() => void loadData(), 0)
    return () => window.clearTimeout(id)
  }, [loadData])

  async function createSchedule() {
    setError(''); setSuccess('')
    const selectedDays = normalizeScheduleDays(form.days)
    if (!form.userId || !doorId || selectedDays.length === 0 || !form.openTime || !form.closeTime) { setError('Изберете потребител, поне един ден и часови диапазон.'); return }
    if (form.closeTime <= form.openTime) { setError('Краят трябва да е след началото.'); return }
    if (schedules.some(s => s.user_id === form.userId && overlapsSchedule(selectedDays, form.openTime, form.closeTime, s))) { setError('Вече има припокриващ се график.'); return }
    setSaving(true)
    const { error: e } = await supabase.from('schedules').insert({ user_id: form.userId, door_id: doorId, days_of_week: selectedDays, open_time: toDatabaseTime(form.openTime), close_time: toDatabaseTime(form.closeTime), is_active: true })
    if (e) { setError('Не можа да бъде записан.'); setSaving(false); return }
    setSuccess(`Графикът е записан за ${users.find(u => u.id === form.userId)?.first_name || 'потребителя'}.`)
    setForm(c => ({ ...getInitialForm(), userId: c.userId }))
    await loadData(); setSaving(false)
  }

  async function deleteSchedule(scheduleId) {
    const confirmed = await showConfirm({ title: 'Премахни график', message: 'Сигурни ли сте?', confirmLabel: 'Премахни', cancelLabel: 'Отказ', tone: 'danger' })
    if (!confirmed) return
    setDeletingId(scheduleId); setError(''); setSuccess('')
    const { error: e } = await supabase.from('schedules').delete().eq('id', scheduleId)
    if (e) { setError('Не можа да бъде премахнат.'); setDeletingId(''); return }
    setSuccess('Графикът беше премахнат.')
    await loadData(); setDeletingId('')
  }

  if (loading) return <Layout><AppLoader /></Layout>

  const activeUsers = users.filter(u => u.status === 'active' && u.role !== 'admin')
  const usersById = Object.fromEntries(users.map(u => [u.id, u]))
  const decoratedSchedules = [...schedules]
    .map(s => ({ ...s, state: getScheduleState(s), user: usersById[s.user_id], currentWindow: getCurrentScheduleWindow(s), nextWindow: getNextScheduleWindow(s) }))
    .sort((a, b) => {
      const order = { active: 0, upcoming: 1, inactive: 2 }
      const diff = order[a.state] - order[b.state]
      if (diff !== 0) return diff
      const at = a.currentWindow?.start?.getTime() || a.nextWindow?.start?.getTime() || Number.MAX_SAFE_INTEGER
      const bt = b.currentWindow?.start?.getTime() || b.nextWindow?.start?.getTime() || Number.MAX_SAFE_INTEGER
      return at - bt
    })

  const activeCount = decoratedSchedules.filter(s => s.state === 'active').length
  const upcomingCount = decoratedSchedules.filter(s => s.state === 'upcoming').length
  const assignedUsersCount = new Set(decoratedSchedules.map(s => s.user_id)).size

  return (
    <Layout>
      <main className="page-main" style={scheduleStyles.main}>
        <div style={scheduleStyles.header}>
          <div style={scheduleStyles.title}>График за достъп</div>
          <div style={scheduleStyles.subtitle}>Само администратори могат да управляват графика.</div>
        </div>

        <div style={scheduleStyles.statsGrid}>
          <StatCard label="Активни графици" value={activeCount} detail="в момента" />
          <StatCard label="Предстоящи" value={upcomingCount} detail="очакват старт" />
          <StatCard label="С график" value={assignedUsersCount} detail="потребители" />
          <StatCard label="Активни служители" value={activeUsers.length} detail="налични" />
        </div>

        {error && <div style={scheduleStyles.errorNotice}>{error}</div>}
        {success && <div style={scheduleStyles.successNotice}>{success}</div>}

        <div className="grid-fixed">

          <section style={scheduleStyles.formCard}>
            <div style={scheduleStyles.cardTitle}>Нов график</div>
            <div style={scheduleStyles.cardSubtitle}>Задайте за кои дни и часове потребителят може да управлява вратата.</div>
            <div style={scheduleStyles.formStack}>
              <Field label="Потребител">
                <select style={scheduleStyles.input} value={form.userId} onChange={e => setForm(c => ({ ...c, userId: e.target.value }))} disabled={activeUsers.length === 0}>
                  {activeUsers.length === 0
                    ? <option value="">Няма активни потребители</option>
                    : activeUsers.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name} · {u.email}</option>)
                  }
                </select>
              </Field>
              <Field label="Дни">
                <div style={scheduleStyles.daysGrid}>
                  {DAY_OPTIONS.map(day => {
                    const selected = form.days.includes(day.value)
                    return (
                      <button key={day.value} type="button" onClick={() => setForm(c => ({ ...c, days: toggleDay(c.days, day.value) }))}
                        style={getDayButtonStyle(selected)}>
                        {day.shortLabel}
                      </button>
                    )
                  })}
                </div>
              </Field>
              <div style={scheduleStyles.timeGrid}>
                <Field label="Начало"><input type="time" style={scheduleStyles.input} value={form.openTime} onChange={e => setForm(c => ({ ...c, openTime: e.target.value }))} /></Field>
                <Field label="Край"><input type="time" style={scheduleStyles.input} value={form.closeTime} onChange={e => setForm(c => ({ ...c, closeTime: e.target.value }))} /></Field>
              </div>
              <button style={getSaveButtonStyle(activeUsers.length === 0)}
                onClick={createSchedule} disabled={saving || activeUsers.length === 0}>
                {saving ? 'Записване...' : 'Запази график'}
              </button>
            </div>
            <div style={scheduleStyles.helperNote}>
              След запис потребителят ще вижда в таблото, че може да управлява вратата само по този график.
            </div>
          </section>

          <section style={scheduleStyles.listCard}>
            <div style={scheduleStyles.listHeader}>
              <div style={scheduleStyles.cardTitle}>Планирани прозорци за достъп</div>
              <div style={scheduleStyles.subtitle}>{decoratedSchedules.length === 0 ? 'Все още няма създадени графици.' : `${decoratedSchedules.length} графика общо`}</div>
            </div>
            <div style={scheduleStyles.listWrap}>
              {decoratedSchedules.length === 0 ? (
                <div style={scheduleStyles.emptyState}>Няма създадени графици.</div>
              ) : decoratedSchedules.map(schedule => (
                <div key={schedule.id} style={getScheduleCardStyle(schedule.state)}>
                  <div style={scheduleStyles.scheduleHeader}>
                    <div style={scheduleStyles.scheduleCardText}>
                      <div style={scheduleStyles.scheduleHeadingRow}>
                        <div style={scheduleStyles.scheduleUserName}>{schedule.user?.first_name} {schedule.user?.last_name}</div>
                        <ScheduleBadge state={schedule.state} />
                      </div>
                      <div style={scheduleStyles.scheduleEmail}>{schedule.user?.email || 'Няма имейл'}</div>
                      <div style={scheduleStyles.scheduleRule}>{formatScheduleRule(schedule)}</div>
                      {schedule.currentWindow && <div style={scheduleStyles.activeWindow}>Активен прозорец: {formatAccessWindowShort(schedule.currentWindow.start, schedule.currentWindow.end)}</div>}
                      {!schedule.currentWindow && schedule.nextWindow && (
                        <>
                          <div style={scheduleStyles.upcomingWindow}>Следващ: {formatAccessWindowShort(schedule.nextWindow.start, schedule.nextWindow.end)}</div>
                          <div style={scheduleStyles.upcomingCountdown}>{formatCountdown(schedule.nextWindow.start)}</div>
                        </>
                      )}
                      {schedule.state === 'inactive' && <div style={scheduleStyles.inactiveWindow}>Не дава активен достъп в момента.</div>}
                    </div>
                    <button onClick={() => deleteSchedule(schedule.id)} disabled={deletingId === schedule.id}
                      style={getDeleteButtonStyle(deletingId === schedule.id)}>
                      {deletingId === schedule.id ? 'Премахване...' : 'Премахни'}
                    </button>
                  </div>
                  <div style={scheduleStyles.quickPreview}>Кратък преглед: {formatScheduleRule(schedule, true)}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </Layout>
  )
}
