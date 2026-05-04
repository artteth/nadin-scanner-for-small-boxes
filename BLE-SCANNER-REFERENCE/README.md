# BLE Scanner — Справочный пакет

Готовый к использованию модуль для подключения Bluetooth-сканеров штрих-кодов к веб-приложению через Web Bluetooth API.

---

## Содержимое папки

| Файл | Что это |
|---|---|
| `README.md` | Это руководство — читать в первую очередь |
| `01-css.css` | CSS стили (FAB-кнопка, панель, тост) |
| `02-html.html` | HTML разметка (кнопка + панель управления) |
| `03-javascript.js` | JavaScript — вся логика BLE |
| `example-standalone.html` | Рабочий пример: открыть в Chrome на Android — всё работает |

---

## Поддерживаемые браузеры

| Платформа | Браузер | Статус |
|---|---|---|
| Android | Chrome, Edge, Brave | ✅ Полная поддержка |
| iOS / iPadOS | **Bluefy** (App Store) | ✅ Работает только в Bluefy |
| iOS / iPadOS | Safari, Chrome | ❌ Web Bluetooth не поддерживается |
| Windows/Mac | Chrome, Edge | ✅ Работает |
| Firefox | Все версии | ❌ Web Bluetooth не поддерживается |

---

## Быстрый старт

### Шаг 1 — Скопируйте CSS

Вставьте содержимое `01-css.css` в `<style>` вашей страницы или подключите как отдельный файл.

### Шаг 2 — Скопируйте HTML

Вставьте содержимое `02-html.html` перед закрывающим тегом `</body>`.

### Шаг 3 — Скопируйте JavaScript

Вставьте содержимое `03-javascript.js` в `<script>` вашей страницы или как отдельный .js файл.

### Шаг 4 — Адаптируйте функцию обратного вызова

Найдите функцию `onBLEBarcode(text)` и впишите туда, что делать с отсканированным кодом:

```javascript
function onBLEBarcode(text) {
  bleToast('📦 ' + text);  // уведомление — оставьте как есть

  // ВАШ КОД СЮДА:
  document.getElementById('myInput').value = text;
  doSearch(text);
}
```

### Шаг 5 — Добавьте инициализацию

В свой `window.onload` (или `DOMContentLoaded`) добавьте:

```javascript
window.onload = function() {
  // ... ваш код ...

  // BLE инициализация:
  ble.loadSavedDevice();
  ble.updateUI();
  if (ble.savedDeviceName) {
    ble.reconnect().then(function(ok) {
      if (ok) bleToast('🔗 Автоподключение: ' + ble.savedDeviceName);
    });
  }
};
```

---

## Как это работает

### Визуальные компоненты

```
[ ᯤ ]  ← FAB кнопка (фиксированная, внизу справа)
         Серая = не подключён
         Зелёная + пульсация = подключён

При нажатии открывается панель снизу (bottom sheet):
┌─────────────────────────────┐
│ 📡 BLE Сканер           [✕] │
│ ●  Не подключён             │  ← точка статуса
│ [🔗 Подключить сканер]      │  ← главная кнопка
│ ⚠️ Важно для iOS...         │
│ [❓ Сканер не виден в списке]│
│ [🔬 Показать лог]           │
│ [Закрыть]                   │
└─────────────────────────────┘

При получении кода вверху страницы появляется тост:
┌──────────────────┐
│ 📦  4607001234567 │  ← тост (2.5 сек)
└──────────────────┘
```

### Флоу подключения

```
Нажатие "Подключить"
         │
         ▼
Есть savedDeviceName?
    │                 │
   Да                Нет
    │                 │
    ▼                 ▼
getDevices()    requestDevice({acceptAllDevices})
(без диалога)   (диалог выбора)
    │
Устройство найдено?
    │           │
   Да          Нет
    │           │
    ▼           ▼
gatt.connect()  requestDevice({filters:[{name}]})
    │           (диалог с фильтром по имени)
    ▼
setupNotifications()
    │
    ▼
getPrimaryServices()   → при пустом списке →  Fallback: перебор UUID
    │
    ▼
getCharacteristics()
    │
    ▼
startNotifications() на каждой notify/indicate характеристике
    │
    ▼
characteristicvaluechanged → onData() → onBLEBarcode(text)
```

### Авто-переподключение

При обрыве связи (`gattserverdisconnected`):
- Запускается цикл: до **12 попыток**, каждые **5 секунд**
- Каждая попытка вызывает `reconnect()` (без диалога)
- При успехе — тост «Переподключён»
- Если 12 попыток не помогли — статус «Нажмите Подключить вручную»

