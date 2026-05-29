/* =====================================================================
   AccessGuard — ESP32 Firmware (FULL: PIN + NFC + Fingerprint + OLED + Relay)
   --------------------------------------------------------------------
   Свързване (промени според платата си):

     LED индикатор   → GPIO 2  (вграденият LED)
     Реле модул IN   → GPIO 26 (HIGH = отключено, LOW = заключено)

     OLED SSD1306 (I2C, 128x64):
       SDA → GPIO 21
       SCL → GPIO 22

     RC522 NFC (SPI):
       SDA  (SS)  → GPIO 5
       SCK        → GPIO 18
       MOSI       → GPIO 23
       MISO       → GPIO 19
       RST        → GPIO 4

     AS608 Fingerprint (UART2):
       TX (от ESP към сензор) → GPIO 17
       RX (от сензор към ESP) → GPIO 16

     Keypad 4x4:
       Rows: GPIO 13, 12, 14, 27   (R1, R2, R3, R4)
       Cols: GPIO 33, 32, 25, 33   (C1, C2, C3, C4)
       (или промени в KEYPAD блока по-долу)

   Библиотеки за инсталиране (Tools → Manage Libraries):
     - PubSubClient
     - ArduinoJson
     - MFRC522 (by GithubCommunity)
     - Adafruit SSD1306
     - Adafruit GFX Library
     - Adafruit Fingerprint Sensor Library
     - Keypad (by Mark Stanley)
   ===================================================================== */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <SPI.h>
#include <MFRC522.h>
#include <Keypad.h>
#include <Adafruit_Fingerprint.h>
#include "secrets.h"

//Pinout#define LED_PIN     2
#define RELAY_PIN   26
#define RC522_SS    5
#define RC522_RST   4
#define FP_RX       16   // ESP RX  ← FP TX
#define FP_TX       17   // ESP TX  → FP RX

//OLED ───────────────────────────────────────────────
#define OLED_W 128
#define OLED_H 64
Adafruit_SSD1306 oled(OLED_W, OLED_H, &Wire, -1);

//RC522 NFC ──────────────────────────────────────────
MFRC522 rfid(RC522_SS, RC522_RST);

//Keypad 4x4 ─────────────────────────────────────────
const byte KEYPAD_ROWS = 4;
const byte KEYPAD_COLS = 4;
char keys[KEYPAD_ROWS][KEYPAD_COLS] = {
  {'1','2','3','A'},
  {'4','5','6','B'},
  {'7','8','9','C'},
  {'*','0','#','D'}
};
byte rowPins[KEYPAD_ROWS] = {13, 12, 14, 27};
byte colPins[KEYPAD_COLS] = {33, 32, 25, 35};   // GPIO35 е input-only — ОК за keypad
Keypad keypad = Keypad(makeKeymap(keys), rowPins, colPins, KEYPAD_ROWS, KEYPAD_COLS);

//Fingerprint AS608 ──────────────────────────────────
HardwareSerial fpSerial(2);
Adafruit_Fingerprint fp = Adafruit_Fingerprint(&fpSerial);

//MQTT топици ────────────────────────────────────────
String topicBase, topicCommand, topicAccessAttempt, topicStatus, topicHeartbeat;
String topicEnrollProgress, topicEnrollResult;

//MQTT клиент ────────────────────────────────────────
WiFiClientSecure netClient;
PubSubClient     mqtt(netClient);

//Stateunsigned long lastHeartbeat = 0;
const unsigned long HEARTBEAT_INTERVAL_MS = 30000;
unsigned long unlockUntil = 0;     // millis() до кога вратата е отключена
bool isLocked = false;             // аварийно заключено
bool isOpen = false;

// PIN буфер
char pinBuffer[8];
int  pinLen = 0;
unsigned long lastKeyPress = 0;
const unsigned long PIN_TIMEOUT_MS = 8000;

