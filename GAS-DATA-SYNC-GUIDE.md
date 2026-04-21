# Инструкция: Google Sheets → Google Apps Script → веб-приложение
# Проект: nadin-scanner-for-small-boxes

Готовая инструкция для переноса связки «Google Таблица → GAS → фронтенд» в другой проект.
Все реальные ID таблиц и URL уже прописаны — можно использовать напрямую.

---

## Реальные данные из рабочего проекта

| Что | Значение |
|---|---|
| **ID основной таблицы** | `1H-cUJKEMAtGTdEdRzxhMV2kpsx51u9TsznyKviTZPsE` |
| **ID таблицы с фото** | `12902ms2HZg8PowDYsRz9sDlRjMYTPxRZ936swd9mrG8` |
| **URL GAS-деплоя** | `https://script.google.com/macros/s/AKfycbwg4XoEi9Gmxv-SY2K_KglrSh64agoFitr6pwCIM9MxubDaq50URogmfDpEkuZc7NBUag/exec` |

Ссылки на сами таблицы:
- Основная таблица: `https://docs.google.com/spreadsheets/d/1H-cUJKEMAtGTdEdRzxhMV2kpsx51u9TsznyKviTZPsE/edit`
- Таблица с фото: `https://docs.google.com/spreadsheets/d/12902ms2HZg8PowDYsRz9sDlRjMYTPxRZ936swd9mrG8/edit`

---

## Часть 1 — Структура Google Таблицы

### Таблица 1 (основная): `1H-cUJKEMAtGTdEdRzxhMV2kpsx51u9TsznyKviTZPsE`

Содержит три листа:

#### Лист «Спецификация» — штрих-коды

| Колонка | Что хранит | Пример |
|---|---|---|
| **A** | Артикул / модель | `арт-001` |
| **C** | Штрих-код EAN-13 | `4606190017793` |

Данные начинаются с **строки 5** (строки 1–4 — заголовки).

#### Лист «WB» — основные данные по моделям

| Колонка | Что хранит | Пример |
|---|---|---|
| **C** (col 3) | Тип изделия | `Джинсы` |
| **D** (col 4) | Артикул / модель | `арт-001` |
| **AQ** (col 43) | Статус упаковки (TRUE/FALSE) | `TRUE` |
| **AS** (col 45) | Тип упаковки | `Пакет` |

Данные начинаются с **строки 6** (строки 1–5 — заголовки).

#### Лист «ФОРМУЛЫ/выпадающие списки» — справочники

| Колонка | Что хранит |
|---|---|
| **AD** (col 30) | Варианты типов упаковки для выпадающего списка |

Данные начинаются с **строки 3**.

---

### Таблица 2 (фото): `12902ms2HZg8PowDYsRz9sDlRjMYTPxRZ936swd9mrG8`

#### Лист «WB_Cards»

| Колонка | Что хранит | Пример |
|---|---|---|
| **F** (col 6) | Артикул / модель | `арт-001` |
| **N** (col 14) | URL фото (или несколько через запятую — берётся первый) | `https://...` |

Данные начинаются со **строки 2**.

---

## Часть 2 — Google Apps Script

### 2.1 Как создать

1. Откройте основную таблицу: `https://docs.google.com/spreadsheets/d/1H-cUJKEMAtGTdEdRzxhMV2kpsx51u9TsznyKviTZPsE/edit`
2. Меню **Расширения → Apps Script**
3. Удалите стандартный код, вставьте код ниже
4. Нажмите **Сохранить**

### 2.2 Полный код GAS (с реальными ID)