### Сохранение устройства

Имя последнего успешно подключённого устройства сохраняется в `localStorage` с ключом `bleLastDevice_v1`. При следующем открытии страницы:
- Кнопка показывает имя: «🔗 Подключить Eyoyo-Scanner»
- Автоматически пробует переподключиться без диалога

---

## Поддерживаемые сканеры и протоколы

Модуль охватывает **30+ UUID сервисов** и работает со сканерами на чипах:

| Протокол/Чип | Примеры сканеров |
|---|---|
| Nordic UART (NUS) | Eyoyo, Inateck, Netum, большинство современных |
| HM-10 / CC2541 | Дешёвые китайские BLE-модули |
| Microchip ISSC / Transparent UART | Newland, Generalscan |
| TI SimpleLink | Общие китайские BLE-сканеры |
| Zebra / Honeywell | Корпоративные сканеры |
| Silabs BGX13 | Некоторые промышленные сканеры |
| Microchip RN4870/RN4871 | Roving Networks |

> **Важно:** сканер должен быть в режиме **BLE** (Bluetooth Low Energy), **не** в SPP / HID-Classic режиме.  
> Переключение режима — через специальный служебный штрих-код из инструкции к сканеру.

---

## Типичные проблемы и решения

### Сканер пикает, но коды не приходят (Android)

**Причина:** сканер в SPP-режиме (Bluetooth Classic), а не BLE.

**Решение:** откройте лог диагностики (кнопка «🔬») — если там «Сервисы не найдены», нужно переключить сканер в BLE-режим через служебный штрих-код из инструкции.

### Сканер не виден в списке (iOS / Bluefy)

**Причина:** ранее нажали «Создать пару» в диалоге iOS — устройство привязалось к системе и исчезло из списка Web Bluetooth.

**Решение:**
1. iOS Настройки → Bluetooth → ⓘ рядом со сканером → «Забыть устройство»
2. Вернитесь в приложение → «Подключить»
3. Когда iOS спросит «Создать пару» → нажмите **«Отменить»**

### `getDevices()` возвращает пустой массив

**Причина:** браузер возвращает только устройства, к которым пользователь **уже подключался через этот же сайт**. На новом сайте список всегда пустой.

**Это нормально** — модуль автоматически переходит к диалогу выбора (`requestDevice()`).

### Android: диалог выбора пустой, хотя сканер включён

**Причина:** `acceptAllDevices: true` не показывает устройства, уже спаренные с ОС Android через системные настройки Bluetooth.

**Решение:** сначала **забудьте** устройство в системных настройках Android (Настройки → Bluetooth → удалить сканер), потом подключайтесь через браузер — там оно появится.

### Дублирование кодов

Встроена дедупликация: один и тот же код в течение **2 секунд** игнорируется. Изменить интервал:

```javascript
ble.dedupeMs = 3000; // 3 секунды
```

---

## Настройка и расширение

### Изменить позицию FAB кнопки

```css
/* Переместить влево */
.ble-fab {
  right: auto;
  left: max(20px, calc(env(safe-area-inset-left, 0px) + 16px));
}
```

### Добавить свои UUID сервисов

Если у вас нестандартный сканер с неизвестным UUID (видно в диагностическом логе):

```javascript
// Добавьте в начало массива SERVICES:
ble.SERVICES.unshift('ваш-uuid-здесь-0000-0000-000000000000');
```

### Отключить авто-переподключение

```javascript
// Перед ble.onDisconnect или в инициализации:
ble._reconnectMax = 0;
```

### Обработать подключение/отключение в своём коде

```javascript
// Перехватите функции (вызовите оригинал + добавьте своё):
var _origUpdateUI = ble.updateUI.bind(ble);
ble.updateUI = function() {
  _origUpdateUI();
  if (ble.connected) {
    console.log('Сканер подключён:', ble.device.name);
    // например, скрыть клавиатуру
  }
};
```

---

## Минимальная интеграция (3 шага)

Если нужна самая простая версия без лишнего UI:

