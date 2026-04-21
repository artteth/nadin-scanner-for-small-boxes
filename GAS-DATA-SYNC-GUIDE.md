# Инструкция: Google Sheets → Google Apps Script → веб-приложение

Эта инструкция объясняет, как подключить веб-приложение к данным из Google Таблицы через Google Apps Script (GAS), используя тот же подход, что и в проекте nadin-scanner-for-small-boxes.

Вы сможете получить в свой JavaScript:
- список штрих-кодов с привязкой к моделям
- статусы и дополнительные поля по каждой модели
- ссылки на фото

---

## Часть 1 — Структура Google Таблицы

### Таблица 1: основные данные (пример — ваша таблица с товарами)

Создайте или используйте готовую таблицу. В ней должны быть два листа:

#### Лист «Спецификация» — штрих-коды

| Колонка | Что хранить |
|---|---|
| **A** | Артикул / модель (строки начиная с **5-й**) |
| **C** | Штрих-код EAN-13 / любой |

Строки 1–4 — заголовки или служебные данные, данные начинаются с **строки 5**.

#### Лист «WB» — основные данные по моделям

| Колонка | Что хранить |
|---|---|
| **C** (col 3) | Тип изделия |
| **D** (col 4) | Артикул / модель — совпадает с колонкой A в «Спецификации» |
| **AQ** (col 43) | Булев статус (TRUE/FALSE) — например «упаковано» |
| **AS** (col 45) | Строка — дополнительное поле (например «тип упаковки») |

Данные начинаются с **строки 6**.

> Адаптация: если ваши колонки другие — измените номера в GAS-коде (см. Часть 2).

#### Лист «ФОРМУЛЫ/выпадающие списки» — списки для выбора

| Колонка | Что хранить |
|---|---|
| **AD** (col 30) | Список значений для выпадающего списка (строки начиная с **3-й**) |

### Таблица 2: фотографии (может быть отдельной таблицей)

#### Лист «WB_Cards»

| Колонка | Что хранить |
|---|---|
| **F** (col 6) | Артикул / модель |
| **N** (col 14) | URL фото (или несколько через запятую — берётся первый) |

Данные начинаются со **строки 2**.

---

## Часть 2 — Google Apps Script (серверный код)

### 2.1 Как создать GAS-проект

1. Откройте вашу Google Таблицу.
2. Меню **Расширения → Apps Script**.
3. Удалите стандартный код, вставьте код ниже.
4. Нажмите **Сохранить** (Ctrl+S).

### 2.2 Полный код GAS