```javascript
// =====================================================================
// РЕАЛЬНЫЕ ID ИЗ РАБОЧЕГО ПРОЕКТА
// Для нового проекта — замените на ID своих таблиц
// =====================================================================
const SPREADSHEET_ID       = "1H-cUJKEMAtGTdEdRzxhMV2kpsx51u9TsznyKviTZPsE";
const PHOTO_SPREADSHEET_ID = "12902ms2HZg8PowDYsRz9sDlRjMYTPxRZ936swd9mrG8";

const SHEET_NAME          = "WB";
const SPEC_SHEET_NAME     = "Спецификация";
const SPEC_DATA_START_ROW = 5;   // данные в Спецификации начинаются со строки 5
const PHOTO_SHEET_NAME    = "WB_Cards";

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

    // Читаем колонки F(6) по N(14) = 9 колонок
    // row[0] = F = артикул, row[8] = N = urls
    const data = sheet.getRange(2, 6, lastRow - 1, 9).getValues();

    const mapping = {};
    data.forEach(row => {
      const vendorCode = row[0];
      const photoUrls  = row[8];
      if (vendorCode && photoUrls) {
        const urls = photoUrls.toString().split(',');
        if (urls.length > 0 && urls[0].trim()) {
          mapping[vendorCode] = urls[0].trim(); // берём первый URL из списка
        }
      }
    });
    return mapping;
  } catch(e) {
    return {};
  }
}

// =====================================================================
// ТОЧКА ВХОДА: doGet() — обрабатывает все HTTP-запросы к GAS
// =====================================================================

function doGet(e) {
  const params   = e ? e.parameter : {};
  const action   = params ? params.action   : null;
  const callback = params ? (params.callback || '') : '';

  // JSONP: если передан параметр callback — оборачиваем ответ в callback(data)
  // Это нужно чтобы обойти CORS без серверного прокси
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

  if (action === 'lookupBarcode') {
    try   { return sendResult(lookupBarcode(params.barcode || '')); }
    catch (err) { return sendResult({ error: err.message }); }
  }

  return sendResult({ error: 'Unknown action: ' + action });
}

// =====================================================================
// ГЛАВНАЯ ФУНКЦИЯ: возвращает все данные одним запросом
// =====================================================================

/**
 * Возвращает:
 * {
 *   barcodes: {
 *     "4606190017793": {
 *       model:    "арт-001",
 *       repacked: false,
 *       packType: "",
 *       type:     "Джинсы",
 *       photoUrl: "https://..." или null
 *     },
 *     ...
 *   },
 *   packTypes: ["Пакет", "Коробка", ...]
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
    // Читаем 3 колонки начиная с A: A(0)=артикул, B(1)=пусто, C(2)=штрих-код
    const specData = specSheet.getRange(SPEC_DATA_START_ROW, 1, numSpecRows, 3).getValues();

    const barcodeToModel = {};
    specData.forEach(row => {
      const model   = row[0]; // A
      const barcode = row[2]; // C
      if (barcode && model) {
        barcodeToModel[barcode.toString().trim()] = model.toString().trim();
      }
    });

    // --- 2. Лист WB: артикул → статус + тип ---
    const wbSheet = ss.getSheetByName(SHEET_NAME);
    if (!wbSheet) return { error: 'Лист "WB" не найден' };

    const lastWbRow = wbSheet.getLastRow();
    if (lastWbRow < 6) return { barcodes: {}, packTypes: [] };

    const numWbRows = lastWbRow - 5;
    // Читаем 45 колонок начиная с A
    // row[2]=C(тип), row[3]=D(артикул), row[42]=AQ(статус), row[44]=AS(packType)
    const wbData = wbSheet.getRange(6, 1, numWbRows, 45).getValues();

    const modelStatus = {};
    wbData.forEach(row => {
      const model = row[3]; // D = артикул
      if (model) {
        const repacked = row[42]; // AQ = статус упаковки
        const packType = row[44]; // AS = тип упаковки
        const isPacked = repacked === true || repacked === 1
                      || repacked === 'TRUE' || repacked === 'true';
        modelStatus[model.toString().trim()] = {
          repacked: isPacked,
          packType: packType ? packType.toString() : '',
          type:     (row[2] || '').toString()  // C = тип изделия
        };
      }
    });

    // --- 3. Фотографии из второй таблицы ---
    const photoMapping = getPhotoMapping();

    // --- 4. Собираем итоговый объект: штрих-код → все поля ---
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

    // --- 5. Варианты для выпадающего списка (лист «ФОРМУЛЫ/выпадающие списки», столбец AD) ---
    const packTypes = [];
    try {
      const formulaSheet = ss.getSheetByName('ФОРМУЛЫ/выпадающие списки');
      if (formulaSheet) {
        const lastRow = formulaSheet.getLastRow();
        if (lastRow >= 3) {
          // AD = колонка 30 (A=1, ..., Z=26, AA=27, AB=28, AC=29, AD=30)
          const data = formulaSheet.getRange(3, 30, lastRow - 2, 1).getValues();
          data.forEach(row => {
            const val = row[0];
            if (val && val.toString().trim()) packTypes.push(val.toString().trim());
          });
        }
      }
    } catch(e) {
      // Не критично — фронтенд использует встроенный фолбэк
    }

    return { barcodes: result, packTypes: packTypes };
  } catch(e) {
    return { error: e.message };
  }
}

// =====================================================================
// СОХРАНЕНИЕ: записывает статус и тип упаковки в таблицу
// =====================================================================

function saveItem(model, repacked, packType) {
  if (!model) return { success: false, error: 'Модель не указана' };

  const sheet = getSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) return { success: false, error: 'Лист "WB" не найден' };

  const lastRow = sheet.getLastRow();
  if (lastRow < 6) return { success: false, error: 'Нет данных' };

  const numRows = lastRow - 5;
  const data    = sheet.getRange(6, 4, numRows, 1).getValues(); // только колонка D

  for (let i = 0; i < data.length; i++) {
    const rowModel = data[i][0];
    if (rowModel && rowModel.toString().trim() === model.toString().trim()) {
      const rowNum = 6 + i;
      sheet.getRange(rowNum, 43).setValue(repacked === true); // AQ = статус
      sheet.getRange(rowNum, 45).setValue(packType || '');    // AS = тип
      return { success: true };
    }
  }

  return { success: false, error: 'Модель "' + model + '" не найдена' };
}

// =====================================================================
// ПОИСК ОДНОГО ШТРИХ-КОДА (опционально)
// =====================================================================

function lookupBarcode(barcode) {
  if (!barcode) return { found: false, error: 'Штрих-код не указан' };

  const ss = getSpreadsheet();

  const specSheet = ss.getSheetByName(SPEC_SHEET_NAME);
  if (!specSheet) return { found: false, error: 'Лист "Спецификация" не найден' };

  const lastSpecRow = specSheet.getLastRow();
  if (lastSpecRow < SPEC_DATA_START_ROW) return { found: false };

  const numSpecRows = lastSpecRow - SPEC_DATA_START_ROW + 1;
  const specData = specSheet.getRange(SPEC_DATA_START_ROW, 1, numSpecRows, 3).getValues();

  let model = null;
  for (let i = 0; i < specData.length; i++) {
    if (specData[i][2] && specData[i][2].toString().trim() === barcode.toString().trim()) {
      model = specData[i][0];
      break;
    }
  }

  if (!model) return { found: false, error: 'Штрих-код не найден' };

  const wbSheet = ss.getSheetByName(SHEET_NAME);
  if (!wbSheet) return { found: false, error: 'Лист WB не найден' };

  const lastWbRow = wbSheet.getLastRow();
  const numWbRows = lastWbRow - 5;
  const wbData = wbSheet.getRange(6, 1, numWbRows, 45).getValues();

  for (let i = 0; i < wbData.length; i++) {
    if (wbData[i][3] && wbData[i][3].toString().trim() === model.toString().trim()) {
      const repacked = wbData[i][42];
      const packType = wbData[i][44];
      const isPacked = repacked === true || repacked === 1
                    || repacked === 'TRUE' || repacked === 'true';
      return {
        found:    true,
        model:    model.toString(),
        repacked: isPacked,
        packType: packType ? packType.toString() : ''
      };
    }
  }

  return { found: false, error: 'Модель не найдена в WB' };
}
```

