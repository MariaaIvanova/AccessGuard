/*
 * AccessGuard Bridge
 *
 * Свързва уеб приложението със Supabase и физическите ESP32 контролери чрез MQTT.
 *  - Слуша Supabase Realtime за нови команди в device_commands и ги публикува по MQTT.
 *  - Получава MQTT съобщения от ESP32 (access_attempt, status, heartbeat, enroll/result)
 *    и ги превръща в записи в access_logs / users / doors.
 *  - Изпълнява валидация на достъп срещу users таблицата за всеки опит за вход.
 */

import 'dotenv/config'
import mqtt from 'mqtt'
import { createClient } from '@supabase/supabase-js'

const cfg = {
  mqtt: {
    host: process.env.MQTT_HOST,
    port: Number(process.env.MQTT_PORT || 8883),
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
  },
  supabase: {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY,
  },
  pollMs: Number(process.env.COMMAND_POLL_FALLBACK_MS || 5000),
  unlockDurationMs: 3000,
}

if (!cfg.mqtt.host || !cfg.mqtt.username || !cfg.mqtt.password) {
  console.error('MQTT credentials missing. Провери .env файла.')
  process.exit(1)
}
if (!cfg.supabase.url || !cfg.supabase.key) {
  console.error('Supabase credentials missing. Провери .env файла.')
  process.exit(1)
}

const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19)
const log = {
  info: (...a) => console.log(`[${ts()}]`, ...a),
  warn: (...a) => console.warn(`[${ts()}] [WARN]`, ...a),
  err:  (...a) => console.error(`[${ts()}] [ERR]`, ...a),
  ok:   (...a) => console.log(`[${ts()}] [OK]`, ...a),
}