```javascript
// =====================================================================
// НАСТРОЙКИ — замените ID таблиц на свои
// =====================================================================
const SPREADSHEET_ID = "ВАШ_ID_ТАБЛИЦЫ_1";          // основная таблица
const PHOTO_SPREADSHEET_ID = "ВАШ_ID_ТАБЛИЦЫ_ФОТО"; // таблица с фото
                                                      // (если одна таблица — укажите тот же ID)

const SHEET_NAME       = "WB";            // лист с основными данными
const SPEC_SHEET_NAME  = "Спецификация";  // лист со штрих-кодами
const SPEC_DATA_START_ROW = 5;            // с какой строки начинаются данные в Спецификации
const PHOTO_SHEET_NAME = "WB_Cards";      // лист с фото

// =====================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// =====================================================================

function getSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getPhotoSpreadsheet() {
  return SpreadsheetApp.openById(PHOTO_SPREADSHEET_ID);
}

/** Возвращает объект { артикул: urlФото } */
function getPhotoMapping() {
  try {
    const sheet = getPhotoSpreadsheet().getSheetByName(PHOTO_SHEET_NAME);
    if (!sheet) return {};

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return {};

    // Колонки F(6) по N(14) = 9 колонок. row[0]=F (артикул), row[8]=N (urls)
    const data = sheet.getRange(2, 6, lastRow - 1, 9).getValues();

    const mapping = {};
    data.forEach(row => {
      const vendorCode = row[0];
      const photoUrls  = row[8];
      if (vendorCode && photoUrls) {
        const urls = photoUrls.toString().split(',');
        if (urls.length > 0 && urls[0].trim()) {
          mapping[vendorCode] = urls[0].trim(); // берём первый URL
        }
      }
    });
    return mapping;
  } catch(e) {
    return {};
  }
}

// =====================================================================
// ТОЧКА ВХОДА: doGet() обрабатывает все HTTP-запросы
// =====================================================================

function doGet(e) {
  const params   = e ? e.parameter : {};
  const action   = params ? params.action   : null;
  const callback = params ? (params.callback || '') : '';

  // JSONP: если передан параметр callback — оборачиваем ответ в callback(data)
  const sendResult = (data) => {
    const json = JSON.stringify(data);
    if (callback) {
      return ContentService
        .createTextOutput(callback + '(' + json + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService
      .createTextOutput(json)
      .setMimeType(ContentService.MimeType.JSON);
  };

  if (action === 'getAllBarcodes') {
    try   { return sendResult(getAllBarcodes()); }
    catch (err) { return sendResult({ error: err.message }); }
  }

  if (action === 'saveItem') {
    try {
      const model    = params.model    || '';
      const repacked = params.repacked === 'true';
      const packType = params.packType || '';
      return sendResult(saveItem(model, repacked, packType));
    } catch(err) { return sendResult({ error: err.message }); }
  }

  // Если нужны другие экшены — добавьте сюда

  return sendResult({ error: 'Unknown action: ' + action });
}

// =====================================================================
// ГЛАВНАЯ ФУНКЦИЯ: возвращает все данные одним запросом
// =====================================================================

/**
 * Возвращает:
 * {
 *   barcodes: {
 *     "штрих-код": {
 *       model:    "артикул",
 *       repacked: true/false,
 *       packType: "строка",
 *       type:     "тип изделия",
 *       photoUrl: "https://..." или null
 *     },
 *     ...
 *   },
 *   packTypes: ["вариант1", "вариант2", ...]
 * }
 */
function getAllBarcodes() {
  try {
    const ss = getSpreadsheet();

    // --- 1. Спецификация: штрих-код → артикул ---
    const specSheet = ss.getSheetByName(SPEC_SHEET_NAME);
    if (!specSheet) return { error: 'Лист "Спецификация" не найден' };

    const lastSpecRow = specSheet.getLastRow();
    if (lastSpecRow < SPEC_DATA_START_ROW) return { barcodes: {}, packTypes: [] };

    const numSpecRows = lastSpecRow - SPEC_DATA_START_ROW + 1;
    const specData = specSheet.getRange(SPEC_DATA_START_ROW, 1, numSpecRows, 3).getValues();
    // row[0] = A (артикул), row[2] = C (штрих-код)

    const barcodeToModel = {};
    specData.forEach(row => {
      const model   = row[0];
      const barcode = row[2];
      if (barcode && model) {
        barcodeToModel[barcode.toString().trim()] = model.toString().trim();
      }
    });

    // --- 2. Лист WB: артикул → статус + тип ---
    const wbSheet = ss.getSheetByName(SHEET_NAME);
    if (!wbSheet) return { error: 'Лист "' + SHEET_NAME + '" не найден' };

    const lastWbRow = wbSheet.getLastRow();
    if (lastWbRow < 6) return { barcodes: {}, packTypes: [] };

    const numWbRows = lastWbRow - 5;
    const wbData = wbSheet.getRange(6, 1, numWbRows, 45).getValues();
    // row[3]=D (артикул), row[2]=C (тип), row[42]=AQ (статус), row[44]=AS (packType)

    const modelStatus = {};
    wbData.forEach(row => {
      const model = row[3];
      if (model) {
        const repacked = row[42];
        const packType = row[44];
        const isPacked = repacked === true || repacked === 1
                      || repacked === 'TRUE' || repacked === 'true';
        modelStatus[model.toString().trim()] = {
          repacked: isPacked,
          packType: packType ? packType.toString() : '',
          type:     (row[2] || '').toString()
        };
      }
    });

    // --- 3. Фотографии ---
    const photoMapping = getPhotoMapping();

    // --- 4. Сборка итогового объекта ---
    const result = {};
    Object.keys(barcodeToModel).forEach(barcode => {
      const model  = barcodeToModel[barcode];
      const status = modelStatus[model] || { repacked: false, packType: '', type: '' };
      result[barcode] = {
        model:    model,
        repacked: status.repacked,
        packType: status.packType,
        type:     status.type,
        photoUrl: photoMapping[model] || null
      };
    });

    // --- 5. Список вариантов из выпадающего списка ---
    const packTypes = [];
    try {
      const formulaSheet = ss.getSheetByName('ФОРМУЛЫ/выпадающие списки');
      if (formulaSheet) {
        const lastRow = formulaSheet.getLastRow();
        if (lastRow >= 3) {
          const numRows = lastRow - 2;
          // AD = колонка 30
          const data = formulaSheet.getRange(3, 30, numRows, 1).getValues();
          data.forEach(row => {
            const val = row[0];
            if (val && val.toString().trim()) packTypes.push(val.toString().trim());
          });
        }
      }
    } catch(e) {
      // Не критично — клиент может использовать жёсткий список
    }

    return { barcodes: result, packTypes: packTypes };
  } catch(e) {
    return { error: e.message };
  }
}

// =====================================================================
// СОХРАНЕНИЕ ДАННЫХ
// =====================================================================

/**
 * Сохраняет статус и packType по артикулу.
 * Вызывается из фронтенда через apiCall('saveItem', { model, repacked, packType })
 */
function saveItem(model, repacked, packType) {
  if (!model) return { success: false, error: 'Модель не указана' };

  const sheet = getSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) return { success: false, error: 'Лист "' + SHEET_NAME + '" не найден' };

  const lastRow = sheet.getLastRow();
  if (lastRow < 6) return { success: false, error: 'Нет данных' };

  const numRows = lastRow - 5;
  const data    = sheet.getRange(6, 4, numRows, 1).getValues(); // колонка D

  for (let i = 0; i < data.length; i++) {
    const rowModel = data[i][0];
    if (rowModel && rowModel.toString().trim() === model.toString().trim()) {
      const rowNum = 6 + i;
      sheet.getRange(rowNum, 43).setValue(repacked === true); // AQ
      sheet.getRange(rowNum, 45).setValue(packType || '');    // AS
      return { success: true };
    }
  }

  return { success: false, error: 'Модель "' + model + '" не найдена' };
}
```