// Enrollment state
enum EnrollMode { ENROLL_NONE, ENROLL_NFC, ENROLL_FP_1, ENROLL_FP_2 };
EnrollMode enrollMode = ENROLL_NONE;
String     enrollUserId = "";
int        enrollSlot = 0;
unsigned long enrollDeadline = 0;

//Forward declarations ───────────────────────────────
void connectWiFi();
void connectMQTT();
void onMqttMessage(char* topic, byte* payload, unsigned int length);
void publishHeartbeat();
void publishStatus();
void handleCommand(JsonDocument& doc);
void publishAccessAttempt(const char* method, const String& value);
void showMessage(const String& title, const String& body, int durationMs = 0);
void showIdle();
void doUnlock(int durationMs, const String& msg);
void doDeny(const String& msg);
void doRelock();
void doLock();
void clearEmergencyLock();
void scanKeypad();
void scanNFC();
void scanFingerprintForMatch();
void runEnrollNFC();
void runEnrollFingerprint();
void publishEnrollResult(const char* type, bool success, const String& value, const String& error = "");

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("\n=== AccessGuard ESP32 — FULL firmware ===");

  pinMode(LED_PIN, OUTPUT); digitalWrite(LED_PIN, LOW);
  pinMode(RELAY_PIN, OUTPUT); digitalWrite(RELAY_PIN, LOW); // LOW = заключено

  // OLED
  Wire.begin(21, 22);
  if (!oled.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("OLED init failed");
  } else {
    oled.clearDisplay(); oled.setTextColor(SSD1306_WHITE);
    showMessage("AccessGuard", "Startup...", 0);
  }

  // RC522
  SPI.begin(18, 19, 23, RC522_SS);
  rfid.PCD_Init();
  Serial.println("RC522 ready");

  // Fingerprint
  fpSerial.begin(57600, SERIAL_8N1, FP_RX, FP_TX);
  fp.begin(57600);
  if (fp.verifyPassword()) {
    Serial.println("AS608 OK");
    fp.getTemplateCount();
    Serial.printf("FP templates: %d\n", fp.templateCount);
  } else {
    Serial.println("AS608 NOT FOUND");
  }

  // Топици
  topicBase           = String("accessguard/door/") + DEVICE_ID;
  topicCommand        = topicBase + "/command";
  topicAccessAttempt  = topicBase + "/access_attempt";
  topicStatus         = topicBase + "/status";
  topicHeartbeat      = topicBase + "/heartbeat";
  topicEnrollProgress = topicBase + "/enroll/progress";
  topicEnrollResult   = topicBase + "/enroll/result";

  connectWiFi();
  netClient.setInsecure();
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onMqttMessage);
  mqtt.setBufferSize(512);
  connectMQTT();

  showIdle();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) connectWiFi();
  if (!mqtt.connected()) connectMQTT();
  mqtt.loop();

  // Heartbeat
  if (millis() - lastHeartbeat > HEARTBEAT_INTERVAL_MS) {
    publishHeartbeat();
    lastHeartbeat = millis();
  }

  // Завършване на временен unlock
  if (unlockUntil && millis() > unlockUntil) {
    digitalWrite(RELAY_PIN, LOW);
    digitalWrite(LED_PIN, LOW);
    unlockUntil = 0;
    isOpen = false;
    publishStatus();
    showIdle();
  }

  // PIN timeout
  if (pinLen > 0 && millis() - lastKeyPress > PIN_TIMEOUT_MS) {
    pinLen = 0;
    showIdle();
  }

  // Enrollment timeout
  if (enrollMode != ENROLL_NONE && millis() > enrollDeadline) {
    publishEnrollResult(enrollMode == ENROLL_NFC ? "nfc" : "fingerprint", false, "", "timeout");
    enrollMode = ENROLL_NONE;
    showIdle();
  }

  // Скенери — изпълняват се само ако не сме в enrollment
  if (enrollMode == ENROLL_NONE) {
    scanKeypad();
    scanNFC();
    scanFingerprintForMatch();
  } else if (enrollMode == ENROLL_NFC) {
    runEnrollNFC();
  } else {
    runEnrollFingerprint();
  }
}

