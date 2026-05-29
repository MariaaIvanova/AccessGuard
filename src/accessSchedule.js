const DAY_LABELS = {
  1: { short: 'Пн', full: 'Понеделник' },
  2: { short: 'Вт', full: 'Вторник' },
  3: { short: 'Ср', full: 'Сряда' },
  4: { short: 'Чт', full: 'Четвъртък' },
  5: { short: 'Пт', full: 'Петък' },
  6: { short: 'Сб', full: 'Събота' },
  7: { short: 'Нд', full: 'Неделя' },
}

export const DAY_OPTIONS = Object.entries(DAY_LABELS).map(([value, label]) => ({
  value: Number(value),
  shortLabel: label.short,
  label: label.full,
}))

function pad(value) {
  return String(value).padStart(2, '0')
}

function getIsoDay(date) {
  const day = date.getDay()
  return day === 0 ? 7 : day
}

function toMinutes(value) {
  if (!value) return Number.NaN
  const [hours, minutes] = String(value).split(':').map(Number)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return Number.NaN
  return hours * 60 + minutes
}

function buildDateAtTime(baseDate, timeValue) {
  const [hours, minutes] = String(timeValue).split(':').map(Number)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null
  const date = new Date(baseDate)
  date.setHours(hours, minutes, 0, 0)
  return date
}

export function toInputTimeValue(value) {
  if (!value) return ''
  return String(value).slice(0, 5)
}

export function normalizeScheduleDays(days) {
  if (!Array.isArray(days)) return []

  return [...new Set(
    days
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value >= 1 && value <= 7)
  )].sort((a, b) => a - b)
}

export function getDefaultScheduleDays() {
  return [1, 2, 3, 4, 5]
}

export function formatScheduleDays(days, short = false) {
  const normalizedDays = normalizeScheduleDays(days)
  if (normalizedDays.length === 0) return 'Без зададени дни'
  if (normalizedDays.length === 7) return short ? 'Всеки ден' : 'Всеки ден'

  return normalizedDays
    .map((value) => (short ? DAY_LABELS[value]?.short : DAY_LABELS[value]?.full) || value)
    .join(short ? ', ' : ', ')
}

export function formatScheduleRule(schedule, short = false) {
  return `${formatScheduleDays(schedule.days_of_week, short)} · ${toInputTimeValue(schedule.open_time)} — ${toInputTimeValue(schedule.close_time)}`
}

export function formatAccessWindow(startsAt, endsAt) {
  const start = new Date(startsAt)
  const end = new Date(endsAt)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 'Невалиден период'

  return `${start.toLocaleDateString('bg-BG', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })}, ${start.toLocaleTimeString('bg-BG', {
    hour: '2-digit',
    minute: '2-digit',
  })} — ${end.toLocaleDateString('bg-BG', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })}, ${end.toLocaleTimeString('bg-BG', {
    hour: '2-digit',
    minute: '2-digit',
  })}`
}

export function formatAccessWindowShort(startsAt, endsAt) {
  const start = new Date(startsAt)
  const end = new Date(endsAt)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 'Невалиден период'

  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate()

  if (sameDay) {
    return `${start.toLocaleDateString('bg-BG', {
      day: 'numeric',
      month: 'long',
    })} · ${start.toLocaleTimeString('bg-BG', {
      hour: '2-digit',
      minute: '2-digit',
    })} — ${end.toLocaleTimeString('bg-BG', {
      hour: '2-digit',
      minute: '2-digit',
    })}`
  }

  return `${start.toLocaleDateString('bg-BG', {
    day: 'numeric',
    month: 'short',
  })} ${start.toLocaleTimeString('bg-BG', {
    hour: '2-digit',
    minute: '2-digit',
  })} — ${end.toLocaleDateString('bg-BG', {
    day: 'numeric',
    month: 'short',
  })} ${end.toLocaleTimeString('bg-BG', {
    hour: '2-digit',
    minute: '2-digit',
  })}`
}

export function getCurrentScheduleWindow(schedule, now = new Date()) {
  if (schedule?.is_active === false) return null

  const normalizedDays = normalizeScheduleDays(schedule?.days_of_week)
  if (!normalizedDays.includes(getIsoDay(now))) return null

  const start = buildDateAtTime(now, schedule?.open_time)
  const end = buildDateAtTime(now, schedule?.close_time)

  if (!start || !end || end <= start) return null
  if (start > now || end < now) return null

  return { start, end }
}

export function getNextScheduleWindow(schedule, now = new Date()) {
  if (schedule?.is_active === false) return null

  const normalizedDays = normalizeScheduleDays(schedule?.days_of_week)
  if (normalizedDays.length === 0) return null

  const startMinutes = toMinutes(schedule?.open_time)
  const endMinutes = toMinutes(schedule?.close_time)
  if (Number.isNaN(startMinutes) || Number.isNaN(endMinutes) || endMinutes <= startMinutes) return null

  const today = new Date(now)
  today.setHours(0, 0, 0, 0)

  for (let offset = 0; offset < 8; offset += 1) {
    const candidateDate = new Date(today)
    candidateDate.setDate(candidateDate.getDate() + offset)

    if (!normalizedDays.includes(getIsoDay(candidateDate))) continue

    const start = buildDateAtTime(candidateDate, schedule.open_time)
    const end = buildDateAtTime(candidateDate, schedule.close_time)

    if (!start || !end || end <= start) continue
    if (start <= now) continue

    return { start, end }
  }

  return null
}

export function isScheduleActive(schedule, now = new Date()) {
  return Boolean(getCurrentScheduleWindow(schedule, now))
}

export function getScheduleState(schedule, now = new Date()) {
  if (isScheduleActive(schedule, now)) return 'active'
  if (getNextScheduleWindow(schedule, now)) return 'upcoming'
  return 'inactive'
}

export function overlapsSchedule(days, openTime, closeTime, schedule) {
  if (schedule?.is_active === false) return false

  const nextDays = normalizeScheduleDays(days)
  const currentDays = normalizeScheduleDays(schedule?.days_of_week)
  const sharedDay = nextDays.some((value) => currentDays.includes(value))
  if (!sharedDay) return false

  const startA = toMinutes(openTime)
  const endA = toMinutes(closeTime)
  const startB = toMinutes(schedule?.open_time)
  const endB = toMinutes(schedule?.close_time)

  if ([startA, endA, startB, endB].some(Number.isNaN)) return false

  return startA < endB && endA > startB
}

export function formatCountdown(value) {
  const target = new Date(value)
  const diff = target.getTime() - Date.now()
  if (Number.isNaN(target.getTime()) || diff <= 0) return 'Започва сега'

  const totalMinutes = Math.round(diff / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours <= 0) return `След ${minutes} мин`
  if (minutes === 0) return `След ${hours} ч`
  return `След ${hours} ч ${pad(minutes)} мин`
}
