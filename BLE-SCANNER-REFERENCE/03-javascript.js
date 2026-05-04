// ════════════════════════════════════════════════════════════════
//  BLE SCANNER — JavaScript
//  Вставьте этот код в конец <script> вашей страницы или в отдельный .js файл.
//  Единственная функция, которую НУЖНО адаптировать под свой проект:
//    onBLEBarcode(text) — вызывается при каждом считанном штрих-коде.
// ════════════════════════════════════════════════════════════════

// ── BLE-объект: всё состояние и логика подключения ──
var ble = {
  device: null,
  server: null,
  connected: false,
  lastText: '',
  lastTime: 0,
  dedupeMs: 2000,           // мс: повторный код в течение этого времени игнорируется
  savedDeviceName: '',
  BLE_DEV_KEY: 'bleLastDevice_v1',  // ключ в localStorage
  _manualDisconnect: false,
  _reconnectTimer: null,
  _reconnectAttempts: 0,
  _reconnectMax: 12,
  _reconnectIntervalMs: 5000,

  // ── UUID сервисов BLE ──
  // Покрывает большинство сканеров на рынке.
  // ВАЖНО для Android Chrome: все нужные UUID должны быть в optionalServices,
  // иначе Chrome не даст к ним доступ (SecurityError).
  SERVICES: [
    // Nordic UART (NUS) — самый распространённый (Eyoyo, Inateck, Netum и др.)
    '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
    '6e400002-b5a3-f393-e0a9-e50e24dcca9e', // NUS TX
    '6e400003-b5a3-f393-e0a9-e50e24dcca9e', // NUS RX
    // HM-10 / CC2541 — дешёвые китайские BLE-модули
    '0000ffe0-0000-1000-8000-00805f9b34fb',
    '0000ffe1-0000-1000-8000-00805f9b34fb',
    '0000ffe2-0000-1000-8000-00805f9b34fb',
    '0000ffe3-0000-1000-8000-00805f9b34fb',
    // Zebra, Honeywell, Silabs BGX
    '0000dfb0-0000-1000-8000-00805f9b34fb',
    '0000dfb1-0000-1000-8000-00805f9b34fb',
    '0000dfb2-0000-1000-8000-00805f9b34fb',
    // Microchip ISSC / Transparent UART (Newland, Generalscan)
    '49535343-fe7d-4ae5-8fa9-9fafd205e455',
    '49535343-1e4d-4bd9-ba61-23c647249616',
    '49535343-8841-43f4-a8d4-ecbe34729bb3',
    '49535343-4c8a-39b3-2f49-511cff073b7e',
    '49535343-aca3-481c-91ec-d85e28a60318',
    // TI SimpleLink / общие китайские сканеры
    '0000fff0-0000-1000-8000-00805f9b34fb',
    '0000fff1-0000-1000-8000-00805f9b34fb',
    '0000fff2-0000-1000-8000-00805f9b34fb',
    '0000fff3-0000-1000-8000-00805f9b34fb',
    '0000fff4-0000-1000-8000-00805f9b34fb',
    '0000fff5-0000-1000-8000-00805f9b34fb',
    '0000fff6-0000-1000-8000-00805f9b34fb',
    // Silabs BGX13
    'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
    'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f',
    // Roving Networks / Microchip RN4870/RN4871
    '49535343-c9d0-cc83-a44a-6fe238d06d33',
    // Telit serial
    '0000fefb-0000-1000-8000-00805f9b34fb',
    // Symbol / Zebra SSI
    '453a1000-63b1-c3d4-4a5c-87e5b40a74a1',
    '453a1001-63b1-c3d4-4a5c-87e5b40a74a1',
    // Generic шаблонные UUID (Netum-C, Eyoyo и др.)
    '0000fee0-0000-1000-8000-00805f9b34fb',
    '0000fee1-0000-1000-8000-00805f9b34fb',
    '0000fee7-0000-1000-8000-00805f9b34fb',
    '0000fee8-0000-1000-8000-00805f9b34fb',
    '0000fee9-0000-1000-8000-00805f9b34fb',
    '0000feea-0000-1000-8000-00805f9b34fb',
    // Standard: Device Information + Battery
    // HID (0x1812), Generic Access/Attribute (0x1800/0x1801) — в блоклисте Chrome, не добавляем!
    '0000180a-0000-1000-8000-00805f9b34fb', // Device Information
    '0000180f-0000-1000-8000-00805f9b34fb', // Battery
  ],

  // ── Диагностика ──
  diag: [],
  diagLog: function(msg) {
    var t = new Date().toTimeString().slice(0,8);
    this.diag.push('[' + t + '] ' + msg);
    if (this.diag.length > 50) this.diag.shift();
    bleRenderDiag();
  },
  diagClear: function() { this.diag = []; bleRenderDiag(); },

  // ── Сохранение / загрузка имени устройства ──
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

  // ── Авто-переподключение через getDevices() ──
  // Не показывает диалог выбора — работает тихо.
  // Работает только для устройств, к которым пользователь уже подключался в этом браузере.
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

      // Вариант 1: прямое подключение (если сканер рядом и не спит)
      try {
        this.server = await found.gatt.connect();
        await this.setupNotifications();
        this.connected = true;
        this.saveDevice();
        this.updateUI();
        return true;
      } catch(directErr) {}

      // Вариант 2: ждём рекламу (для спаренных устройств, не отвечающих напрямую)
      if (!found.watchAdvertisements) return false;

      return await new Promise(function(resolve) {
        var timer = setTimeout(function() {
          try { found.stopWatchingAdvertisements(); } catch(e) {}
          resolve(false);
        }, 8000);

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

  // ── Основное подключение (показывает диалог выбора устройства) ──
  connect: async function() {
    if (!navigator.bluetooth) {
      bleSetStatus('⚠️ Web Bluetooth не поддерживается.<br>iOS → Bluefy, Android → Chrome/Edge.');
      return;
    }
    this.diagClear();
    this.diagLog('▶ Старт подключения. UA: ' + (navigator.userAgent.match(/Android|iPhone|iPad/i) || ['?'])[0]);
    var btn = document.getElementById('bleConnectBtn');
    if (btn) { btn.textContent = '⏳ Подключение...'; btn.disabled = true; }

    // Шаг 1: пробуем авто-переподключение без диалога
    var reconnected = await this.reconnect();
    if (reconnected) {
      closeBlePanel();
      bleToast('🔗 Автоподключение: ' + (this.device.name || 'Сканер'));
      return;
    }

    // Шаг 2: диалог выбора устройства
    // Если есть сохранённое имя — показываем фильтр по имени:
    // это позволяет видеть уже спаренные с ОС устройства (acceptAllDevices их скрывает).
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
      this.stopAutoReconnect();
      this.saveDevice();
      this.updateUI();
      closeBlePanel();
      bleToast('🔗 Подключён: ' + (this.device.name || 'Сканер'));
    } catch(e) {
      if (e.name === 'NotFoundError' && this.savedDeviceName) {
        bleSetStatus('«' + this.savedDeviceName + '» не найден рядом.<br>Попробуйте «Выбрать другой сканер» или убедитесь, что сканер включён.');
      } else if (e.name !== 'NotFoundError') {
        bleSetStatus('⚠️ ' + (e.message || e));
      }
      if (btn) { btn.textContent = '🔗 Подключить ' + (this.savedDeviceName || 'сканер'); btn.disabled = false; }
      this.updateUI();
    }
  },

  // ── Настройка подписки на характеристики (GATT notifications) ──
  setupNotifications: async function() {
    // Android Chrome: нужна пауза между gatt.connect() и getPrimaryServices(),
    // иначе часто возвращает пустой список.
    await new Promise(function(r) { setTimeout(r, 600); });

    this.diagLog('🔗 GATT connected. Поиск сервисов...');

    var services = [];
    try {
      services = await this.server.getPrimaryServices();
      this.diagLog('📋 getPrimaryServices(): найдено ' + services.length);
    } catch(e) {
      this.diagLog('⚠️ getPrimaryServices() ошибка: ' + (e.message || e));
    }

    // Fallback: Chrome иногда возвращает [] из общего вызова,
    // но отдаёт сервис при прямом запросе по UUID.
    if (!services || services.length === 0) {
      this.diagLog('🔄 Fallback: перебор по UUID…');
      var found = [];
      for (var ui = 0; ui < this.SERVICES.length; ui++) {
        try {
          var svc = await this.server.getPrimaryService(this.SERVICES[ui]);
          if (svc) { found.push(svc); this.diagLog('  ✅ ' + this.SERVICES[ui]); }
        } catch(e) {}
      }
      services = found;
      this.diagLog('📋 Fallback итог: ' + services.length);
    }

    if (!services || services.length === 0) {
      this.diagLog('❌ Сервисы не найдены. Сканер может быть в SPP-режиме (не BLE).');
      this.diagLog('💡 Переключите сканер в BLE-режим через служебный штрих-код из инструкции.');
      return;
    }

    var subscribed = 0;
    for (var si = 0; si < services.length; si++) {
      var svcUuid = services[si].uuid;
      this.diagLog('— Сервис: ' + svcUuid);
      var chars;
      try {
        chars = await services[si].getCharacteristics();
      } catch(e) {
        this.diagLog('  ⚠️ getCharacteristics: ' + (e.message || e));
        continue;
      }
      for (var ci = 0; ci < chars.length; ci++) {
        var c = chars[ci];
        var p = c.properties;
        var flags = (p.notify ? 'N' : '') + (p.indicate ? 'I' : '') + (p.read ? 'R' : '') + (p.write ? 'W' : '') + (p.writeWithoutResponse ? 'w' : '');
        this.diagLog('  • ' + c.uuid.slice(0,8) + '… [' + flags + ']');
        if (p.notify || p.indicate) {
          try {
            await c.startNotifications();
            c.addEventListener('characteristicvaluechanged', (function(ch) {
              return function(e) { ble.onData(e.target.value); };
            })(c));
            subscribed++;
            this.diagLog('    🔔 подписка ok');
          } catch(e) {
            this.diagLog('    ⚠️ startNotifications: ' + (e.message || e));
          }
        }
      }
    }

    if (subscribed === 0) {
      this.diagLog('❌ Ни одна характеристика notify/indicate не подписана.');
    } else {
      this.diagLog('✅ Подписано: ' + subscribed + ' характеристик. Можно сканировать!');
    }
  },

  // ── Обработчик входящих данных от сканера ──
  onData: function(dataView) {
    try {
      // Лог raw hex для диагностики
      try {
        var bytes = new Uint8Array(dataView.buffer);
        var hex = '';
        for (var bi = 0; bi < bytes.length && bi < 16; bi++) {
          hex += (bytes[bi] < 16 ? '0' : '') + bytes[bi].toString(16) + ' ';
        }
        this.diagLog('📥 ' + bytes.length + ' байт: ' + hex.trim());
      } catch(e) {}

      var decoder = new TextDecoder('utf-8');
      var text = decoder.decode(dataView)
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '') // убираем управляющие символы
        .trim();

      if (!text || text.length < 3) return; // слишком короткий — пропускаем

      // Дедупликация: один и тот же код за 2 секунды — игнорируем
      var now = Date.now();
      if (text === this.lastText && (now - this.lastTime) < this.dedupeMs) return;
      this.lastText = text;
      this.lastTime = now;

      // ══ ТОЧКА ИНТЕГРАЦИИ ══
      // Здесь вызывается ваша функция обработки штрих-кода.
      onBLEBarcode(text);
    } catch(e) {}
  },

  // ── Ручное отключение ──
  disconnect: function() {
    this._manualDisconnect = true;
    this.stopAutoReconnect();
    try {
      if (this.device && this.device.gatt && this.device.gatt.connected) {
        this.device.gatt.disconnect();
      }
    } catch(e) {}
    this.onDisconnect();
  },

  // ── Обработчик обрыва связи ──
  onDisconnect: function() {
    this.connected = false;
    this.device = null;
    this.server = null;
    this.updateUI();
    bleToast('⛔ BLE сканер отключён');
    if (!this._manualDisconnect && this.savedDeviceName) {
      this.startAutoReconnect();
    }
    this._manualDisconnect = false;
  },

  // ── Авто-переподключение после обрыва ──
  startAutoReconnect: function() {
    this.stopAutoReconnect();
    this._reconnectAttempts = 0;
    bleSetStatus('🔄 Переподключение... (0/' + this._reconnectMax + ')');
    this._scheduleReconnect();
  },
  stopAutoReconnect: function() {
    if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
  },
  _scheduleReconnect: function() {
    var self = this;
    this._reconnectTimer = setTimeout(async function() {
      self._reconnectTimer = null;
      if (self.connected || self._manualDisconnect) return;
      self._reconnectAttempts++;
      bleSetStatus('🔄 Переподключение... (' + self._reconnectAttempts + '/' + self._reconnectMax + ')');
      var ok = await self.reconnect();
      if (ok) {
        bleToast('🔗 Переподключён: ' + (self.savedDeviceName || 'сканер'));
      } else if (!self.connected && !self._manualDisconnect && self._reconnectAttempts < self._reconnectMax) {
        self._scheduleReconnect();
      } else if (!self.connected) {
        bleSetStatus('⛔ Сканер не отвечает. Нажмите «Подключить» вручную.');
      }
    }, this._reconnectIntervalMs);
  },

  // ── Обновление UI ──
  updateUI: function() {
    var fab = document.getElementById('bleFab');
    if (fab) {
      this.connected ? fab.classList.add('ble-connected') : fab.classList.remove('ble-connected');
    }
    var dot = document.getElementById('bleDot');
    if (dot) {
      this.connected ? dot.classList.add('on') : dot.classList.remove('on');
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
  },

  // ── Подключить другое устройство (всегда показывает диалог выбора) ──
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
      this.stopAutoReconnect();
      this.saveDevice();
      this.updateUI();
      closeBlePanel();
      bleToast('🔗 Подключён: ' + (this.device.name || 'Сканер'));
    } catch(e) {
      if (e.name !== 'NotFoundError') bleSetStatus('⚠️ ' + (e.message || e), false);
      if (btn) { btn.textContent = '🔍 Выбрать другой сканер'; btn.disabled = false; }
      this.updateUI();
    }
  }
};