// WiFi & MQTT
void connectWiFi() {
  showMessage("WiFi", "Свързване...");
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 20000) {
    delay(400);
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("WiFi OK %s\n", WiFi.localIP().toString().c_str());
  } else {
    showMessage("WiFi", "Грешка - restart");
    delay(2000);
    ESP.restart();
  }
}

void connectMQTT() {
  while (!mqtt.connected()) {
    showMessage("MQTT", "Свързване...");
    String clientId = String(DEVICE_ID) + "-" + String((uint32_t)esp_random(), HEX);
    if (mqtt.connect(clientId.c_str(), MQTT_USERNAME, MQTT_PASSWORD)) {
      Serial.println("MQTT connected");
      mqtt.subscribe(topicCommand.c_str(), 1);
      publishHeartbeat();
      publishStatus();
    } else {
      Serial.printf("MQTT err rc=%d, retry...\n", mqtt.state());
      delay(3000);
    }
  }
}

void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  StaticJsonDocument<512> doc;
  if (deserializeJson(doc, payload, length)) return;
  handleCommand(doc);
}

// Command handler — bridge → ESP32
void handleCommand(JsonDocument& doc) {
  const char* cmd = doc["command"] | "";
  Serial.printf("CMD: %s\n", cmd);

  if (!strcmp(cmd, "unlock")) {
    int dur = doc["duration_ms"] | 3000;
    String msg = doc["message"] | "Достъп разрешен";
    doUnlock(dur, msg);
  }
  else if (!strcmp(cmd, "deny")) {
    String msg = doc["message"] | "Достъп отказан";
    doDeny(msg);
  }
  else if (!strcmp(cmd, "lock")) {  // legacy alias → emergency_lock
    isLocked = true;
    doLock();
  }
  else if (!strcmp(cmd, "relock")) {
    doRelock();
    showMessage("Затворено", "Релето е изключено", 1000);
  }
  else if (!strcmp(cmd, "emergency_lock")) {
    isLocked = true;
    doLock();
  }
  else if (!strcmp(cmd, "emergency_unlock")) {
    clearEmergencyLock();
  }
  else if (!strcmp(cmd, "test_led")) {
    int dur = doc["duration_ms"] | 2000;
    digitalWrite(LED_PIN, HIGH);
    unlockUntil = millis() + dur;
    showMessage("Тест", "LED свети");
  }
  else if (!strcmp(cmd, "enroll_nfc")) {
    enrollMode = ENROLL_NFC;
    enrollUserId = (const char*)(doc["user_id"] | "");
    enrollDeadline = millis() + (unsigned long)(doc["timeout_ms"] | 15000);
    showMessage("Регистрация", "Сложете картата");
  }
  else if (!strcmp(cmd, "enroll_fingerprint")) {
    enrollMode = ENROLL_FP_1;
    enrollUserId = (const char*)(doc["user_id"] | "");
    enrollSlot   = doc["slot"] | 1;
    enrollDeadline = millis() + (unsigned long)(doc["timeout_ms"] | 30000);
    showMessage("Регистрация", "Сложете пръст");
  }
  else if (!strcmp(cmd, "reboot")) {
    showMessage("Restart", "...");
    delay(500);
    ESP.restart();
  }
}

// Keypad — PIN въвеждане
void scanKeypad() {
  char k = keypad.getKey();
  if (!k) return;
  lastKeyPress = millis();

  if (k == '*') {
    pinLen = 0;
    showIdle();
    return;
  }
  if (k == '#') {
    if (pinLen > 0) {
      pinBuffer[pinLen] = 0;
      String pin = String(pinBuffer);
      Serial.printf("PIN entered: %s\n", pin.c_str());
      publishAccessAttempt("pin", pin);
      showMessage("ПИН", "Проверка...");
      pinLen = 0;
    }
    return;
  }
  if (k >= '0' && k <= '9' && pinLen < 7) {
    pinBuffer[pinLen++] = k;
    String dots = "";
    for (int i = 0; i < pinLen; i++) dots += "*";
    showMessage("ПИН", dots);
  }
}

