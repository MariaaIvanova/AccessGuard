# AccessGuard — Хардуерна интеграция, Етап 2

Този документ обяснява в какъв ред да изпълниш стъпките за първото end-to-end включване на ESP32 + MQTT + Supabase + React.

## Какво ще постигнем в Етап 2

Натискаш бутон „Тест LED" в браузъра (Admin → Врата таб) → LED-ът на ESP32 светва за 2 секунди → индикатор „Онлайн" в браузъра показва, че устройството работи.

Това доказва, че цялата комуникационна верига функционира. Всички следващи сензори се добавят върху този скелет.

## Стъпки в правилен ред

### 1. SQL миграция (5 минути)
- Отвори Supabase Dashboard → SQL Editor → New query
- Копирай съдържанието на `sql/01_hardware_integration.sql`
- Изпълни (Run)
- Иди в Database → Tables → провери че `doors` има нови колони `device_id`, `last_heartbeat`
- Изпълни ръчно:
  ```sql
  update doors set device_id = 'esp32-door-01' where name = 'Главна врата';
  ```
  (замени името с реалното от твоята база)

### 2. HiveMQ Cloud setup (10 минути)
- Следвай `SETUP_HIVEMQ.md`
- Запази credentials-ите за двата потребителя (bridge_server и esp32_door_01)

### 3. Bridge сървър (5 минути)
```bash
cd bridge
npm install
cp .env.example .env
# редактирай .env с реалните credentials
node bridge.js
```
Очакваш „✅ MQTT свързан" и „✅ Realtime: device_commands".

### 4. ESP32 firmware (10 минути)
- Инсталирай Arduino IDE и ESP32 board support (виж `firmware/README.md`)
- Инсталирай `PubSubClient` и `ArduinoJson` библиотеките
- Копирай `firmware/accessguard_esp32/secrets.h.example` като `secrets.h`
- Попълни WiFi и MQTT credentials в `secrets.h`
- Свържи ESP32 с USB и натисни Upload
- Отвори Serial Monitor (115200 baud)
- Очакваш „MQTT: свързване... OK" и „heartbeat" съобщения

### 5. React приложение (1 минута)
- `npm run dev`
- Login като admin
- Admin → Врата таб
- Скрол до „Хардуер (ESP32)" секцията
- Зелена точка „Онлайн" + натискане на „Тест LED" → LED светва

## Какви файлове са добавени

```
sql/
└── 01_hardware_integration.sql       ← SQL миграция

bridge/
├── bridge.js                          ← Node.js mqtt↔supabase bridge
├── package.json
├── .env.example
├── .gitignore
└── README.md

firmware/
├── accessguard_esp32/
│   ├── accessguard_esp32.ino         ← ESP32 код (Stage 2)
│   └── secrets.h.example
├── .gitignore
└── README.md

src/pages/Admin.jsx                    ← добавени:
                                       — секция „Хардуер (ESP32)"
                                       — бутони: Тест LED, Отключи, Заключи, Рестарт
                                       — таблица „Последни команди"
                                       — индикатор „Онлайн/Офлайн"

SETUP_HIVEMQ.md                        ← гайд за регистрация в HiveMQ
HARDWARE_SETUP.md                      ← този файл
```

## Какво не променяме

Цялата текуща логика на React приложението остава непроменена:
- Login/Profile/Schedule/Dashboard/History
- Емержънси заключване (вече работи през `doors.is_locked`)
- Realtime subscription за врата (вече има за `doors`)
- QR temp access за гости

Bridge-ът има готов код за валидация на NFC/PIN/fingerprint в `handleAccessAttempt()` — той ще се активира на Етап 4–6 без промени тук.

## Какво следва (Етапи 3–8)

| Етап | Какво добавяме                      | Резултат                                           |
|------|--------------------------------------|----------------------------------------------------|
| 3    | Реле + OLED дисплей                  | Реално отваряне на врата + съобщения на дисплея    |
| 4    | Keypad 4x4 + PIN                     | Въвеждане на PIN на устройството → отваряне        |
| 5    | RC522 NFC                            | Карти/гривни → отваряне; регистрация в Profile     |
| 6    | AS608 fingerprint                    | Пръстов отпечатък → отваряне; enrollment процедура |
| 7    | Heartbeat polish + auto-lock         | „Офлайн" аларма; auto-lock при много fails         |
| 8    | TLS CA cert, PIN hashing, rate limit | Production-grade сигурност за дипломната           |

Всеки от следващите етапи ще е малък incremental ъпдейт — нов модул в `.ino` файла, малко допълнителна логика в bridge-а, опционално някой UI елемент.
