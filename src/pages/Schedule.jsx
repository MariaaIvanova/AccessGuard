import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import AppLoader from '../components/AppLoader'
import { supabase } from '../supabase'
import { useDialog } from '../context/DialogContext'
import {
  DAY_OPTIONS,
  formatAccessWindowShort,
  formatCountdown,
  formatScheduleRule,
  getCurrentScheduleWindow,
  getDefaultScheduleDays,
  getNextScheduleWindow,
  getScheduleState,
  normalizeScheduleDays,
  overlapsSchedule,
} from '../accessSchedule'

const inp = {
  width: '100%',
  background: 'var(--input-bg)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '9px 12px',
  fontFamily: "'Inter', sans-serif",
  fontSize: 13,
  color: 'var(--text)',
  outline: 'none',
  boxSizing: 'border-box',
}

const statusStyles = {
  active: { background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' },
  upcoming: { background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' },
  inactive: { background: 'var(--input-bg)', color: 'var(--text-muted)', border: '1px solid var(--border)' },
}

const statusLabels = {
  active: 'Активен',
  upcoming: 'Предстоящ',
  inactive: 'Неактивен',
}

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</label>
      {children}
    </div>
  )
}

function StatCard({ label, value, detail }) {
  return (
    <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px' }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: -0.5, lineHeight: 1, marginBottom: 6, color: 'var(--text)' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{detail}</div>
    </div>
  )
}

function ScheduleBadge({ state }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 8px', borderRadius: 20, ...statusStyles[state] }}>
      {statusLabels[state]}
    </span>
  )
}

function getInitialForm() {
  return {
    userId: '',
    days: getDefaultScheduleDays(),
    openTime: '09:00',
    closeTime: '18:00',
  }
}

