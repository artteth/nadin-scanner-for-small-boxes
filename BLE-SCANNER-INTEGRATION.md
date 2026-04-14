# Инструкция: подключение BLE-сканера штрих-кодов к веб-приложению

## Что это и зачем

Позволяет подключить **физический Bluetooth-сканер штрих-кодов** (пистолет, кольцо, ручка) к веб-приложению без драйверов и без USB-провода. Сканер работает как виртуальный COM-порт через BLE (Bluetooth Low Energy). При сканировании штрих-кода — браузер получает текст в реальном времени.

**Поддерживаемые браузеры:**
- Android: Chrome, Edge, Brave, Samsung Internet
- iOS / iPadOS: только **Bluefy** (специальный браузер с Web Bluetooth)
- Desktop: Chrome / Edge / Opera на Windows, macOS, Linux

**Не работает:** Firefox, Safari (кроме Bluefy), все браузеры iOS кроме Bluefy.

---

## Шаг 1 — CSS

Вставить в `<style>` страницы.

```css
/* ── BLE: плавающая кнопка (FAB) ── */
.ble-fab {
  position: fixed;
  bottom: max(24px, calc(env(safe-area-inset-bottom, 0px) + 16px));
  right: max(20px, calc(env(safe-area-inset-right, 0px) + 16px));
  z-index: 100001;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: white;
  border: 2px solid #d1d5db;
  font-size: 26px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 16px rgba(0,0,0,0.18);
  transition: background 0.25s, box-shadow 0.25s;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}
.ble-fab.ble-connected {
  background: #15803d;
  color: white;
  border-color: transparent;
  animation: blePulse 2s infinite;
}
@keyframes blePulse {
  0%, 100% { box-shadow: 0 4px 16px rgba(21,128,61,0.35); }
  50%       { box-shadow: 0 4px 28px rgba(21,128,61,0.70); }
}
.ble-fab:active { transform: scale(0.90); }

/* ── BLE: панель управления (снизу) ── */
.ble-panel-overlay {
  position: fixed;
  inset: 0;
  z-index: 100002;
  background: rgba(0,0,0,0.45);
  display: none;
  align-items: flex-end;
  justify-content: center;
}
.ble-panel-overlay.active { display: flex; }
.ble-panel {
  background: white;
  width: 100%;
  max-width: min(600px, 100vw);
  border-radius: 20px 20px 0 0;
  padding: 20px 20px max(20px, env(safe-area-inset-bottom, 0px));
  box-shadow: 0 -4px 24px rgba(0,0,0,0.15);
}
.ble-status-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 10px 0 6px;
  font-size: 15px;
  color: #374151;
}
.ble-dot {
  width: 12px; height: 12px;
  border-radius: 50%;
  background: #d1d5db;
  flex-shrink: 0;
  transition: background 0.3s;
}
.ble-dot.on { background: #15803d; }
.ble-device-name {
  font-size: 14px;
  color: #6b7280;
  margin-bottom: 8px;
}
.ble-warn {
  margin-top: 14px;
  background: #fef3c7;
  border: 1px solid #f59e0b;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 13px;
  color: #92400e;
  line-height: 1.5;
}
.ble-steps { padding-left: 18px; margin-top: 6px; }
.ble-steps li { margin-bottom: 3px; }

/* ── BLE: тост-уведомление (вверху по центру) ── */
.ble-toast {
  position: fixed;
  top: max(14px, env(safe-area-inset-top, 0px));
  left: 50%;
  transform: translateX(-50%) translateY(-80px);
  background: rgba(17,24,39,0.88);
  color: white;
  padding: 8px 18px;
  border-radius: 20px;
  font-size: 15px;
  font-weight: 600;
  white-space: nowrap;
  z-index: 200000;
  pointer-events: none;
  transition: transform 0.3s cubic-bezier(0.4,0,0.2,1);
}
.ble-toast.show { transform: translateX(-50%) translateY(0); }
```

---

## Шаг 2 — HTML

Вставить перед закрывающим `</body>`.

