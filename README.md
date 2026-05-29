# AccessGuard — RozovoPony Security

Система за контрол на достъп с многофакторна автентикация (PIN, NFC карта, пръстов отпечатък), уеб приложение за управление и физически контролер базиран на ESP32.

Дипломен проект.

## Документация

- [`DOCUMENTATION.md`](DOCUMENTATION.md) — пълна документация на системата (архитектура, потребителски интерфейс, база данни, сигурност)
- [`PROTOCOL.md`](PROTOCOL.md) — спецификация на MQTT протокола между bridge и ESP32
- [`HARDWARE_SETUP.md`](HARDWARE_SETUP.md) — стъпки за подготовка на физическия хардуер
- [`SETUP_HIVEMQ.md`](SETUP_HIVEMQ.md) — регистрация и конфигурация на MQTT брокер

## Бърз старт

### 1. База данни (Supabase)

В Supabase Dashboard → SQL Editor, изпълнете миграциите по ред:

```
sql/01_hardware_integration.sql
sql/02_realtime_publications.sql
sql/03_maintenance_in_db.sql
sql/04_qr_redemption.sql
sql/05_remote_unlock_rpc.sql
```

### 2. Bridge сървър

```bash
cd bridge
npm install
cp .env.example .env
# попълнете .env с MQTT и Supabase credentials
node bridge.js
```

### 3. ESP32 firmware

В Arduino IDE отворете `firmware/accessguard_esp32/accessguard_esp32.ino`. Преди компилация:

```bash
cd firmware/accessguard_esp32
cp secrets.h.example secrets.h
# попълнете secrets.h с WiFi и MQTT credentials
```

Качете програмата на устройството чрез Upload бутона.

### 4. Уеб приложение

```bash
npm install
npm run dev
```

Приложението стартира на `http://localhost:5173`. За демо с мобилен телефон използвайте `npm run dev -- --host`, което прави приложението достъпно през локалната мрежа.

## Структура на проекта

```
access-control/
├── src/             React уеб приложение
├── bridge/          Node.js MQTT ↔ Supabase мост
├── firmware/        ESP32 Arduino sketch
├── sql/             Миграции за PostgreSQL
├── public/          Статични файлове
└── *.md             Документация
```

## Технологии

- React 19, Vite 5, react-router-dom 7
- Supabase (PostgreSQL, Auth, Realtime, Storage)
- Node.js 18+ (bridge сървър)
- HiveMQ Cloud (MQTT broker, TLS)
- ESP32 + RC522 + AS608 + SSD1306 + 4×4 keypad + реле