---

## Часть 3 — Деплой GAS

1. В редакторе Apps Script: **Развернуть → Новое развёртывание**
2. Тип: **Веб-приложение**
3. Настройки:
   - Выполнять от имени: **Меня**
   - Кто имеет доступ: **Все**
4. Нажать **Развернуть**
5. Скопировать выданный URL вида `https://script.google.com/macros/s/.../exec`

> **Рабочий URL из текущего проекта:**
> `https://script.google.com/macros/s/AKfycbwg4XoEi9Gmxv-SY2K_KglrSh64agoFitr6pwCIM9MxubDaq50URogmfDpEkuZc7NBUag/exec`
>
> Для нового проекта нужно задеплоить заново и будет новый URL.

> **Важно:** При изменении кода — создавать **новое** развёртывание, а не редактировать существующее. Иначе изменения не применятся.

---

## Часть 4 — Фронтенд JavaScript

Вставьте этот блок в `<script>` вашего HTML. Замените `APPS_SCRIPT_URL` на URL вашего нового деплоя.

```javascript
// =================================================================
// ПОДКЛЮЧЕНИЕ К GAS — вставьте URL своего нового деплоя
// =================================================================

// Рабочий URL из проекта nadin-scanner (только для чтения данных):
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwg4XoEi9Gmxv-SY2K_KglrSh64agoFitr6pwCIM9MxubDaq50URogmfDpEkuZc7NBUag/exec';

// Кэш всех данных: штрих-код → { model, repacked, packType, type, photoUrl }
let barcodeToModel = {};

// =================================================================
// JSONP-вызов GAS (обходит CORS без серверного прокси)
// GAS вернёт строку вида:  _apiCb1({ ... })
// Браузер выполнит её как JS и вызовет resolve()
// =================================================================
let _apiCallId = 0;
function apiCall(action, params) {
  return new Promise(function(resolve) {
    const id  = '_apiCb' + (++_apiCallId);
    const url = new URL(APPS_SCRIPT_URL);
    url.searchParams.set('action',   action);
    url.searchParams.set('callback', id);
    if (params) {
      Object.keys(params).forEach(k => url.searchParams.set(k, params[k]));
    }

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

// =================================================================
// ЗАГРУЗКА ВСЕХ ДАННЫХ ПРИ СТАРТЕ
// =================================================================
async function loadAllData() {
  const result = await apiCall('getAllBarcodes');

  if (result.error) {
    console.error('Ошибка загрузки:', result.error);
    return;
  }

  barcodeToModel = result.barcodes || {};

  const packTypes = result.packTypes || [];
  console.log('Загружено штрих-кодов:', Object.keys(barcodeToModel).length);
  console.log('Типы:', packTypes);
}

document.addEventListener('DOMContentLoaded', loadAllData);

// =================================================================
// ПОИСК
// =================================================================

/** Поиск по штрих-коду. Возвращает { model, repacked, packType, type, photoUrl } или null */
function findByBarcode(barcode) {
  return barcodeToModel[barcode.trim()] || null;
}

/** Поиск по артикулу (без учёта регистра) */
function findByModel(model) {
  const modelLower = model.trim().toLowerCase();
  const key = Object.keys(barcodeToModel).find(bc =>
    barcodeToModel[bc].model.toLowerCase() === modelLower
  );
  return key ? barcodeToModel[key] : null;
}

// =================================================================
// СОХРАНЕНИЕ В ТАБЛИЦУ
// =================================================================
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

// =================================================================
// ПРИМЕР ИСПОЛЬЗОВАНИЯ:
// =================================================================
//
// const item = findByBarcode('4606190017793');
// if (item) {
//   console.log(item.model);    // "арт-001"
//   console.log(item.repacked); // false
//   console.log(item.packType); // ""
//   console.log(item.type);     // "Джинсы"
//   console.log(item.photoUrl); // "https://..."
// }
//
// await saveItem('арт-001', true, 'Пакет');
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

## Часть 6 — Адаптация под другую структуру таблицы

Если в новом проекте колонки расположены иначе — меняйте только эти места в GAS:

| Что изменить | Где в коде | Формула |
|---|---|---|
| Лист основных данных | `SHEET_NAME` | строка |
| Лист штрих-кодов | `SPEC_SHEET_NAME` | строка |
| С какой строки данные в Спецификации | `SPEC_DATA_START_ROW` | число |
| Колонка артикула в Спецификации | `row[0]` в `specData.forEach` | A=0, B=1, C=2... |
| Колонка штрих-кода в Спецификации | `row[2]` в `specData.forEach` | A=0, B=1, C=2... |
| С какой строки данные в WB | `getRange(6, 1, ...)` | число |
| Колонка типа в WB | `row[2]` в `wbData.forEach` | A=0, B=1, C=2... |
| Колонка артикула в WB | `row[3]` в `wbData.forEach` | D=3 |
| Колонка статуса в WB | `row[42]` / `getRange(rowNum, 43)` | AQ: индекс=42, col=43 |
| Колонка packType в WB | `row[44]` / `getRange(rowNum, 45)` | AS: индекс=44, col=45 |

**Формула:** колонка A = индекс 0 (в массиве) = col 1 (в `getRange`). AQ = индекс 42 = col 43.

---

## Часть 7 — Типичные проблемы

| Симптом | Причина | Решение |
|---|---|---|
| `{ error: "Лист X не найден" }` | Опечатка в имени листа | Проверьте имя точно (регистр важен) |
| Данные не обновились после правки кода | Редактировали существующий деплой | Создайте **новое** развёртывание |
| `barcodes: {}` пустой | Неверная стартовая строка | Поправьте `SPEC_DATA_START_ROW` и `getRange(6, ...)` |
| `Network error` в консоли | GAS не опубликован «для всех» | Проверьте настройки доступа деплоя |
| `photoUrl: null` у всех | Артикул в WB_Cards (col F) ≠ артикулу в WB (col D) | Убедитесь что значения совпадают |
| Ошибка авторизации при деплое | Нужно разрешить доступ аккаунту | Нажать «Разрешить» в диалоге OAuth |

---

## Часть 8 — Чеклист для нового проекта

- [ ] Создать таблицу с листами «Спецификация», «WB», «ФОРМУЛЫ/выпадающие списки»
- [ ] Создать или использовать таблицу с фото (лист «WB_Cards»)
- [ ] Открыть Apps Script через **Расширения → Apps Script** в основной таблице
- [ ] Вставить GAS-код выше, заменить `SPREADSHEET_ID` и `PHOTO_SPREADSHEET_ID`
- [ ] Задеплоить: **Развернуть → Новое развёртывание → Веб-приложение → Все → Развернуть**
- [ ] Скопировать новый URL деплоя
- [ ] Вставить URL в `APPS_SCRIPT_URL` во фронтенде
- [ ] Добавить JS-блок из Части 4 на страницу
- [ ] Проверить в консоли: `loadAllData()` → должно вывести количество штрих-кодов