```html
<!-- ── BLE: плавающая кнопка ── -->
<button id="bleFab" class="ble-fab" onclick="openBlePanel()" title="Bluetooth сканер">
  ᯤ
</button>

<!-- ── BLE: панель управления ── -->
<div id="blePanelOverlay" class="ble-panel-overlay" onclick="if(event.target===this)closeBlePanel()">
  <div class="ble-panel">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
      <span style="font-size:17px;font-weight:700">📡 BLE Сканер</span>
      <button onclick="closeBlePanel()" style="background:none;border:none;font-size:22px;cursor:pointer;color:#9ca3af;touch-action:manipulation">✕</button>
    </div>

    <div class="ble-status-row">
      <div class="ble-dot" id="bleDot"></div>
      <span id="bleStatusText">Не подключён</span>
    </div>
    <div class="ble-device-name" id="bleDeviceName" style="display:none"></div>

    <button id="bleConnectBtn"    class="btn btn-primary"   onclick="bleConnect()"         style="margin-top:4px">🔗 Подключить сканер</button>
    <button id="bleOtherBtn"      class="btn btn-secondary" onclick="ble.connectManual()"  style="display:none;margin-top:8px">🔍 Выбрать другой сканер</button>
    <button id="bleDisconnectBtn" class="btn btn-danger"    onclick="bleDisconnect()"      style="display:none;margin-top:10px">⛔ Отключить</button>
    <button id="bleForgetBtn"     class="btn btn-secondary" onclick="ble.forgetDevice()"   style="display:none;margin-top:8px;font-size:14px;color:#9ca3af">🗑 Забыть устройство</button>

    <!-- Предупреждение для iOS -->
    <div class="ble-warn">
      <b>⚠️ Важно для iOS (Bluefy)</b><br>
      Когда iOS показывает диалог с кнопкой <b>«Создать пару»</b> — нажмите <b>«Отмена»</b>.<br>
      Нажатие «Создать пару» привязывает устройство к системе, и оно перестаёт отображаться в списке.<br><br>
      Если уже нажали «Создать пару» — нужно отвязать устройство:<br>
      <ol class="ble-steps">
        <li>Настройки iOS → Bluetooth</li>
        <li>Найдите ваш сканер, нажмите ⓘ</li>
        <li>«Забыть это устройство»</li>
        <li>Вернитесь в Bluefy и подключитесь снова</li>
      </ol>
    </div>
  </div>
</div>

<!-- ── BLE: тост-уведомление ── -->
<div id="bleToast" class="ble-toast"></div>
```

> **Примечание:** кнопки используют классы `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-danger`. Это стили вашего приложения. Замените на свои классы кнопок или используйте `style=""` напрямую.

---

## Шаг 3 — JavaScript

Вставить в `<script>` (или отдельный `.js` файл).

### 3.1 — Основной объект `ble`

