# AccessGuard Bridge

Node.js услуга, която свързва React уеб приложението със Supabase от една страна, и ESP32 устройствата с MQTT от друга.

## Какво прави bridge-ът

```
React app ──► Supabase (device_commands table)
                    │
                    │ Realtime subscription
                    ▼
              Bridge (node bridge.js)
                    │
                    │ MQTT publish
                    ▼
              HiveMQ Cloud broker
                    │
                    │ MQTT (TLS)
                    ▼
              ESP32 устройство
```

И обратно: ESP32 публикува access_attempt / heartbeat / status, bridge ги превежда в записи в Supabase, които React app-ът вижда през Realtime.

## Инсталиране

```bash
cd bridge
npm install
cp .env.example .env
# Отвори .env и попълни MQTT и Supabase credentials
```

## Стартиране

Преди демонстрация пред комисията:

```bash
node bridge.js
```

Или с auto-reload докато разработваш:

```bash
npm run dev
```

Очакваш да видиш:

```
[2026-04-30 10:15:02] Bridge стартиран. Очакване на събития...
[2026-04-30 10:15:02] Свързване към MQTT broker: mqtts://xxxxx.s1.eu.hivemq.cloud:8883
[2026-04-30 10:15:03] ✅ MQTT свързан
[2026-04-30 10:15:03] Абониран на: access_attempt, status, heartbeat, enroll/result
[2026-04-30 10:15:03] ✅ Realtime: device_commands
```

## Тест на цялата верига (Етап 2)

1. **Изпълни SQL миграцията** от `sql/01_hardware_integration.sql` в Supabase SQL Editor
2. **Задай device_id на твоята врата:**
   ```sql
   update doors set device_id = 'esp32-door-01' where id = '<твоето-id>';
   ```
3. **Регистрирай се в HiveMQ Cloud** (виж `SETUP_HIVEMQ.md`)
4. **Попълни `bridge/.env`** с MQTT credentials
5. **Стартирай bridge:** `node bridge.js`
6. **Flash-ни ESP32-ката** (виж `firmware/accessguard_esp32/`)
7. **Отвори Admin → Врата таб** в React приложението
8. **Натисни „Тест LED (2s)"** → LED-ът на ESP32 трябва да светне за 2 секунди

В терминала на bridge-а ще видиш:

```
[2026-04-30 10:20:14] ◀ нова команда: test_led
[2026-04-30 10:20:14] ▶ test_led            esp32-door-01 :: {"command":"test_led","duration_ms":2000,"ts":1714468814123}
```

В Serial Monitor-а на Arduino IDE:

```
◀ accessguard/door/esp32-door-01/command :: {"command":"test_led","duration_ms":2000,...}
→ test_led за 2000 ms
▶ status: open (locked=0)
```

## Дебъгване

**„MQTT грешка: Connection refused"** — провери host/port в .env, провери дали HiveMQ кластерът ти е „Running" (не paused)

**„Realtime: device_commands" не се появява** — провери че SQL миграцията е изпълнена с `alter publication supabase_realtime add table public.device_commands;`

**Натискам Тест LED, но bridge не вижда нищо** — провери че `door.device_id` е задание в Supabase. Без device_id командата отива в `failed` статус.

**ESP32 свързва WiFi, но MQTT не** — повечето учищни/публични мрежи блокират порт 8883. Тествай от мобилен hotspot.

## Структура

```
bridge/
├── bridge.js          ← главният файл
├── package.json
├── .env.example       ← шаблон (commit-ва се)
├── .env               ← реални credentials (НЕ се commit-ва)
└── README.md
```

## Следващи етапи

Bridge-ът вече е готов да обработва access_attempt, heartbeat, status. На следващите етапи (4–6) ще активираме реалната валидация на PIN/NFC/fingerprint без промяна на bridge-а — само ESP32 firmware-ът ще се разширява.