// NFC — четене за вход
void scanNFC() {
  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) return;

  String uid = "";
  for (byte i = 0; i < rfid.uid.size; i++) {
    if (rfid.uid.uidByte[i] < 0x10) uid += "0";
    uid += String(rfid.uid.uidByte[i], HEX);
  }
  uid.toUpperCase();
  Serial.printf("NFC UID: %s\n", uid.c_str());

  publishAccessAttempt("nfc", uid);
  showMessage("NFC", "Проверка...");
  rfid.PICC_HaltA();
  delay(800);  // да не препраща веднага същата карта
}

// Fingerprint — match за вход
void scanFingerprintForMatch() {
  // Бърза проверка дали има пръст
  uint8_t p = fp.getImage();
  if (p != FINGERPRINT_OK) return;

  if (fp.image2Tz() != FINGERPRINT_OK) return;
  if (fp.fingerSearch() == FINGERPRINT_OK) {
    Serial.printf("FP match slot=%d conf=%d\n", fp.fingerID, fp.confidence);
    publishAccessAttempt("fingerprint", String(fp.fingerID));
    showMessage("Отпечатък", "Проверка...");
    delay(800);
  } else {
    showMessage("Отпечатък", "Непознат");
    delay(1200);
    showIdle();
  }
}

// Enrollment — NFC
void runEnrollNFC() {
  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) return;
  String uid = "";
  for (byte i = 0; i < rfid.uid.size; i++) {
    if (rfid.uid.uidByte[i] < 0x10) uid += "0";
    uid += String(rfid.uid.uidByte[i], HEX);
  }
  uid.toUpperCase();
  rfid.PICC_HaltA();

  publishEnrollResult("nfc", true, uid);
  showMessage("Готово", "Картата е записана", 1500);
  enrollMode = ENROLL_NONE;
}

// Enrollment — Fingerprint (двустъпков AS608 алгоритъм)
void runEnrollFingerprint() {
  static unsigned long stepDeadline = 0;
  uint8_t p;

  if (enrollMode == ENROLL_FP_1) {
    p = fp.getImage();
    if (p != FINGERPRINT_OK) return;
    if (fp.image2Tz(1) != FINGERPRINT_OK) {
      showMessage("Грешка", "Опитай пак");
      delay(1200);
      return;
    }
    showMessage("Махни пръст", "и сложи пак");
    enrollMode = ENROLL_FP_2;
    stepDeadline = millis() + 800;
    return;
  }

  if (enrollMode == ENROLL_FP_2) {
    if (millis() < stepDeadline) return;  // изчакай да махне
    p = fp.getImage();
    if (p == FINGERPRINT_NOFINGER) return;
    if (p != FINGERPRINT_OK) return;
    if (fp.image2Tz(2) != FINGERPRINT_OK) {
      publishEnrollResult("fingerprint", false, "", "image2tz_failed");
      enrollMode = ENROLL_NONE;
      showMessage("Грешка", "Опитай пак", 1500);
      return;
    }
    if (fp.createModel() != FINGERPRINT_OK) {
      publishEnrollResult("fingerprint", false, "", "model_mismatch");
      enrollMode = ENROLL_NONE;
      showMessage("Грешка", "Несъвпадение", 1500);
      return;
    }
    if (fp.storeModel(enrollSlot) != FINGERPRINT_OK) {
      publishEnrollResult("fingerprint", false, "", "store_failed");
      enrollMode = ENROLL_NONE;
      return;
    }
    publishEnrollResult("fingerprint", true, String(enrollSlot));
    showMessage("Готово", "Отпечатък записан", 1500);
    enrollMode = ENROLL_NONE;
  }
}

