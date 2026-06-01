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
  unlockDurationMs: 30000,
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

const pendingEnrollments = new Map()

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

  if (!door && kind !== 'heartbeat' && kind !== 'enroll/result') {
    log.warn(`Неизвестно устройство: ${deviceId}`)
    return
  }

  switch (kind) {
    case 'heartbeat':
      if (door) {
        const { error: hbErr } = await supabase.from('doors')
          .update({ last_heartbeat: new Date().toISOString() })
          .eq('id', door.id)
        if (hbErr) log.err(`Heartbeat update error for ${door.name}: ${hbErr.message}`)
      }
      break

    case 'status': {
      if (!door) { log.warn(`status without door for ${deviceId}`); break }
      const { error: statusErr } = await supabase.from('doors').update({
        status: payload.status,
        is_locked: typeof payload.is_locked === 'boolean' ? payload.is_locked : undefined,
        last_opened_at: payload.status === 'open' ? new Date().toISOString() : undefined,
      }).eq('id', door.id)
      if (statusErr) log.err(`status update error for ${door.name}: ${statusErr.message}`)
      else log.info(`status: ${payload.status} -> ${door.name}`)
      break
    }

    case 'access_attempt':
      if (!door) { log.warn(`access_attempt without door for ${deviceId}`); break }
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

async function consumePendingEnrollment(door, p) {
  const enrollment = pendingEnrollments.get(door.id)
  if (!enrollment) return false
  if (Date.now() > enrollment.expiresAt) {
    pendingEnrollments.delete(door.id)
    return false
  }
  if (enrollment.type !== p.method) return false

  const update = enrollment.type === 'nfc'
    ? { nfc_uid: p.value }
    : { fingerprint_ref: p.value }
  const { error } = await supabase.from('users').update(update).eq('id', enrollment.userId)
  if (error) {
    log.err(`Enrollment fallback update failed (${enrollment.type}): ${error.message}`)
    return false
  }

  pendingEnrollments.delete(door.id)
  await supabase.from('device_commands').update({
    status: 'executed',
    executed_at: new Date().toISOString(),
    result: { enrolled: enrollment.type, value: p.value },
  }).eq('id', enrollment.commandId)
  await publishCommand(door.device_id, 'message', {
    title: 'DONE',
    message: enrollment.type === 'nfc' ? 'Card saved' : 'Finger saved',
    duration_ms: 1500,
  })
  log.ok(`Enrollment fallback: ${enrollment.type} ${p.value} -> user ${enrollment.userId}`)
  return true
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

// Транслитерация: кирилица → латиница за OLED показване
// (Adafruit SSD1306 поддържа само ASCII без специална библиотека)
const CYR_TO_LAT = {
  'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ж':'zh','з':'z',
  'и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p',
  'р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'ts','ч':'ch',
  'ш':'sh','щ':'sht','ъ':'a','ь':'y','ю':'yu','я':'ya',
  'А':'A','Б':'B','В':'V','Г':'G','Д':'D','Е':'E','Ж':'Zh','З':'Z',
  'И':'I','Й':'Y','К':'K','Л':'L','М':'M','Н':'N','О':'O','П':'P',
  'Р':'R','С':'S','Т':'T','У':'U','Ф':'F','Х':'H','Ц':'Ts','Ч':'Ch',
  'Ш':'Sh','Щ':'Sht','Ъ':'A','Ь':'Y','Ю':'Yu','Я':'Ya',
}

function toLatin(text) {
  if (!text) return text
  return String(text).split('').map(ch => CYR_TO_LAT[ch] !== undefined ? CYR_TO_LAT[ch] : ch).join('')
}

async function handleAccessAttempt(door, p) {
  if (await consumePendingEnrollment(door, p)) return

  if (door.is_locked) {
    await logAccess(null, door.id, p.method, 'denied')
    await reply(door, false, 'Emergency lock active')
    return
  }
  if (isInMaintenance(door)) {
    await logAccess(null, door.id, p.method, 'denied')
    await reply(door, false, 'Maintenance mode')
    return
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
    await reply(door, false, 'Unknown user')
    return
  }
  if (user.is_blacklisted || user.status !== 'active') {
    await logAccess(user.id, door.id, p.method, 'denied')
    await bumpFailed(door.id)
    await reply(door, false, 'Access denied')
    return
  }

  await logAccess(user.id, door.id, p.method, 'granted')
  const { error: resetErr } = await supabase.from('doors').update({ failed_attempts: 0 }).eq('id', door.id)
  if (resetErr) log.err(`Failed to reset failed_attempts for ${door.name}: ${resetErr.message}`)

  // Обновяваме doors.status директно (оптимистично), точно както прави RPC-то
  const { error: openErr } = await supabase.from('doors')
    .update({ status: 'open', last_opened_at: new Date().toISOString() })
    .eq('id', door.id)
  if (openErr) log.err(`Failed to set door open status for ${door.name}: ${openErr.message}`)
  else log.info(`status: open -> ${door.name}`)

  // Транслитерираме името от кирилица в латиница за OLED
  const latinName = toLatin(`${user.first_name} ${user.last_name}`)
  await reply(door, true, latinName)
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
const statusCloseTimers = new Map()

function scheduleAutoClose(door) {
  if (!door.auto_close_enabled) return
  const minutes = Math.max(1, door.open_warning_minutes || 5)
  const prev = autoCloseTimers.get(door.id)
  if (prev) clearTimeout(prev)
  const t = setTimeout(async () => {
    log.warn(`Auto-close: ${door.name} (${minutes}min изтекоха)`)
    await publishCommand(door.device_id, 'relock', {})
    await supabase.from('doors').update({ status: 'closed' }).eq('id', door.id)
    await supabase.from('audit_logs').insert({
      action: 'auto_close', details: { door_id: door.id, after_minutes: minutes }
    })
    autoCloseTimers.delete(door.id)
  }, minutes * 60 * 1000)
  autoCloseTimers.set(door.id, t)
  log.info(`Auto-close armed: ${door.name} след ${minutes} мин.`)
}

// Когато ESP32 firmware-ът не публикува status обратно, bridge сам обновява
// doors.status='open' веднага и schedule-ва 'closed' след duration_ms.
async function markDoorOpenAndScheduleClose(door, durationMs) {
  const prev = statusCloseTimers.get(door.id)
  if (prev) clearTimeout(prev)
  const t = setTimeout(async () => {
    const { error } = await supabase.from('doors').update({ status: 'closed' }).eq('id', door.id)
    if (error) log.err(`Auto-close timer error for ${door.name}: ${error.message}`)
    else log.info(`status: closed -> ${door.name} (auto след ${durationMs}ms)`)
    statusCloseTimers.delete(door.id)
  }, durationMs)
  statusCloseTimers.set(door.id, t)
}

async function reply(door, granted, message) {
  await publishCommand(door.device_id || 'unknown', granted ? 'unlock' : 'deny', {
    duration_ms: cfg.unlockDurationMs,
    message,
  })
  if (granted) {
    scheduleAutoClose(door)
    await markDoorOpenAndScheduleClose(door, cfg.unlockDurationMs)
  }
  log.info(`-> ${granted ? 'GRANT' : 'DENY '} ${door.name}: ${message}`)
}

function publishCommand(deviceId, command, payload = {}) {
  const topic = `accessguard/door/${deviceId}/command`
  // Транслитерираме message полето (ако съдържа кирилица) преди да го пратим към ESP32 OLED
  const safePayload = { ...payload }
  if (typeof safePayload.message === 'string') safePayload.message = toLatin(safePayload.message)
  const msg = JSON.stringify({ command, ...safePayload, ts: Date.now() })
  return new Promise((resolve) => {
    client.publish(topic, msg, { qos: 1 }, (error) => {
      if (error) {
        log.err(`MQTT publish failed for ${command} -> ${deviceId}: ${error.message}`)
        resolve({ ok: false, error })
        return
      }
      log.info(`-> ${command.padEnd(18)} ${deviceId} :: ${msg}`)
      resolve({ ok: true })
    })
  })
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

  const publishResult = await publishCommand(door.device_id, row.command, row.payload || {})
  if (!publishResult.ok) {
    await supabase.from('device_commands').update({
      status: 'failed',
      result: { error: publishResult.error?.message || 'mqtt_publish_failed' },
    }).eq('id', row.id)
    return
  }

  if (row.command === 'enroll_nfc' || row.command === 'enroll_fingerprint') {
    const type = row.command === 'enroll_nfc' ? 'nfc' : 'fingerprint'
    const timeoutMs = Math.max(10000, Number(row.payload?.timeout_ms || 30000))
    pendingEnrollments.set(row.door_id, {
      type,
      userId: row.payload?.user_id,
      commandId: row.id,
      expiresAt: Date.now() + timeoutMs + 5000,
    })
    log.info(`Enrollment armed: ${type} for user ${row.payload?.user_id}`)
  }

  // За аварийно заключване/отключване обновяваме doors директно (fallback ако frontend не го е направил)
  if (row.command === 'emergency_lock' || row.command === 'emergency_unlock') {
    const { error: emErr } = await supabase.from('doors').update({
      is_locked: row.command === 'emergency_lock',
      status: 'closed',
    }).eq('id', row.door_id)
    if (emErr) log.err(`Emergency lock DB update error: ${emErr.message}`)
    else log.info(`Emergency ${row.command === 'emergency_lock' ? 'lock' : 'unlock'} -> ${door.name}`)
  }

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
