# AccessGuard — MQTT протокол

Документ за разработчиците. Описва точния формат на всички MQTT съобщения между ESP32, bridge-а и Supabase.

## Адресиране

Всеки топик започва с:

```
accessguard/door/{device_id}/...
```

`{device_id}` = стойността на `doors.device_id` (напр. `esp32-door-01`). ESP32 чете тази стойност от `secrets.h`. Bridge-ът разпознава кое устройство публикува по този идентификатор.

## Топици — обзорна таблица

| Топик                                     | Посока       | QoS | Retained | Кога                                      |
|--------------------------------------------|--------------|-----|----------|-------------------------------------------|
| `accessguard/door/{id}/heartbeat`         | ESP32 → bridge | 0 | не       | На всеки 30s — устройството е живо        |
| `accessguard/door/{id}/status`            | ESP32 → bridge | 1 | да       | При отваряне/затваряне на врата           |
| `accessguard/door/{id}/access_attempt`    | ESP32 → bridge | 1 | не       | При въведен PIN / NFC / отпечатък         |
| `accessguard/door/{id}/command`           | bridge → ESP32 | 1 | не       | Web app иска нещо (отвори, заключи, регистрирай) |
| `accessguard/door/{id}/enroll/progress`   | ESP32 → bridge | 0 | не       | Стъпки на enrollment процедурата          |
| `accessguard/door/{id}/enroll/result`     | ESP32 → bridge | 1 | не       | Резултат от enrollment (нов NFC/FP)       |

## Подробни payload формати

Всички съобщения са JSON. ESP32 ползва `ArduinoJson` за serialization.

---

### 1. `heartbeat` (ESP32 → bridge)

ESP32 публикува на всеки 30 секунди, за да съобщи че е жив.

```json
{
  "uptime_s": 12345,
  "rssi": -58,
  "fw": "stage6-full"
}
```

| Поле       | Тип    | Описание                                |
|-------------|--------|------------------------------------------|
| `uptime_s` | number | Секунди от стартирането на устройството |
| `rssi`     | number | WiFi сила на сигнала (-100 до 0)        |
| `fw`       | string | Версия на firmware-а                    |

**Какво прави bridge:** обновява `doors.last_heartbeat = now()`. React app-ът показва „Онлайн" ако последният heartbeat е < 90 секунди.

---

### 2. `status` (ESP32 → bridge)

ESP32 публикува при всяка промяна на състоянието на вратата.

```json
{
  "status": "open",
  "is_locked": false
}
```

| Поле        | Тип     | Стойности              | Описание                   |
|--------------|---------|------------------------|------------------------------|
| `status`    | string  | `"open"` \| `"closed"` | Физическо състояние         |
| `is_locked` | boolean | true / false           | Заключена ли е аварийно     |

Това съобщение е **retained** — ако bridge се рестартира, последното състояние е достъпно веднага.

**Какво прави bridge:** `doors.status = ...`, при `open` слага и `last_opened_at = now()`.

---

### 3. `access_attempt` (ESP32 → bridge) — **най-важният топик**

ESP32 публикува, когато потребителят се опита да влезе с PIN, NFC карта или отпечатък.

#### 3a. PIN опит

```json
{
  "method": "pin",
  "value": "1234"
}
```

#### 3b. NFC опит

```json
{
  "method": "nfc",
  "value": "04A1B2C3D4"
}
```

`value` е UID-то на картата, представено като hex стринг с главни букви, без разделители. RC522 връща 4-7 байта в зависимост от типа карта (MIFARE Classic = 4, MIFARE DESFire = 7).

#### 3c. Fingerprint опит

```json
{
  "method": "fingerprint",
  "value": "5"
}
```

`value` е номерът на слота в AS608 сензора, в който е намерен match (1-127). Това е стрингът, който се записва в `users.fingerprint_ref`.

| Поле       | Тип    | Стойности                                  |
|-------------|--------|---------------------------------------------|
| `method`   | string | `"pin"` \| `"nfc"` \| `"fingerprint"`      |
| `value`    | string | Виж примерите по-горе                       |

**Какво прави bridge (вижте `bridge/bridge.js → handleAccessAttempt`):**

1. Проверява `doors.is_locked` — ако е true, отказва веднага
2. Прави SELECT в `users` спрямо метода:
   - `pin` → `users.pin_hash = value`
   - `nfc` → `users.nfc_uid = value`
   - `fingerprint` → `users.fingerprint_ref = value`
3. Проверява `users.status === 'active'` и `users.is_blacklisted === false`
4. Записва ред в `access_logs` с `result = 'granted'` или `'denied'`
5. При успех — нулира `doors.failed_attempts`, при неуспех — увеличава с 1
6. Изпраща `command` обратно на ESP32 (виж по-долу)

---

### 4. `command` (bridge → ESP32)

Bridge изпраща команда на ESP32. Идва от 2 източника:
- автоматичен отговор на `access_attempt`
- ред в `device_commands` таблицата (натиснат бутон в Admin → Врата)

#### 4a. Unlock — отвори вратата

```json
{
  "command": "unlock",
  "duration_ms": 3000,
  "message": "Мария Иванова",
  "ts": 1714468814123
}
```

ESP32: активира релето, показва съобщението на OLED, чака `duration_ms`, заключва.

#### 4b. Deny — откажи

```json
{
  "command": "deny",
  "message": "Непознат потребител",
  "ts": 1714468814123
}
```

ESP32: червено мигане, показва съобщението на OLED.

#### 4c. Relock — нормално затваряне

```json
{
  "command": "relock"
}
```

ESP32: реле = изключено, временното отключване се прекратява, вратата се връща в нормално затворено състояние.

