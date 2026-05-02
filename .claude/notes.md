# Заметки по проекту nadin-scanner-for-small-boxes

## ⚠️ Обязательные правила при изменениях

### Версия — обновлять в ДВУХ местах одновременно
Каждый раз когда меняется версия (vXXX) — обновить оба:
1. `<title>` в `<head>`:
   ```html
   <title>Сканер упаковки vXXX</title>
   ```
2. `<h1>` в теле страницы:
   ```html
   <h1 id="pageTitle">📦 Сканер упаковки vXXX</h1>
   ```

---

## Архитектура проекта

- **index.html** — весь фронт (PWA, одна страница)
- **server-code.js** — Google Apps Script (GAS), деплоится отдельно как веб-приложение
- **sw.js** — Service Worker, network-first стратегия
- **manifest.json** — PWA манифест
- **BLE-SCANNER-INTEGRATION.md** — инструкция по интеграции BLE-сканера

### Два способа хостинга:
1. **GitHub Pages** — `https://artteth.github.io/nadin-scanner-for-small-boxes/` — берёт index.html напрямую, обновляется через `git push` в `main`
2. **Google Apps Script** — деплоится вручную, копипаст index.html в GAS-редактор

---

## Ключевые переменные и данные

| Переменная | Где | Описание |
|---|---|---|
| `barcodeToModel` | index.html JS | Главный кэш: штрих-код → { model, repacked, packType, type, photoUrl } |
| `TABLE_PACK_TYPES` | index.html JS | Список типов упаковки (с сервера или фолбэк) |
| `serverPackTypes` | index.html JS | Список с GAS (лист «ФОРМУЛЫ/выпадающие списки», AD, строки 3+) |
| `ble` | index.html JS | Объект BLE-сканера |
| `APPS_SCRIPT_URL` | index.html JS | URL GAS-деплоя |
| `SPREADSHEET_ID` | server-code.js | ID Google Таблицы |

---

## Частые ловушки

### renderPackButtons() — экранирование onclick
Кнопки типов упаковки генерируются динамически. При генерации `onclick`:
```javascript
// НЕПРАВИЛЬНО — JSON.stringify даёт двойные кавычки, ломает HTML-атрибут:
'onclick="selectPack(this,' + JSON.stringify(t) + ')"'

// ПРАВИЛЬНО — esc() заменяет " на &quot;:
var jsonVal = esc(JSON.stringify(t));
'onclick="selectPack(this,' + jsonVal + ')"'
```

### iOS :active не срабатывает в scroll-контейнерах
Фикс — одна строка в JS:
```javascript
document.addEventListener('touchstart', function(){}, {passive: true});
```

### Sticky thead ломается при overflow-x на предке
`.tbl-scroll` не должен иметь `overflow-x: auto` — иначе `position: sticky` на `thead th` перестаёт работать.

### openTableView() — тяжёлый рендер блокирует анимацию
Использовать `setTimeout(fn, 50)` вместо `requestAnimationFrame` — даёт CSS-анимации 50мс стартовать до блокировки потока.

---

## GAS API (server-code.js)

| action | Что делает |
|---|---|
| `getAllBarcodes` | Возвращает `{ barcodes: {...}, packTypes: [...] }` — основной запрос при старте |
| `getData` | Возвращает `{ items: [...], packTypeOptions: [...] }` |
| `saveItem` | Сохраняет repacked + packType по модели |
| `savePackaging` | Сохраняет только packType (старый метод) |
| `lookupBarcode` | Поиск одного штрих-кода |

### Листы Google Таблицы:
- **WB** — основные данные, строки с 6-й; колонки D(модель), C(тип), AQ(repacked), AS(packType)
- **Спецификация** — штрих-коды, строки с 5-й; A(модель), C(штрих-код)
- **ФОРМУЛЫ/выпадающие списки** — AD с 3-й строки = список типов упаковки
- **WB_Cards** (другая таблица) — фото; F(артикул), N(url)

---

## BLE сканер

- Работает на Android в Chrome/Edge/Brave
- На iOS — только через приложение **Bluefy**
- Ключевой момент: на iOS НЕ нажимать «Создать пару» при подключении — иначе устройство пропадает из списка
- Для отвязки: Настройки iOS → Bluetooth → ⓘ → «Забыть устройство»
- Авто-переподключение через `navigator.bluetooth.getDevices()` (без диалога)

---

## История версий (коротко)