function toggleDay(days, value) {
  const normalizedDays = normalizeScheduleDays(days)
  if (normalizedDays.includes(value)) {
    return normalizedDays.filter((day) => day !== value)
  }

  return normalizeScheduleDays([...normalizedDays, value])
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
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      navigate('/login')
      return
    }

    const { data: prof } = await supabase.from('users').select('*').eq('id', user.id).single()
    if (!prof || prof.role !== 'admin') {
      navigate('/dashboard')
      return
    }

    const [usersResult, schedulesResult, doorResult] = await Promise.all([
      supabase.from('users').select('*').order('first_name'),
      supabase.from('schedules').select('*').limit(200),
      supabase.from('doors').select('*').limit(1),
    ])

    if (usersResult.error || schedulesResult.error || doorResult.error) {
      setError('Графикът не можа да бъде зареден от Supabase.')
      setLoading(false)
      return
    }

    const primaryDoorId = doorResult.data?.[0]?.id || ''
    if (!primaryDoorId) {
      setError('Няма конфигурирана врата за графика.')
      setLoading(false)
      return
    }

    const allUsers = usersResult.data || []
    setUsers(allUsers)
    setSchedules(schedulesResult.data || [])
    setDoorId(primaryDoorId)

    const firstAvailableUser =
      allUsers.find((item) => item.status === 'active' && item.role !== 'admin')?.id || ''

    setForm((current) => ({
      ...current,
      userId: current.userId || firstAvailableUser,
    }))

    setLoading(false)
  }, [navigate])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadData()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [loadData])

  async function createSchedule() {
    setError('')
    setSuccess('')

    const selectedDays = normalizeScheduleDays(form.days)

    if (!form.userId || !doorId || selectedDays.length === 0 || !form.openTime || !form.closeTime) {
      setError('Изберете потребител, поне един ден и часови диапазон.')
      return
    }

    if (form.closeTime <= form.openTime) {
      setError('Краят на графика трябва да е след началото.')
      return
    }

    const hasOverlap = schedules.some((schedule) => {
      if (schedule.user_id !== form.userId) return false
      return overlapsSchedule(selectedDays, form.openTime, form.closeTime, schedule)
    })

    if (hasOverlap) {
      setError('За този потребител вече има график, който се припокрива с избраните дни и часове.')
      return
    }

    setSaving(true)

    const { error: insertError } = await supabase.from('schedules').insert({
      user_id: form.userId,
      door_id: doorId,
      days_of_week: selectedDays,
      open_time: toDatabaseTime(form.openTime),
      close_time: toDatabaseTime(form.closeTime),
      is_active: true,
    })

    if (insertError) {
      setError('Графикът не можа да бъде записан.')
      setSaving(false)
      return
    }

    const scheduledUser = users.find((item) => item.id === form.userId)
    setSuccess(
      `Графикът е записан за ${scheduledUser?.first_name || 'потребителя'}. В таблото той ще вижда, че може да управлява вратата само в зададените дни и часове.`
    )

    setForm((current) => ({
      ...getInitialForm(),
      userId: current.userId,
    }))

    await loadData()
    setSaving(false)
  }

  async function deleteSchedule(scheduleId) {
    const confirmed = await showConfirm({
      title: 'Премахни график',
      message: 'Сигурни ли сте, че искате да премахнете този график?',
      confirmLabel: 'Премахни',
      cancelLabel: 'Отказ',
      tone: 'danger',
    })

    if (!confirmed) return

    setDeletingId(scheduleId)
    setError('')
    setSuccess('')

    const { error: deleteError } = await supabase.from('schedules').delete().eq('id', scheduleId)

    if (deleteError) {
      setError('Графикът не можа да бъде премахнат.')
      setDeletingId('')
      return
    }

    setSuccess('Графикът беше премахнат.')
    await loadData()
    setDeletingId('')
  }

  if (loading) {
    return (
      <Layout>
        <AppLoader />
      </Layout>
    )
  }

  const activeUsers = users.filter((item) => item.status === 'active' && item.role !== 'admin')
  const usersById = Object.fromEntries(users.map((item) => [item.id, item]))
  const decoratedSchedules = [...schedules]
    .map((schedule) => {
      const currentWindow = getCurrentScheduleWindow(schedule)
      const nextWindow = getNextScheduleWindow(schedule)
      return {
        ...schedule,
        state: getScheduleState(schedule),
        user: usersById[schedule.user_id],
        currentWindow,
        nextWindow,
      }
    })
    .sort((left, right) => {
      const stateOrder = { active: 0, upcoming: 1, inactive: 2 }
      const stateDiff = stateOrder[left.state] - stateOrder[right.state]
      if (stateDiff !== 0) return stateDiff

      const leftTime = left.currentWindow?.start?.getTime() || left.nextWindow?.start?.getTime() || Number.MAX_SAFE_INTEGER
      const rightTime = right.currentWindow?.start?.getTime() || right.nextWindow?.start?.getTime() || Number.MAX_SAFE_INTEGER
      return leftTime - rightTime
    })

  const activeCount = decoratedSchedules.filter((schedule) => schedule.state === 'active').length
  const upcomingCount = decoratedSchedules.filter((schedule) => schedule.state === 'upcoming').length
  const assignedUsersCount = new Set(decoratedSchedules.map((schedule) => schedule.user_id)).size

  return (
    <Layout>
      <main style={{ padding: '28px 32px 40px', background: 'var(--bg)', minHeight: 'calc(100vh - 56px)' }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.5, color: 'var(--text)', marginBottom: 3 }}>График за достъп</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Само администратори могат да управляват графика. Потребителите ще виждат в таблото, че могат да управляват вратата само в зададените дни и часове.
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
          <StatCard label="Активни графици" value={activeCount} detail="в момента" />
          <StatCard label="Предстоящи графици" value={upcomingCount} detail="очакват старт" />
          <StatCard label="Потребители с график" value={assignedUsersCount} detail="общо" />
          <StatCard label="Активни служители" value={activeUsers.length} detail="налични за планиране" />
        </div>

        {error && (
          <div style={{ fontSize: 12, color: '#ef4444', padding: '10px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {success && (
          <div style={{ fontSize: 12, color: '#16a34a', padding: '10px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, marginBottom: 16 }}>
            {success}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '360px minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
          <section style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Нов график</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
              Задайте за кои дни и между кои часове конкретен потребител може да управлява вратата дистанционно.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field label="Потребител">
                <select
                  style={inp}
                  value={form.userId}
                  onChange={(event) => setForm((current) => ({ ...current, userId: event.target.value }))}
                  disabled={activeUsers.length === 0}
                >
                  {activeUsers.length === 0 ? (
                    <option value="">Няма активни потребители</option>
                  ) : (
                    activeUsers.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.first_name} {item.last_name} · {item.email}
                      </option>
                    ))
                  )}
                </select>
              </Field>

              <Field label="Дни">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 8 }}>
                  {DAY_OPTIONS.map((day) => {
                    const selected = form.days.includes(day.value)
                    return (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() => setForm((current) => ({ ...current, days: toggleDay(current.days, day.value) }))}
                        style={{
                          padding: '9px 0',
                          borderRadius: 8,
                          border: selected ? '1px solid transparent' : '1px solid var(--border)',
                          background: selected ? 'var(--btn-bg)' : 'var(--card-bg)',
                          color: selected ? 'var(--btn-color)' : 'var(--text)',
                          fontFamily: "'Inter', sans-serif",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {day.shortLabel}
                      </button>
                    )
                  })}
                </div>
              </Field>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Начало">
                  <input
                    type="time"
                    style={inp}
                    value={form.openTime}
                    onChange={(event) => setForm((current) => ({ ...current, openTime: event.target.value }))}
                  />
                </Field>

                <Field label="Край">
                  <input
                    type="time"
                    style={inp}
                    value={form.closeTime}
                    onChange={(event) => setForm((current) => ({ ...current, closeTime: event.target.value }))}
                  />
                </Field>
              </div>

              <button
                style={{ width: '100%', padding: 10, background: 'var(--btn-bg)', border: 'none', borderRadius: 8, color: 'var(--btn-color)', fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 500, cursor: activeUsers.length === 0 ? 'not-allowed' : 'pointer', opacity: activeUsers.length === 0 ? 0.5 : 1 }}
                onClick={createSchedule}
                disabled={saving || activeUsers.length === 0}
              >
                {saving ? 'Записване...' : 'Запази график'}
              </button>
            </div>

            <div style={{ marginTop: 16, padding: '10px 12px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              След запис потребителят ще вижда в таблото, че може да управлява вратата само по този график.
            </div>
          </section>

          <section style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 3 }}>Планирани прозорци за достъп</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {decoratedSchedules.length === 0 ? 'Все още няма създадени графици.' : `${decoratedSchedules.length} графика общо`}
              </div>
            </div>

            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {decoratedSchedules.length === 0 ? (
                <div style={{ padding: '24px 10px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  Няма създадени графици.
                </div>
              ) : (
                decoratedSchedules.map((schedule) => (
                  <div key={schedule.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', background: schedule.state === 'active' ? 'rgba(240,253,244,0.5)' : 'var(--card-bg)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                            {schedule.user?.first_name} {schedule.user?.last_name}
                          </div>
                          <ScheduleBadge state={schedule.state} />
                        </div>

                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                          {schedule.user?.email || 'Няма имейл'}
                        </div>

                        <div style={{ fontSize: 13, color: 'var(--text)', marginBottom: 6, lineHeight: 1.5 }}>
                          {formatScheduleRule(schedule)}
                        </div>

                        {schedule.currentWindow && (
                          <div style={{ fontSize: 12, color: '#166534', marginBottom: 6 }}>
                            Активен прозорец: {formatAccessWindowShort(schedule.currentWindow.start, schedule.currentWindow.end)}
                          </div>
                        )}

                        {!schedule.currentWindow && schedule.nextWindow && (
                          <>
                            <div style={{ fontSize: 12, color: '#92400e', marginBottom: 4 }}>
                              Следващ прозорец: {formatAccessWindowShort(schedule.nextWindow.start, schedule.nextWindow.end)}
                            </div>
                            <div style={{ fontSize: 11, color: '#92400e', marginBottom: 6 }}>
                              {formatCountdown(schedule.nextWindow.start)}
                            </div>
                          </>
                        )}

                        {schedule.state === 'inactive' && (
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                            Този график в момента не дава активен достъп.
                          </div>
                        )}
                      </div>

                      <button
                        onClick={() => deleteSchedule(schedule.id)}
                        disabled={deletingId === schedule.id}
                        style={{ padding: '7px 10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#ef4444', fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}
                      >
                        {deletingId === schedule.id ? 'Премахване...' : 'Премахни'}
                      </button>
                    </div>

                    <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-light)' }}>
                      Кратък преглед: {formatScheduleRule(schedule, true)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </main>
    </Layout>
  )
}