#### 4d. Emergency Lock — аварийно заключване

```json
{
  "command": "emergency_lock"
}
```

ESP32: реле = заключено, `is_locked = true`, OLED показва „АВАРИЙНО ЗАКЛЮЧЕНО".

#### 4e. Emergency Unlock — изход от аварийния режим

```json
{
  "command": "emergency_unlock"
}
```

ESP32: `is_locked = false`, релето остава затворено в нормален режим и контролерът отново приема `unlock`.

#### 4f. Test LED

```json
{
  "command": "test_led",
  "duration_ms": 2000
}
```

Само за тестване. Светва вградения LED.

#### 4g. Enroll NFC

```json
{
  "command": "enroll_nfc",
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "timeout_ms": 15000
}
```

ESP32 влиза в режим „Сложи карта" за `timeout_ms` милисекунди. Прочита UID-то на първата карта и публикува резултата на `enroll/result` (виж 6).

#### 4h. Enroll Fingerprint

```json
{
  "command": "enroll_fingerprint",
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "slot": 5,
  "timeout_ms": 30000
}
```

ESP32 води потребителя през 2-стъпковата AS608 enrollment процедура (сложи пръст → махни → сложи пак). Записва в указания slot. Публикува резултата на `enroll/result`.

#### 4i. Reboot

```json
{
  "command": "reboot"
}
```

ESP32: `ESP.restart()`.

| Команда                | Изисквани полета             |
|-------------------------|------------------------------|
| `unlock`               | `duration_ms`, `message`     |
| `deny`                 | `message`                    |
| `relock`               | —                            |
| `emergency_lock`       | —                            |
| `emergency_unlock`     | —                            |
| `test_led`             | `duration_ms`                |
| `enroll_nfc`           | `user_id`, `timeout_ms`      |
| `enroll_fingerprint`   | `user_id`, `slot`, `timeout_ms` |
| `reboot`               | —                            |

---

### 5. `enroll/progress` (ESP32 → bridge)

Опционално — ESP32 публикува междинни стъпки на enrollment процедурата, за да може web app-ът да показва прогрес.

```json
{
  "type": "fingerprint",
  "step": "place_finger_first",
  "user_id": "..."
}
```

| `step`                        | Значение                              |
|--------------------------------|---------------------------------------|
| `waiting_for_card`            | NFC enrollment — очаква карта         |
| `place_finger_first`          | FP — сложи пръст за първи път         |
| `remove_finger`               | FP — махни пръста                     |
| `place_finger_second`         | FP — сложи пръст пак                  |

---

### 6. `enroll/result` (ESP32 → bridge)

ESP32 публикува след завършване на enrollment.

#### Успешен NFC enrollment

```json
{
  "type": "nfc",
  "success": true,
  "value": "04A1B2C3D4",
  "user_id": "550e8400-..."
}
```

#### Успешен fingerprint enrollment

```json
{
  "type": "fingerprint",
  "success": true,
  "value": "5",
  "user_id": "550e8400-..."
}
```

#### Неуспех (timeout, грешка)

```json
{
  "type": "fingerprint",
  "success": false,
  "error": "timeout",
  "user_id": "550e8400-..."
}
```

**Какво прави bridge:**
- При `success=true, type=nfc` → `UPDATE users SET nfc_uid=value WHERE id=user_id`
- При `success=true, type=fingerprint` → `UPDATE users SET fingerprint_ref=value WHERE id=user_id`
- При `success=false` → не обновява нищо, само логва

---

## Пълен flow — пример с PIN

```
1. Потребител пише 1234# на keypad-а
2. ESP32 публикува:
   Topic: accessguard/door/esp32-door-01/access_attempt
   Body:  {"method":"pin","value":"1234"}

3. Bridge получава съобщението, прави:
   SELECT * FROM users WHERE pin_hash = '1234' AND status = 'active' AND is_blacklisted = false
   → намира "Мария Иванова"

4. Bridge записва:
   INSERT INTO access_logs (user_id, door_id, method, result, direction)
   VALUES ('uuid-of-maria', 'door-uuid', 'pin', 'granted', 'in')

5. Bridge публикува:
   Topic: accessguard/door/esp32-door-01/command
   Body:  {"command":"unlock","duration_ms":3000,"message":"Мария Иванова"}

6. ESP32 получава, активира релето, OLED показва „Здравей, Мария Иванова"

7. ESP32 публикува:
   Topic: accessguard/door/esp32-door-01/status
   Body:  {"status":"open","is_locked":false}

8. Supabase Realtime праща:
   - INSERT в access_logs → History страницата автоматично го добавя
   - UPDATE на doors → Dashboard показва „Отворена"

9. След 3 секунди — ESP32 заключва, OLED връща „СЛОЖЕТЕ КАРТА / ПИН"
   и публикува:
   Topic: accessguard/door/esp32-door-01/status
   Body:  {"status":"closed","is_locked":false}
```

---

## Имплементация в код

| Слой        | Файл                                                  | Релевантна функция        |
|--------------|-------------------------------------------------------|----------------------------|
| ESP32        | `firmware/accessguard_esp32/accessguard_esp32.ino`   | `publishAccessAttempt()`, `onMqttMessage()` |
| Bridge       | `bridge/bridge.js`                                    | `handleAccessAttempt()`, `processCommand()` |
| Supabase     | `sql/01_hardware_integration.sql`                     | `device_commands` таблица  |
| React        | `src/pages/Admin.jsx`                                 | `issueDeviceCommand()`     |
| React        | `src/pages/Profile.jsx`                               | `enrollNfcCard()`, `enrollFingerprint()` |
| React        | `src/pages/History.jsx`                               | Realtime subscription      |
