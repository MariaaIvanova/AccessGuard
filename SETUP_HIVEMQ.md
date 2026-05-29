# Настройка на HiveMQ Cloud (MQTT брокер)

HiveMQ Cloud е хостван MQTT брокер с безплатен план (до 100 устройства, TLS сигурност). Точно за нашия случай.

## Стъпка 1: Регистрация

1. Отвори https://www.hivemq.com/mqtt-cloud-broker/
2. Кликни **Sign up free** → регистрирай се с email или GitHub
3. След потвърждение, в dashboard-а кликни **Create Cluster**
4. Избери **Free** план → регион **EU (Frankfurt)** или най-близкия
5. Изчакай ~1 минута, докато се създаде клъстерът

## Стъпка 2: Създаване на credentials

В Overview на новия клъстер ще видиш:

```
Cluster URL:     xxxxxxxxxxxx.s1.eu.hivemq.cloud
Port (TLS):      8883
Port (WebSocket TLS): 8884
```

Запиши URL-то — ще ни трябва и за ESP32, и за bridge.

Иди в **Access Management → Credentials → Add new credential**:

| Поле       | Стойност          |
|------------|-------------------|
| Username   | `bridge_server`   |
| Password   | (генерирай силна) |
| Permission | `Publish & Subscribe` |

Създай втори credential за ESP32:

| Поле       | Стойност          |
|------------|-------------------|
| Username   | `esp32_door_01`   |
| Password   | (генерирай силна) |
| Permission | `Publish & Subscribe` |

> Защо два потребителя: ако някой ден credentials-ите на ESP32-ката изтекат (отворен код, снимка...), revoke-ваш само него, без да губиш bridge.

## Стъпка 3: Web Client тест (по избор, но препоръчително)

В горното меню → **Web Client** → въведи credentials → **Connect**.

В **Subscriptions** добави топик `accessguard/#` (всичко под нашия namespace).
В **Publish** изпрати тестово съобщение на топик `accessguard/test` с payload `{"hello":"world"}` — трябва да го видиш веднага в Subscriptions полето.

Ако виждаш съобщението — брокерът работи и можеш да минеш нататък.

## Стъпка 4: Запазване в .env

Отвори `bridge/.env` (ще го създадем след малко) и попълни:

```
MQTT_HOST=xxxxxxxxxxxx.s1.eu.hivemq.cloud
MQTT_PORT=8883
MQTT_USERNAME=bridge_server
MQTT_PASSWORD=<паролата от Стъпка 2>
```

В `firmware/accessguard_esp32/secrets.h` ще попълниш ESP32 credentials-ите.

## Топик структура (за справка)

```
accessguard/door/{device_id}/access_attempt   ← ESP32 публикува (NFC/PIN/fingerprint опит)
accessguard/door/{device_id}/command          ← Bridge публикува (unlock, lock, test_led)
accessguard/door/{device_id}/status           ← ESP32 публикува (locked/unlocked, sensor states)
accessguard/door/{device_id}/heartbeat        ← ESP32 публикува на всеки 30s
accessguard/door/{device_id}/enroll/progress  ← По време на регистрация на отпечатък/NFC
accessguard/door/{device_id}/enroll/result    ← Резултат от enrollment
```

`{device_id}` е стойността от `doors.device_id` (напр. `esp32-door-01`).

## Често срещани грешки

**„Connection refused"** — провери дали порт 8883 не е блокиран от твоя мрежа/училищния WiFi. Алтернатива: 8884 (WebSocket TLS).

**„Bad username or password"** — credentials-ите са case-sensitive, копирай ги внимателно.

**„Certificate verify failed"** на ESP32 — нормално при първо стартиране. ESP32 кодът използва WiFiClientSecure с `setInsecure()` за демо целите. За продукция — добави HiveMQ root CA cert (има го в `firmware/accessguard_esp32/secrets.h.example`).