// Действия
void doUnlock(int durationMs, const String& msg) {
  if (isLocked) {
    doDeny("Аварийно заключено");
    return;
  }
  digitalWrite(RELAY_PIN, HIGH);
  digitalWrite(LED_PIN, HIGH);
  unlockUntil = millis() + durationMs;
  isOpen = true;
  publishStatus();
  showMessage("Здравей,", msg);
}

void doDeny(const String& msg) {
  for (int i = 0; i < 3; i++) {
    digitalWrite(LED_PIN, HIGH); delay(120);
    digitalWrite(LED_PIN, LOW);  delay(120);
  }
  showMessage("Отказ", msg, 1500);
}

void doRelock() {
  digitalWrite(RELAY_PIN, LOW);
  digitalWrite(LED_PIN, LOW);
  unlockUntil = 0;
  isOpen = false;
  publishStatus();
}

void doLock() {
  doRelock();
  showMessage("ЗАКЛЮЧЕНО", "Авариен режим");
}

void clearEmergencyLock() {
  isLocked = false;
  doRelock();
  showMessage("Отключено", "Аварийният режим е спрян", 1400);
}

// Публикуване
void publishHeartbeat() {
  StaticJsonDocument<128> d;
  d["uptime_s"] = millis() / 1000;
  d["rssi"]     = WiFi.RSSI();
  d["fw"]       = "stage6-full";
  char buf[128]; size_t n = serializeJson(d, buf);
  mqtt.publish(topicHeartbeat.c_str(), buf, n);
}

void publishStatus() {
  StaticJsonDocument<96> d;
  d["status"]    = isOpen ? "open" : "closed";
  d["is_locked"] = isLocked;
  char buf[96]; size_t n = serializeJson(d, buf);
  mqtt.publish(topicStatus.c_str(), buf, n, true);  // retained
}

void publishAccessAttempt(const char* method, const String& value) {
  StaticJsonDocument<128> d;
  d["method"] = method;
  d["value"]  = value;
  char buf[128]; size_t n = serializeJson(d, buf);
  mqtt.publish(topicAccessAttempt.c_str(), buf, n, false, 1);
  Serial.printf("▶ access_attempt %s=%s\n", method, value.c_str());
}

void publishEnrollResult(const char* type, bool success, const String& value, const String& error) {
  StaticJsonDocument<256> d;
  d["type"]    = type;
  d["success"] = success;
  d["user_id"] = enrollUserId;
  if (success)         d["value"] = value;
  if (error.length())  d["error"] = error;
  char buf[256]; size_t n = serializeJson(d, buf);
  mqtt.publish(topicEnrollResult.c_str(), buf, n, false, 1);
  Serial.printf("▶ enroll/result type=%s success=%d\n", type, success);
}

// OLED
void showMessage(const String& title, const String& body, int durationMs) {
  oled.clearDisplay();
  oled.setTextSize(1); oled.setCursor(0, 0);
  oled.println(title);
  oled.drawLine(0, 10, OLED_W, 10, SSD1306_WHITE);
  oled.setTextSize(2); oled.setCursor(0, 22);
  oled.println(body);
  oled.display();
  if (durationMs > 0) {
    delay(durationMs);
    showIdle();
  }
}

void showIdle() {
  oled.clearDisplay();
  oled.setTextSize(1);
  oled.setCursor(0, 0); oled.println("AccessGuard");
  oled.drawLine(0, 10, OLED_W, 10, SSD1306_WHITE);
  oled.setCursor(0, 18); oled.println(isLocked ? "ЗАКЛЮЧЕНО" : "Готов за достъп:");
  if (!isLocked) {
    oled.setCursor(0, 32); oled.println("> NFC карта");
    oled.setCursor(0, 44); oled.println("> ПИН + #");
    oled.setCursor(0, 56); oled.println("> Пръстов отпечатък");
  }
  oled.display();
}
