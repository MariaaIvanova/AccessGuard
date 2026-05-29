import test from 'node:test'
import assert from 'node:assert/strict'

import {
  formatCountdown,
  formatScheduleDays,
  getCurrentScheduleWindow,
  getDefaultScheduleDays,
  getNextScheduleWindow,
  getScheduleState,
  normalizeScheduleDays,
  overlapsSchedule,
  toInputTimeValue,
} from '../src/accessSchedule.js'

test('normalizeScheduleDays keeps only valid unique ISO days in sorted order', () => {
  assert.deepEqual(normalizeScheduleDays([5, '1', 3, 5, 9, 0, null, 'x', 7]), [1, 3, 5, 7])
})

test('getDefaultScheduleDays returns weekdays', () => {
  assert.deepEqual(getDefaultScheduleDays(), [1, 2, 3, 4, 5])
})

test('toInputTimeValue trims postgres seconds', () => {
  assert.equal(toInputTimeValue('09:30:00'), '09:30')
  assert.equal(toInputTimeValue('18:45'), '18:45')
  assert.equal(toInputTimeValue(null), '')
})

test('formatScheduleDays formats short and full day labels', () => {
  assert.equal(formatScheduleDays([1, 3, 5], true), 'Пн, Ср, Пт')
  assert.equal(formatScheduleDays([1, 2, 3, 4, 5, 6, 7]), 'Всеки ден')
})

test('getCurrentScheduleWindow returns active window for matching day and time', () => {
  const now = new Date(2026, 4, 4, 10, 30) // Monday
  const schedule = {
    days_of_week: [1, 3, 5],
    open_time: '09:00:00',
    close_time: '18:00:00',
    is_active: true,
  }

  const window = getCurrentScheduleWindow(schedule, now)

  assert.ok(window)
  assert.equal(window.start.getHours(), 9)
  assert.equal(window.start.getMinutes(), 0)
  assert.equal(window.end.getHours(), 18)
  assert.equal(window.end.getMinutes(), 0)
})

test('getCurrentScheduleWindow returns null outside the configured time window', () => {
  const now = new Date(2026, 4, 4, 20, 0) // Monday
  const schedule = {
    days_of_week: [1],
    open_time: '09:00:00',
    close_time: '18:00:00',
    is_active: true,
  }

  assert.equal(getCurrentScheduleWindow(schedule, now), null)
})

test('getNextScheduleWindow finds the next future matching day', () => {
  const now = new Date(2026, 4, 4, 19, 0) // Monday after the window
  const schedule = {
    days_of_week: [1, 3],
    open_time: '09:00:00',
    close_time: '18:00:00',
    is_active: true,
  }

  const window = getNextScheduleWindow(schedule, now)

  assert.ok(window)
  assert.equal(window.start.getDay(), 3) // Wednesday
  assert.equal(window.start.getHours(), 9)
  assert.equal(window.end.getHours(), 18)
})

test('getScheduleState distinguishes active upcoming and inactive schedules', () => {
  const activeNow = new Date(2026, 4, 4, 10, 0) // Monday
  const upcomingNow = new Date(2026, 4, 4, 7, 0)
  const inactiveNow = new Date(2026, 4, 4, 10, 0)

  const schedule = {
    days_of_week: [1],
    open_time: '09:00:00',
    close_time: '18:00:00',
    is_active: true,
  }

  assert.equal(getScheduleState(schedule, activeNow), 'active')
  assert.equal(getScheduleState(schedule, upcomingNow), 'upcoming')
  assert.equal(getScheduleState({ ...schedule, is_active: false }, inactiveNow), 'inactive')
})

test('overlapsSchedule only returns true for overlapping time on shared days', () => {
  const current = {
    days_of_week: [1, 3],
    open_time: '10:00:00',
    close_time: '14:00:00',
    is_active: true,
  }

  assert.equal(overlapsSchedule([3], '13:00', '15:00', current), true)
  assert.equal(overlapsSchedule([2], '13:00', '15:00', current), false)
  assert.equal(overlapsSchedule([1], '14:00', '16:00', current), false)
})

test('formatCountdown formats hour and minute countdowns', () => {
  const originalNow = Date.now
  const baseNow = Date.UTC(2026, 4, 4, 9, 0, 0)

  Date.now = () => baseNow

  try {
    assert.equal(formatCountdown(baseNow + 20 * 60_000), 'След 20 мин')
    assert.equal(formatCountdown(baseNow + 2 * 60 * 60_000), 'След 2 ч')
    assert.equal(formatCountdown(baseNow + 125 * 60_000), 'След 2 ч 05 мин')
  } finally {
    Date.now = originalNow
  }
})