```javascript
var ble = {
  device: null,
  server: null,
  connected: false,
  lastText: '',
  lastTime: 0,
  dedupeMs: 2000,          // игнорировать повтор того же кода в течение N мс
  savedDeviceName: '',
  BLE_DEV_KEY: 'bleLastDevice_v1',

  // UUID сервисов — покрывают 99% BLE-сканеров на рынке
  SERVICES: [
    '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART (NUS) — самый распространённый
    '6e400002-b5a3-f393-e0a9-e50e24dcca9e', // NUS TX
    '6e400003-b5a3-f393-e0a9-e50e24dcca9e', // NUS RX
    '0000ffe0-0000-1000-8000-00805f9b34fb', // HM-10 (дешёвые китайские сканеры)
    '0000ffe1-0000-1000-8000-00805f9b34fb', // HM-10 characteristic
    '0000dfb0-0000-1000-8000-00805f9b34fb', // Zebra, Honeywell и др.
    '49535343-fe7d-4ae5-8fa9-9fafd205e455', // RSC Service
    '0000fff0-0000-1000-8000-00805f9b34fb', // TI / некоторые китайские
    '0000fff1-0000-1000-8000-00805f9b34fb',
    'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Silabs
    '0000180a-0000-1000-8000-00805f9b34fb', // Device Information
    '0000180f-0000-1000-8000-00805f9b34fb', // Battery Service
  ],

  // ── Сохранение имени устройства в localStorage ──
  loadSavedDevice: function() {
    try { this.savedDeviceName = localStorage.getItem(this.BLE_DEV_KEY) || ''; } catch(e) {}
  },
  saveDevice: function() {
    try {
      if (this.device && this.device.name) {
        this.savedDeviceName = this.device.name;
        localStorage.setItem(this.BLE_DEV_KEY, this.device.name);
      }
    } catch(e) {}
  },
  forgetDevice: function() {
    this.savedDeviceName = '';
    try { localStorage.removeItem(this.BLE_DEV_KEY); } catch(e) {}
    this.updateUI();
  },

  // ── Авто-переподключение без диалога (если устройство уже разрешено) ──
  // Использует navigator.bluetooth.getDevices() — список ранее разрешённых устройств.
  // Не показывает пользователю никаких диалогов.
  reconnect: async function() {
    if (!navigator.bluetooth || !navigator.bluetooth.getDevices) return false;
    if (!this.savedDeviceName) return false;

    try {
      var devices = await navigator.bluetooth.getDevices();
      var savedName = this.savedDeviceName;
      var found = null;
      for (var i = 0; i < devices.length; i++) {
        if (devices[i].name === savedName) { found = devices[i]; break; }
      }
      if (!found) return false;

      this.device = found;
      this.device.addEventListener('gattserverdisconnected', function() { ble.onDisconnect(); });

      // Вариант 1: прямое подключение (устройство включено и рядом)
      try {
        this.server = await found.gatt.connect();
        await this.setupNotifications();
        this.connected = true;
        this.saveDevice();
        this.updateUI();
        return true;
      } catch(directErr) {}

      // Вариант 2: ждём рекламу через watchAdvertisements() (для спаренных устройств)
      if (!found.watchAdvertisements) return false;

      return await new Promise(function(resolve) {
        var timer = setTimeout(function() {
          try { found.stopWatchingAdvertisements(); } catch(e) {}
          resolve(false);
        }, 8000); // ждём до 8 секунд

        found.addEventListener('advertisementreceived', async function handler() {
          found.removeEventListener('advertisementreceived', handler);
          clearTimeout(timer);
          try { found.stopWatchingAdvertisements(); } catch(e) {}
          try {
            ble.server = await found.gatt.connect();
            await ble.setupNotifications();
            ble.connected = true;
            ble.saveDevice();
            ble.updateUI();
            resolve(true);
          } catch(e) { resolve(false); }
        });

        found.watchAdvertisements().catch(function() {
          clearTimeout(timer);
          resolve(false);
        });
      });
    } catch(e) {
      return false;
    }
  },

  // ── Подключение с диалогом выбора устройства ──
  connect: async function() {
    if (!navigator.bluetooth) {
      bleSetStatus('⚠️ Web Bluetooth не поддерживается.<br>iOS → Bluefy, Android → Chrome/Edge.');
      return;
    }
    var btn = document.getElementById('bleConnectBtn');
    if (btn) { btn.textContent = '⏳ Подключение...'; btn.disabled = true; }

    // Шаг 1: пробуем авто-переподключение без диалога
    var reconnected = await this.reconnect();
    if (reconnected) {
      closeBlePanel();
      bleToast('🔗 Автоподключение: ' + (this.device.name || 'Сканер'));
      return;
    }

    // Шаг 2: показываем диалог выбора
    // Если есть сохранённое имя — фильтруем по нему (показывает спаренные устройства iOS)
    if (btn) { btn.textContent = '⏳ Выберите устройство...'; }
    try {
      var params = this.savedDeviceName
        ? { filters: [{ name: this.savedDeviceName }], optionalServices: this.SERVICES }
        : { acceptAllDevices: true, optionalServices: this.SERVICES };

      this.device = await navigator.bluetooth.requestDevice(params);

      if (btn) { btn.textContent = '⏳ Подключение...'; }
      this.device.addEventListener('gattserverdisconnected', function() { ble.onDisconnect(); });
      this.server = await this.device.gatt.connect();
      await this.setupNotifications();
      this.connected = true;
      this.saveDevice();
      this.updateUI();
      closeBlePanel();
      bleToast('🔗 Подключён: ' + (this.device.name || 'Сканер'));
    } catch(e) {
      if (e.name === 'NotFoundError' && this.savedDeviceName) {
        bleSetStatus('«' + this.savedDeviceName + '» не найден. Попробуйте «Выбрать другой сканер».');
      } else if (e.name !== 'NotFoundError') {
        bleSetStatus('⚠️ ' + (e.message || e));
      }
      if (btn) { btn.textContent = '🔗 Подключить ' + (this.savedDeviceName || 'сканер'); btn.disabled = false; }
      this.updateUI();
    }
  },

  // ── Ручной выбор устройства (игнорирует сохранённое, всегда показывает диалог) ──
  connectManual: async function() {
    if (!navigator.bluetooth) return;
    var btn = document.getElementById('bleOtherBtn');
    if (btn) { btn.textContent = '⏳ Выберите...'; btn.disabled = true; }
    try {
      this.device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: this.SERVICES
      });
      this.device.addEventListener('gattserverdisconnected', function() { ble.onDisconnect(); });
      this.server = await this.device.gatt.connect();
      await this.setupNotifications();
      this.connected = true;
      this.saveDevice();
      this.updateUI();
      closeBlePanel();
      bleToast('🔗 Подключён: ' + (this.device.name || 'Сканер'));
    } catch(e) {
      if (e.name !== 'NotFoundError') bleSetStatus('⚠️ ' + (e.message || e));
      if (btn) { btn.textContent = '🔍 Выбрать другой сканер'; btn.disabled = false; }
      this.updateUI();
    }
  },

  // ── Подписка на уведомления GATT ──
  // Перебирает все сервисы и все характеристики с notify/indicate.
  setupNotifications: async function() {
    var services;
    try { services = await this.server.getPrimaryServices(); } catch(e) { return; }

    for (var si = 0; si < services.length; si++) {
      try {
        var chars = await services[si].getCharacteristics();
        for (var ci = 0; ci < chars.length; ci++) {
          var c = chars[ci];
          if (c.properties.notify || c.properties.indicate) {
            try {
              await c.startNotifications();
              c.addEventListener('characteristicvaluechanged', (function(ch) {
                return function(e) { ble.onData(e.target.value); };
              })(c));
            } catch(e) {}
          }
        }
      } catch(e) {}
    }
  },

  // ── Обработка входящих данных ──
  onData: function(dataView) {
    try {
      var decoder = new TextDecoder('utf-8');
      var text = decoder.decode(dataView)
        // Убираем управляющие символы (кроме \n \r \t)
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '')
        .trim();

      if (!text || text.length < 3) return; // слишком короткий — игнорируем

      // Дедупликация: некоторые сканеры шлют один штрих-код несколькими пакетами
      var now = Date.now();
      if (text === this.lastText && (now - this.lastTime) < this.dedupeMs) return;
      this.lastText = text;
      this.lastTime = now;

      // ── ВАША ТОЧКА ВХОДА ──
      onBLEBarcode(text);
    } catch(e) {}
  },

  disconnect: function() {
    try {
      if (this.device && this.device.gatt && this.device.gatt.connected) {
        this.device.gatt.disconnect();
      }
    } catch(e) {}
    this.onDisconnect();
  },

  onDisconnect: function() {
    this.connected = false;
    this.device = null;
    this.server = null;
    this.updateUI();
    bleToast('⛔ BLE сканер отключён');
  },

  // ── Обновление UI ──
  updateUI: function() {
    var fab = document.getElementById('bleFab');
    if (fab) {
      if (this.connected) fab.classList.add('ble-connected');
      else fab.classList.remove('ble-connected');
    }
    var dot = document.getElementById('bleDot');
    if (dot) {
      if (this.connected) dot.classList.add('on');
      else dot.classList.remove('on');
    }
    var name = this.device && this.device.name ? ': ' + this.device.name : '';
    bleSetStatus(this.connected ? ('Подключён' + name) : 'Не подключён', this.connected);

    var devEl = document.getElementById('bleDeviceName');
    if (devEl) {
      if (this.connected && this.device && this.device.name) {
        devEl.textContent = '📟 ' + this.device.name;
        devEl.style.display = '';
      } else if (!this.connected && this.savedDeviceName) {
        devEl.textContent = '💾 Последний: ' + this.savedDeviceName;
        devEl.style.display = '';
      } else {
        devEl.style.display = 'none';
      }
    }

    var cb = document.getElementById('bleConnectBtn');
    var db = document.getElementById('bleDisconnectBtn');
    var fb = document.getElementById('bleForgetBtn');
    var ob = document.getElementById('bleOtherBtn');
    if (cb) {
      cb.style.display = this.connected ? 'none' : '';
      cb.textContent = (!this.connected && this.savedDeviceName)
        ? '🔗 Подключить ' + this.savedDeviceName
        : '🔗 Подключить сканер';
      cb.disabled = false;
    }
    if (db) db.style.display = this.connected ? '' : 'none';
    if (fb) fb.style.display = (!this.connected && this.savedDeviceName) ? '' : 'none';
    if (ob) ob.style.display = (!this.connected && this.savedDeviceName) ? '' : 'none';
  }
};
```