// ════════════════════════════════════════════════════════════════
//  ★ АДАПТИРУЙТЕ ЭТУ ФУНКЦИЮ ПОД ВАШ ПРОЕКТ ★
//  Вызывается при каждом отсканированном штрих-коде.
//  text — строка с кодом (уже декодирована, дедуплицирована).
// ════════════════════════════════════════════════════════════════
function onBLEBarcode(text) {
  bleToast('📦 ' + text);

  // ── Пример: вставляем в поле ввода и запускаем поиск ──
  var input = document.getElementById('barcodeInput');
  if (input) {
    input.value = text;
    // Вызовите свою функцию обработки:
    // onSearch();          // или
    // handleBarcode(text); // замените на свою
  }
}


// ── Утилиты диагностики ──
function bleRenderDiag() {
  var el = document.getElementById('bleDiagLog');
  if (!el) return;
  if (!ble.diag || !ble.diag.length) { el.textContent = ''; return; }
  el.textContent = ble.diag.join('\n');
  el.scrollTop = el.scrollHeight;
}
function bleToggleDiag() {
  var box = document.getElementById('bleDiagBox');
  var btn = document.getElementById('bleDiagToggleBtn');
  if (!box) return;
  var open = box.style.display !== 'none';
  box.style.display = open ? 'none' : '';
  if (btn) btn.textContent = open ? '🔬 Показать лог диагностики' : '🔬 Скрыть лог диагностики';
  if (!open) bleRenderDiag();
}
function bleCopyDiag() {
  var text = (ble.diag || []).join('\n');
  if (!text) { bleToast('Лог пуст'); return; }
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function() { bleToast('📋 Лог скопирован'); });
    } else {
      var ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
      bleToast('📋 Лог скопирован');
    }
  } catch(e) { bleToast('⚠️ Не удалось скопировать'); }
}

// ── UI-функции панели ──
function openBlePanel() {
  ble.updateUI();
  document.getElementById('blePanelOverlay').classList.add('active');
}
function closeBlePanel() {
  document.getElementById('blePanelOverlay').classList.remove('active');
}
function bleConnect()    { ble.connect(); }
function bleDisconnect() { ble.disconnect(); }

function bleSetStatus(html, isOk) {
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

// ── Инициализация при загрузке страницы ──
// Вызовите это в своём window.onload (или после DOMContentLoaded):
//
//   ble.loadSavedDevice();
//   ble.updateUI();
//   if (ble.savedDeviceName) {
//     ble.reconnect().then(function(ok) {
//       if (ok) bleToast('🔗 Автоподключение: ' + ble.savedDeviceName);
//     });
//   }