```html
<!DOCTYPE html>
<html>
<head>
  <!-- Минимально нужный CSS: только FAB и тост -->
  <style>
    .ble-fab { position:fixed; bottom:20px; right:20px; z-index:9999; width:50px; height:50px; border-radius:50%; border:none; background:#e5e7eb; font-size:22px; cursor:pointer; box-shadow:0 4px 16px rgba(0,0,0,0.2); }
    .ble-fab.ble-connected { background:#15803d; color:white; }
    .ble-toast { position:fixed; top:14px; left:50%; transform:translateX(-50%) translateY(-80px); background:#1e293b; color:white; padding:10px 20px; border-radius:20px; font-size:14px; pointer-events:none; transition:transform .3s; }
    .ble-toast.show { transform:translateX(-50%) translateY(0); }
    /* Минимальная панель */
    .ble-panel-overlay { position:fixed; inset:0; z-index:9998; background:rgba(0,0,0,.5); display:none; align-items:flex-end; }
    .ble-panel-overlay.active { display:flex; }
    .ble-panel { background:white; width:100%; padding:20px; border-radius:20px 20px 0 0; }
    .ble-btn { display:block; width:100%; padding:12px; border:none; border-radius:10px; font-size:15px; font-weight:600; cursor:pointer; margin-top:8px; }
    .ble-btn-primary { background:#2563eb; color:white; }
    .ble-btn-danger { background:#dc2626; color:white; }
    .ble-btn-secondary { background:#f3f4f6; }
    .ble-dot { width:12px; height:12px; border-radius:50%; background:#d1d5db; display:inline-block; margin-right:8px; }
    .ble-dot.on { background:#15803d; }
  </style>
</head>
<body>
  <input id="barcodeInput" placeholder="Штрих-код">

  <!-- BLE HTML -->
  <button id="bleFab" class="ble-fab" onclick="openBlePanel()">ᯤ</button>
  <div id="blePanelOverlay" class="ble-panel-overlay" onclick="if(event.target===this)closeBlePanel()">
    <div class="ble-panel">
      <div><span class="ble-dot" id="bleDot"></span><span id="bleStatusText">Не подключён</span></div>
      <div id="bleDeviceName" style="display:none;font-size:13px;color:#888;margin:4px 0 0 20px"></div>
      <button id="bleConnectBtn" class="ble-btn ble-btn-primary" onclick="bleConnect()">🔗 Подключить сканер</button>
      <button id="bleDisconnectBtn" class="ble-btn ble-btn-danger" onclick="bleDisconnect()" style="display:none">⛔ Отключить</button>
      <button id="bleOtherBtn" class="ble-btn ble-btn-secondary" onclick="ble.connectManual()" style="display:none">🔍 Другой сканер</button>
      <button id="bleForgetBtn" class="ble-btn ble-btn-secondary" onclick="ble.forgetDevice()" style="display:none">🗑 Забыть</button>
      <button class="ble-btn ble-btn-secondary" onclick="closeBlePanel()">Закрыть</button>
    </div>
  </div>
  <div id="bleToast" class="ble-toast"></div>

  <script src="03-javascript.js"></script>
  <script>
    // Ваша функция обработки штрих-кода:
    function onBLEBarcode(text) {
      bleToast('📦 ' + text);
      document.getElementById('barcodeInput').value = text;
      // onSearch(); // вызовите вашу функцию
    }

    window.addEventListener('DOMContentLoaded', function() {
      ble.loadSavedDevice();
      ble.updateUI();
      if (ble.savedDeviceName) {
        ble.reconnect().then(function(ok) { if (ok) bleToast('🔗 ' + ble.savedDeviceName); });
      }
    });
  </script>
</body>
</html>
```

---

## API reference

| Функция | Описание |
|---|---|
| `ble.connect()` | Подключиться (с авто-попыткой без диалога, потом диалог) |
| `ble.connectManual()` | Всегда показывает диалог выбора |
| `ble.disconnect()` | Ручное отключение |
| `ble.forgetDevice()` | Удалить сохранённое устройство |
| `ble.loadSavedDevice()` | Загрузить имя из localStorage (вызвать при init) |
| `ble.updateUI()` | Обновить все UI элементы вручную |
| `bleConnect()` | Алиас для `ble.connect()` |
| `bleDisconnect()` | Алиас для `ble.disconnect()` |
| `bleToast(msg)` | Показать тост-уведомление |
| `bleSetStatus(html)` | Установить текст статуса в панели |
| `openBlePanel()` | Открыть панель управления |
| `closeBlePanel()` | Закрыть панель управления |
| `onBLEBarcode(text)` | **Ваша функция** — вызывается при каждом штрих-коде |

| Свойство | Тип | Описание |
|---|---|---|
| `ble.connected` | boolean | Текущее состояние подключения |
| `ble.device` | BluetoothDevice | Объект устройства (null если не подключён) |
| `ble.savedDeviceName` | string | Имя сохранённого устройства |
| `ble.dedupeMs` | number | Интервал дедупликации в мс (по умолчанию 2000) |
| `ble.diag` | string[] | Массив строк диагностического лога |