### 2.3 Адаптация под другую структуру таблицы

Если ваши данные расположены в других колонках или строках — измените только эти константы/индексы:

| Что | Где в коде | По умолчанию |
|---|---|---|
| Лист с основными данными | `SHEET_NAME` | `"WB"` |
| Лист со штрих-кодами | `SPEC_SHEET_NAME` | `"Спецификация"` |
| С какой строки данные в Спецификации | `SPEC_DATA_START_ROW` | `5` |
| Колонка артикула в Спецификации | `row[0]` в `specData.forEach` | A = индекс 0 |
| Колонка штрих-кода в Спецификации | `row[2]` в `specData.forEach` | C = индекс 2 |
| С какой строки данные в WB | `getRange(6, 1, ...)` | строка 6 |
| Колонка типа в WB | `row[2]` в `wbData.forEach` | C = индекс 2 |
| Колонка артикула в WB | `row[3]` в `wbData.forEach` | D = индекс 3 |
| Колонка статуса в WB | `row[42]` / `getRange(rowNum, 43)` | AQ = индекс 42 |
| Колонка packType в WB | `row[44]` / `getRange(rowNum, 45)` | AS = индекс 44 |
| Колонка артикула в WB_Cards | `row[0]` — F с индексом 0 | F = col 6, первая в диапазоне |
| Колонка URL в WB_Cards | `row[8]` — N с индексом 8 | N = col 14, девятая в диапазоне |

**Формула индекса:** колонка A = индекс 0, B = 1, ..., Z = 25, AA = 26, AB = 27, ..., AQ = 42, AS = 44.

---

## Часть 3 — Деплой GAS как веб-приложение

1. В редакторе Apps Script нажмите **Развернуть → Новое развёртывание**.
2. Тип — **Веб-приложение**.
3. Параметры:
   - **Выполнять от имени**: «Меня» (your account)
   - **Кто имеет доступ**: «Все» (Anyone)
4. Нажмите **Развернуть**.
5. Скопируйте выданный URL вида:
   ```
   https://script.google.com/macros/s/AKfycb.../exec
   ```
6. Вставьте этот URL в свой фронтенд (константа `APPS_SCRIPT_URL`).

> **Важно:** При изменении кода GAS нужно создавать **новое развёртывание** (не редактировать существующее), иначе изменения не применятся.

---

## Часть 4 — Фронтенд JavaScript

### 4.1 Константа и JSONP-функция

```javascript
// URL вашего GAS-деплоя
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/ВАША_СТРОКА/exec';

// Кэш: штрих-код → { model, repacked, packType, type, photoUrl }
let barcodeToModel = {};

// JSONP-вызов GAS (обходит CORS без серверного прокси)
let _apiCallId = 0;
function apiCall(action, params) {
  return new Promise(function(resolve) {
    const id  = '_apiCb' + (++_apiCallId);
    const url = new URL(APPS_SCRIPT_URL);
    url.searchParams.set('action',   action);
    url.searchParams.set('callback', id);    // JSONP-параметр
    if (params) {
      Object.keys(params).forEach(k => url.searchParams.set(k, params[k]));
    }

    // GAS вернёт: _apiCb1({ ... }) — браузер выполнит это как JS
    window[id] = function(result) {
      resolve(result);
      delete window[id];
      script.remove();
    };

    const script = document.createElement('script');
    script.src    = url.toString();
    script.onerror = function() {
      resolve({ error: 'Network error' });
      delete window[id];
      script.remove();
    };
    document.head.appendChild(script);
  });
}
```

