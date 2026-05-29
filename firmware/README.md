# AccessGuard ESP32 Firmware

Arduino sketch за ESP32, който свързва физическата врата с MQTT брокера.

## Подготовка на Arduino IDE

1. **Инсталирай Arduino IDE** (2.x): https://www.arduino.cc/en/software
2. **Добави ESP32 board manager:**
   - File → Preferences → Additional Boards Manager URLs
   - Добави: `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`
   - Tools → Board → Boards Manager → търси „esp32" → Install (от Espressif Systems)
3. **Избери борда:** Tools → Board → ESP32 Arduino → **ESP32 Dev Module**
4. **Избери порта:** Tools → Port → /dev/cu.usbserial... (или COM порт на Windows)

## Инсталирай библиотеките

Tools → Manage Libraries → търси и инсталирай:

| Библиотека              | Автор             | За какво                |
|-------------------------|-------------------|--------------------------|
| `PubSubClient`          | Nick O'Leary      | MQTT клиент              |
| `ArduinoJson`           | Benoit Blanchon   | JSON parsing/serializing |

(За следващите етапи ще ти трябват и `MFRC522`, `Adafruit Fingerprint Sensor Library`, `Adafruit SSD1306`, `Keypad`.)

## Конфигурация

```bash
cp firmware/accessguard_esp32/secrets.h.example firmware/accessguard_esp32/secrets.h
```

Отвори `secrets.h` и попълни:

- `WIFI_SSID` / `WIFI_PASSWORD` — твоята WiFi мрежа
- `MQTT_HOST` — от HiveMQ Cloud (напр. `xxxxxxxx.s1.eu.hivemq.cloud`)
- `MQTT_USERNAME` / `MQTT_PASSWORD` — credentials-а за `esp32_door_01`
- `DEVICE_ID` — трябва да съвпада с `doors.device_id` в Supabase (напр. `esp32-door-01`)

## Качване на кода

1. Свържи ESP32 с USB
2. Отвори `firmware/accessguard_esp32/accessguard_esp32.ino` в Arduino IDE
3. Натисни **Upload** (стрелката горе вляво)
4. Отвори **Serial Monitor** (Tools → Serial Monitor) на 115200 baud
5. Очакваш да видиш:

```
=========================================
 AccessGuard ESP32 — Stage 2 (LED test)
=========================================
Device ID: esp32-door-01
WiFi: свързване с TvoiataMrezha....
WiFi OK. IP: 192.168.0.42
MQTT: свързване... OK
Subscribed: accessguard/door/esp32-door-01/command
▶ heartbeat (uptime=2s, rssi=-58)
▶ status: closed (locked=1)
```

## Pinout (текущ Етап 2)

| Сигнал         | GPIO   | Бележка                           |
|----------------|--------|-----------------------------------|
| LED индикатор  | 2      | Вграденият LED на DevKit          |

В коментара в началото на `.ino` файла има пълният pinout за следващите етапи (RC522, OLED, fingerprint, keypad).

## Тест с уеб приложението

След като bridge-ът работи и ESP32-ката е онлайн:

1. Отвори React приложението
2. Login като admin
3. Иди в **Admin → Врата** таб
4. В секция „Хардуер (ESP32)" трябва да видиш зелен индикатор „Онлайн"
5. Натисни **Тест LED (2s)** — LED-ът на платката трябва да светне за 2 секунди

Ако индикаторът остава „Офлайн":
- Провери Serial Monitor — има ли „MQTT свързан"?
- Провери че `DEVICE_ID` в `secrets.h` съвпада с `doors.device_id` в Supabase
- Провери че bridge-ът е стартиран (`node bridge.js`)

## Следващи етапи (вече подготвен код за разширяване)

Етап 3: Реле + OLED → реално отваряне на врата
Етап 4: Keypad → въвеждане на PIN
Етап 5: RC522 → NFC карти
Етап 6: AS608 → пръстов отпечатък
Етап 7: Heartbeat + offline detection (вече базово работи)
Етап 8: TLS root CA, hashing на PIN, rate limiting
