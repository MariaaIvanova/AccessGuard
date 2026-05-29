import test from 'node:test'
import assert from 'node:assert/strict'

import { getRequestResponseMap } from '../src/requestUtils.js'

test('getRequestResponseMap returns empty object for non-array input', () => {
  assert.deepEqual(getRequestResponseMap(null), {})
  assert.deepEqual(getRequestResponseMap(undefined), {})
  assert.deepEqual(getRequestResponseMap({}), {})
})

test('getRequestResponseMap builds response entries keyed by request id', () => {
  const auditLogs = [
    {
      details: { request_id: 'req-1', response: 'Прието е.' },
      timestamp: '2026-05-04T09:00:00.000Z',
      admin: { first_name: 'Мария', last_name: 'Иванова' },
      action: 'request_approved',
    },
  ]

  assert.deepEqual(getRequestResponseMap(auditLogs), {
    'req-1': {
      response: 'Прието е.',
      timestamp: '2026-05-04T09:00:00.000Z',
      adminName: 'Мария Иванова',
      action: 'request_approved',
    },
  })
})

test('getRequestResponseMap falls back to users relation and ignores duplicates', () => {
  const auditLogs = [
    {
      details: { request_id: 'req-2', response: 'Първи отговор' },
      timestamp: '2026-05-04T10:00:00.000Z',
      users: { first_name: 'Admin', last_name: 'User' },
      action: 'request_rejected',
    },
    {
      details: { request_id: 'req-2', response: 'Втори отговор' },
      timestamp: '2026-05-04T11:00:00.000Z',
      admin: { first_name: 'Друг', last_name: 'Админ' },
      action: 'request_approved',
    },
  ]

  assert.deepEqual(getRequestResponseMap(auditLogs), {
    'req-2': {
      response: 'Първи отговор',
      timestamp: '2026-05-04T10:00:00.000Z',
      adminName: 'Admin User',
      action: 'request_rejected',
    },
  })
})

test('getRequestResponseMap skips logs without request ids and defaults missing values', () => {
  const auditLogs = [
    {
      details: {},
      timestamp: '2026-05-04T10:00:00.000Z',
      admin: { first_name: 'No', last_name: 'Id' },
      action: 'noop',
    },
    {
      details: { request_id: 'req-3' },
      timestamp: null,
      admin: { first_name: 'Solo', last_name: '' },
      action: 'request_approved',
    },
  ]

  assert.deepEqual(getRequestResponseMap(auditLogs), {
    'req-3': {
      response: '',
      timestamp: null,
      adminName: 'Solo',
      action: 'request_approved',
    },
  })
})
