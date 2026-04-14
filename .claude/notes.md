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