### 3.2 — Вспомогательные функции UI

```javascript
function openBlePanel()  { ble.updateUI(); document.getElementById('blePanelOverlay').classList.add('active'); }
function closeBlePanel() { document.getElementById('blePanelOverlay').classList.remove('active'); }
function bleConnect()    { ble.connect(); }
function bleDisconnect() { ble.disconnect(); }

function bleSetStatus(html) {
  var el = document.getElementById('bleStatusText');
  if (el) el.innerHTML = html;
}

var _bleToastTimer = null;
function bleToast(msg) {
  var el = document.getElementById('bleToast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  if (_bleToastTimer) clearTimeout(_bleToastTimer);
  _bleToastTimer = setTimeout(function() { el.classList.remove('show'); }, 2500);
}
```

### 3.3 — Обработчик штрих-кода (АДАПТИРОВАТЬ ПОД СВОЁ ПРИЛОЖЕНИЕ)

```javascript
// Вызывается при каждом успешном сканировании с BLE-сканера.
// text — строка со штрих-кодом (уже очищена и дедуплицирована).
// ЗАМЕНИТЕ ТЕЛО ФУНКЦИИ на логику вашего приложения.
function onBLEBarcode(text) {
  bleToast('📦 ' + text);

  // Пример: вставить значение в поле ввода и выполнить поиск
  var input = document.getElementById('barcodeInput');
  if (input) {
    input.value = text;
    // Ваш обработчик поиска:
    // onSearch();
    // processBarcode(text);
    // submitForm();
  }
}
```