### 4.2 Загрузка всех данных при старте

```javascript
async function loadAllData() {
  try {
    const result = await apiCall('getAllBarcodes');

    if (result.error) {
      console.error('Ошибка загрузки данных:', result.error);
      return;
    }

    // Сохраняем кэш
    barcodeToModel = result.barcodes || {};

    // Список вариантов для выпадающего списка
    const packTypes = result.packTypes || [];
    console.log('Загружено штрих-кодов:', Object.keys(barcodeToModel).length);
    console.log('Типы упаковки:', packTypes);

  } catch(e) {
    console.error('loadAllData error:', e);
  }
}

// Вызываем при старте страницы
document.addEventListener('DOMContentLoaded', loadAllData);
```

### 4.3 Поиск по штрих-коду

```javascript
function findByBarcode(barcode) {
  const item = barcodeToModel[barcode.trim()];
  if (!item) return null;

  // item = { model, repacked, packType, type, photoUrl }
  return item;
}

// Пример:
const item = findByBarcode('4606190017793');
if (item) {
  console.log('Модель:', item.model);
  console.log('Упаковано:', item.repacked);
  console.log('Тип упаковки:', item.packType);
  console.log('Фото:', item.photoUrl);
}
```

### 4.4 Поиск по артикулу/модели

```javascript
function findByModel(model) {
  const modelLower = model.trim().toLowerCase();
  const key = Object.keys(barcodeToModel).find(bc =>
    barcodeToModel[bc].model.toLowerCase() === modelLower
  );
  return key ? barcodeToModel[key] : null;
}
```

### 4.5 Сохранение данных обратно в таблицу

```javascript
async function saveItem(model, repacked, packType) {
  const result = await apiCall('saveItem', {
    model:    model,
    repacked: repacked ? 'true' : 'false',
    packType: packType || ''
  });

  if (result.success) {
    // Обновляем локальный кэш
    Object.keys(barcodeToModel).forEach(bc => {
      if (barcodeToModel[bc].model === model) {
        barcodeToModel[bc].repacked = repacked;
        barcodeToModel[bc].packType = packType;
      }
    });
    console.log('Сохранено:', model);
  } else {
    console.error('Ошибка сохранения:', result.error);
  }
}
```

---

## Часть 5 — Формат ответа `getAllBarcodes`

```json
{
  "barcodes": {
    "4606190017793": {
      "model":    "арт-001",
      "repacked": false,
      "packType": "",
      "type":     "Джинсы",
      "photoUrl": "https://example.com/photo.jpg"
    },
    "4606190017800": {
      "model":    "арт-002",
      "repacked": true,
      "packType": "Пакет",
      "type":     "Футболка",
      "photoUrl": null
    }
  },
  "packTypes": ["Пакет", "Коробка", "Пленка"]
}
```

---

## Часть 6 — Типичные проблемы

| Проблема | Причина | Решение |
|---|---|---|
| `{ error: "Лист X не найден" }` | Опечатка в имени листа | Проверьте точное имя листа в GAS-коде |
| Данные не обновились после деплоя | Редактировали существующий деплой | Создайте **новое** развёртывание |
| Пустой массив `barcodes: {}` | Данные начинаются не с той строки | Поправьте `SPEC_DATA_START_ROW` и `getRange(6, ...)` |
| `Network error` в консоли браузера | GAS-деплой не опубликован для «всех» | Проверьте настройки доступа при деплое |
| Фото не загружаются | Неверный `PHOTO_SPREADSHEET_ID` или имя листа | Проверьте ID и `PHOTO_SHEET_NAME` |
| CORS-ошибки отсутствуют | JSONP обходит CORS — это нормально | — |
| `photoUrl: null` у всех | Артикул в WB_Cards (col F) не совпадает с артикулом в WB (col D) | Убедитесь что одно и то же значение |

---

## Часть 7 — Краткий чеклист внедрения

- [ ] Создать/подготовить Google Таблицу с нужными листами
- [ ] Узнать ID таблицы (из URL: `docs.google.com/spreadsheets/d/**ID**/edit`)
- [ ] Вставить GAS-код в Apps Script, подставить свои ID таблиц
- [ ] Задеплоить как веб-приложение (доступ: «Все»), скопировать URL
- [ ] Вставить URL в константу `APPS_SCRIPT_URL` во фронтенде
- [ ] Вызвать `loadAllData()` при загрузке страницы
- [ ] Использовать `findByBarcode()` или `findByModel()` для поиска
- [ ] При необходимости вызывать `saveItem()` для записи изменений