| Версия | Что |
|---|---|
| v121 | Три режима камеры + настройки + sticky header fix |
| v122 | Типы упаковки в таблице из реальных данных GAS |
| v123 | BLE: запоминание устройства + авто-реконнект |
| v124 | BLE: фикс iOS спаренных устройств |
| v125 | BLE: инструкция про iOS пару |
| v126 | Типы упаковки из GAS (лист AD) + touch-action:manipulation |
| v127 | setTimeout вместо rAF + iOS :active хак + фото на мобиле |
| v128 | Фикс renderPackButtons: JSON.stringify + esc() |
| v129 | Кнопка ↻ + автообновление + фон. обновление после записи |
| v130 | Поле+кнопка «Найти» в строку, скрытие камер в настройках, история сканирования |
| v131 | Кнопка «Найти» шире на 20% |
| v132 | История: подтверждение очистки + миниатюра фото (fullscreen) + порядок model\|photo\|packType\|status |
| v133 | BLE для Android: расширен SERVICES, per-UUID fallback, задержка 600мс, лог диагностики в панели |
| v134 | Автофокус на поле ввода: два тогла в настройках (master + отключить при BLE) |
| v135 | manifest orientation: "any" + кнопка разблокировки ориентации в настройках |
| v136 | manifest display: "standalone" — фикс чёрной области вокруг нотча |
| v137 | manifest display: "fullscreen" возврат + html background фикс нотча |
| v138 | BLE авто-реконнект при обрыве: до 12 попыток по 5 сек, тогл в настройках |
| v139 | Кнопка принудительного переворота интерфейса 180° (body.ui-flipped) |
| v140 | Сканеры: basic→html5-qrcode, advanced→jsQR HD, ScanBot→реальный Scanbot SDK v8 RTU UI |
| v141 | «Все изделия» оптимизация для слабых устройств (2GB RAM, Android 8): chunked render rAF×50, lazy фото через IntersectionObserver, picker вместо `<select>`, debounce поиска 200мс |

---

## v141 — оптимизация «Все изделия» для слабых устройств

**Цель:** работа на планшете с 2 ГБ ОЗУ, CPU 1.4 ГГц, Android 8.

**Узкие места до оптимизации:**
1. `<select>` в каждой строке (~10–20 опций × N строк = тысячи DOM-узлов). Нативный `<select>` особенно тяжёл в Android 8 webview.
2. Все строки рендерились одним `innerHTML` → блокировка главного потока на сотни мс.
3. Все `<img>` создавались сразу, даже с `loading="lazy"`.
4. Поиск ререндерил всю таблицу на каждый символ (`oninput="renderTableView()"`).

**Что изменено в `index.html`:**
- `renderTableView()` рендерит чанками по 50 строк через `requestAnimationFrame`. Токен `_renderToken` отменяет старый рендер, если пришёл новый запрос.
- Вместо `<select>` в строке — `<div class="tbl-pack-cell">value</div>` с CSS-стрелкой `▾`. Клик открывает общий модальный picker (один на всю таблицу).
- Фото — `<div class="tbl-thumb-lazy" data-src="...">` плейсхолдер. `IntersectionObserver` подменяет на `<img>` при попадании во viewport (rootMargin 200px).
- `tblSearchInput()` debounce 200мс перед `renderTableView()`.
- Убраны `transition: background 0.1s` и `:hover` на tr — не нужны на тач-устройствах.

**Что не тронуто:** GAS-API, формат данных, чекбокс «упаковано», логика сохранения, пагинация (её нет — всё одной таблицей, но рендер теперь не блокирующий).

**Если IntersectionObserver не поддерживается** (древний webview): фолбэк — все картинки грузятся сразу.

---

## BLE: важно про Android Chrome (v133)

**Симптом:** сканер подключается (пикает), но штрих-коды не приходят.

**Почему отличается от iOS/Bluefy:**
- Android Chrome строго фильтрует `getPrimaryServices()` по `optionalServices` из `requestDevice()`. Если сервис не в списке — его как бы нет.
- Chrome держит блоклист для стандартных сервисов: **HID `0x1812`, Generic Access `0x1800`, Generic Attribute `0x1801`**. Их НЕЛЬЗЯ включать в `optionalServices` — иначе `SecurityError`.
- Многие сканеры по умолчанию в режиме **HID** или **SPP (Bluetooth Classic)** — Web Bluetooth их не видит вообще. Пользователь должен переключить в **BLE serial** режим служебным штрих-кодом из инструкции к сканеру.
- Между `gatt.connect()` и `getPrimaryServices()` нужна пауза ~500-600мс, иначе Android иногда возвращает пустой массив.
- Fallback: если `getPrimaryServices()` пусто — перебрать `getPrimaryService(uuid)` по списку.

**Диагностика:** кнопка «🔬 Показать лог диагностики» в панели BLE. Показывает найденные UUID сервисов/характеристик + raw hex входящих пакетов.