### 3.4 — Инициализация при загрузке страницы

```javascript
window.addEventListener('load', function() {
  ble.loadSavedDevice();
  ble.updateUI();
  // Автоматически пробуем переподключиться к последнему устройству
  if (ble.savedDeviceName) {
    ble.reconnect().then(function(ok) {
      if (ok) bleToast('🔗 Автоподключение: ' + ble.savedDeviceName);
    });
  }
});
```

---

## Как это работает (кратко)

```
Сканер (BLE) ──────────────────────────────────────────────────── Браузер
    │                                                                  │
    │  1. requestDevice() → пользователь выбирает в диалоге           │
    │  2. gatt.connect() → устанавливается GATT-соединение            │
    │  3. getPrimaryServices() → получаем список сервисов             │
    │  4. getCharacteristics() → ищем характеристики с notify         │
    │  5. startNotifications() → подписываемся                        │
    │                                                                  │
    │  [нажатие кнопки на сканере]                                     │
    │ ──── characteristicvaluechanged event ────►  onData(dataView)   │
    │                                              onBLEBarcode(text) │
```

При следующем открытии страницы — `getDevices()` возвращает ранее разрешённые устройства, `reconnect()` подключается **без диалога**.

---

## Известные ограничения

| Проблема | Причина | Решение |
|---|---|---|
| На iOS работает только в Bluefy | Safari не поддерживает Web Bluetooth | Установить Bluefy из App Store |
| Сканер показывается в iOS Bluetooth, но не в диалоге браузера | Устройство «спарено» с ОС (нажали «Создать пару») | Зайти в Настройки → Bluetooth → забыть устройство; при повторном подключении нажать «Отмена» вместо «Создать пару» |
| `getDevices()` возвращает пустой массив | Страница не имеет разрешения (другой origin, HTTP вместо HTTPS) | Использовать HTTPS; убедиться что origin совпадает с тем, где давалось разрешение |
| Сканер работает, но приходит мусор | Неверная кодировка | Попробовать `new TextDecoder('windows-1251')` или `'utf-16le'` |
| Один штрих-код приходит дважды | Сканер шлёт два пакета | Увеличить `dedupeMs` (сейчас 2000 мс) |

---

## Минимальная версия (без UI, только данные)

Если не нужна панель управления — достаточно этого:

```javascript
async function connectBLEScanner() {
  const SERVICES = [
    '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
    '0000ffe0-0000-1000-8000-00805f9b34fb',
    '0000dfb0-0000-1000-8000-00805f9b34fb',
  ];

  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: SERVICES
  });
  const server = await device.gatt.connect();
  const services = await server.getPrimaryServices();

  for (const service of services) {
    const chars = await service.getCharacteristics();
    for (const c of chars) {
      if (c.properties.notify || c.properties.indicate) {
        await c.startNotifications();
        c.addEventListener('characteristicvaluechanged', (e) => {
          const text = new TextDecoder().decode(e.target.value).trim();
          if (text.length >= 3) console.log('Barcode:', text);
        });
      }
    }
  }
}
```