const supabase = createClient(cfg.supabase.url, cfg.supabase.key, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const mqttUrl = `mqtts://${cfg.mqtt.host}:${cfg.mqtt.port}`
log.info(`Свързване към MQTT broker: ${mqttUrl}`)

const client = mqtt.connect(mqttUrl, {
  username: cfg.mqtt.username,
  password: cfg.mqtt.password,
  reconnectPeriod: 5000,
  clientId: 'accessguard-bridge-' + Math.random().toString(16).slice(2, 8),
  rejectUnauthorized: true,
})

client.on('connect', () => {
  log.ok('MQTT свързан')
  client.subscribe('accessguard/door/+/access_attempt', { qos: 1 })
  client.subscribe('accessguard/door/+/status',         { qos: 1 })
  client.subscribe('accessguard/door/+/heartbeat',      { qos: 0 })
  client.subscribe('accessguard/door/+/enroll/result',  { qos: 1 })
  log.info('Абониран на: access_attempt, status, heartbeat, enroll/result')
})

client.on('reconnect', () => log.warn('MQTT преподключение'))
client.on('error',     (e) => log.err('MQTT грешка:', e.message))
client.on('close',     ()  => log.warn('MQTT връзка затворена'))

client.on('message', async (topic, buf) => {
  let payload
  try { payload = JSON.parse(buf.toString()) } catch {
    log.warn(`Невалиден JSON на ${topic}: ${buf.toString().slice(0, 80)}`)
    return
  }
  const parts = topic.split('/')
  const deviceId = parts[2]
  const kind     = parts.slice(3).join('/')

  log.info(`<- ${kind.padEnd(18)} ${deviceId} :: ${JSON.stringify(payload)}`)

  const { data: door } = await supabase
    .from('doors')
    .select('id, name, is_locked, device_id, maintenance_enabled, maintenance_start, maintenance_end, auto_close_enabled, open_warning_minutes')
    .eq('device_id', deviceId)
    .maybeSingle()

  if (!door && kind !== 'heartbeat') {
    log.warn(`Неизвестно устройство: ${deviceId}`)
    return
  }

  switch (kind) {
    case 'heartbeat':
      if (door) {
        await supabase.from('doors')
          .update({ last_heartbeat: new Date().toISOString() })
          .eq('id', door.id)
      }
      break

    case 'status':
      await supabase.from('doors').update({
        status: payload.status,
        is_locked: typeof payload.is_locked === 'boolean' ? payload.is_locked : undefined,
        last_opened_at: payload.status === 'open' ? new Date().toISOString() : undefined,
      }).eq('id', door.id)
      break

    case 'access_attempt':
      await handleAccessAttempt(door, payload)
      break

    case 'enroll/result':
      await handleEnrollResult(payload)
      break

    case 'enroll/progress':
      log.info(`Enroll progress: ${JSON.stringify(payload)}`)
      break
  }
})

async function handleEnrollResult(p) {
  if (!p.user_id) {
    log.warn('enroll/result без user_id — игнорирано')
    return
  }
  if (!p.success) {
    log.warn(`Enroll неуспех (${p.type}) за user ${p.user_id}: ${p.error || 'unknown'}`)
    return
  }
  if (p.type === 'nfc') {
    const { error } = await supabase.from('users')
      .update({ nfc_uid: p.value }).eq('id', p.user_id)
    if (error) log.err(`Грешка при запис на nfc_uid: ${error.message}`)
    else log.ok(`NFC UID ${p.value} -> user ${p.user_id}`)
  } else if (p.type === 'fingerprint') {
    const { error } = await supabase.from('users')
      .update({ fingerprint_ref: p.value }).eq('id', p.user_id)
    if (error) log.err(`Грешка при запис на fingerprint_ref: ${error.message}`)
    else log.ok(`Fingerprint slot ${p.value} -> user ${p.user_id}`)
  }
}

function isInMaintenance(door) {
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
}

async function handleAccessAttempt(door, p) {
  if (door.is_locked) {
    await logAccess(null, door.id, p.method, 'denied')
    return reply(door, false, 'Аварийно заключване активно')
  }
  if (isInMaintenance(door)) {
    await logAccess(null, door.id, p.method, 'denied')
    return reply(door, false, 'Режим на поддръжка')
  }

  let user = null
  const baseSelect = 'id, first_name, last_name, status, is_blacklisted'

  if (p.method === 'nfc') {
    const { data } = await supabase.from('users').select(baseSelect).eq('nfc_uid', p.value).maybeSingle()
    user = data
  } else if (p.method === 'pin') {
    const { data } = await supabase.from('users').select(baseSelect).eq('pin_hash', p.value).maybeSingle()
    user = data
  } else if (p.method === 'fingerprint') {
    const { data } = await supabase.from('users').select(baseSelect).eq('fingerprint_ref', p.value).maybeSingle()
    user = data
  }

  if (!user) {
    await logAccess(null, door.id, p.method, 'denied')
    await bumpFailed(door.id)
    return reply(door, false, 'Непознат потребител')
  }
  if (user.is_blacklisted || user.status !== 'active') {
    await logAccess(user.id, door.id, p.method, 'denied')
    await bumpFailed(door.id)
    return reply(door, false, 'Достъпът е отказан')
  }

  await logAccess(user.id, door.id, p.method, 'granted')
  await supabase.from('doors').update({ failed_attempts: 0 }).eq('id', door.id)
  return reply(door, true, `${user.first_name} ${user.last_name}`)
}

async function logAccess(userId, doorId, method, result) {
  await supabase.from('access_logs').insert({
    user_id: userId, door_id: doorId, method, result, direction: 'in',
  })
}

async function bumpFailed(doorId) {
  const { data: d } = await supabase.from('doors').select('failed_attempts').eq('id', doorId).single()
  await supabase.from('doors').update({ failed_attempts: (d?.failed_attempts || 0) + 1 }).eq('id', doorId)
}

const autoCloseTimers = new Map()

function scheduleAutoClose(door) {
  if (!door.auto_close_enabled) return
  const minutes = Math.max(1, door.open_warning_minutes || 5)
  const prev = autoCloseTimers.get(door.id)
  if (prev) clearTimeout(prev)
  const t = setTimeout(async () => {
    log.warn(`Auto-close: ${door.name} (${minutes}min изтекоха)`)
    publishCommand(door.device_id, 'relock', {})
    await supabase.from('doors').update({ status: 'closed' }).eq('id', door.id)
    await supabase.from('audit_logs').insert({
      action: 'auto_close', details: { door_id: door.id, after_minutes: minutes }
    })
    autoCloseTimers.delete(door.id)
  }, minutes * 60 * 1000)
  autoCloseTimers.set(door.id, t)
  log.info(`Auto-close armed: ${door.name} след ${minutes} мин.`)
}

function reply(door, granted, message) {
  publishCommand(door.device_id || 'unknown', granted ? 'unlock' : 'deny', {
    duration_ms: cfg.unlockDurationMs,
    message,
  })
  if (granted) scheduleAutoClose(door)
  log.info(`-> ${granted ? 'GRANT' : 'DENY '} ${door.name}: ${message}`)
}

function publishCommand(deviceId, command, payload = {}) {
  const topic = `accessguard/door/${deviceId}/command`
  const msg = JSON.stringify({ command, ...payload, ts: Date.now() })
  client.publish(topic, msg, { qos: 1 })
  log.info(`-> ${command.padEnd(18)} ${deviceId} :: ${msg}`)
}

async function processCommand(row) {
  const { data: door } = await supabase
    .from('doors').select('device_id, name').eq('id', row.door_id).maybeSingle()

  if (!door?.device_id) {
    await supabase.from('device_commands')
      .update({ status: 'failed', result: { error: 'no device_id' } })
      .eq('id', row.id)
    return log.warn(`Команда ${row.command} -> няма device_id за врата ${row.door_id}`)
  }

  publishCommand(door.device_id, row.command, row.payload || {})

  await supabase.from('device_commands').update({
    status: 'sent', sent_at: new Date().toISOString(),
  }).eq('id', row.id)
}

const cmdChannel = supabase.channel('device-commands-bridge')
  .on('postgres_changes', {
    event: 'INSERT', schema: 'public', table: 'device_commands',
    filter: 'status=eq.pending',
  }, async (msg) => {
    log.info(`<- нова команда: ${msg.new.command}`)
    await processCommand(msg.new)
  })
  .subscribe((status) => {
    if (status === 'SUBSCRIBED') log.ok('Realtime: device_commands')
  })

setInterval(async () => {
  const { data: pending } = await supabase
    .from('device_commands').select('*')
    .eq('status', 'pending')
    .lt('created_at', new Date(Date.now() - 2000).toISOString())
    .limit(10)

  for (const row of pending || []) {
    log.warn(`Polling fallback подхваща команда ${row.id}`)
    await processCommand(row)
  }
}, cfg.pollMs)

process.on('SIGINT', () => {
  log.info('Спиране...')
  client.end()
  process.exit(0)
})

log.info('Bridge стартиран. Очакване на събития.')
