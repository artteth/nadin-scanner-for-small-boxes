const SPREADSHEET_ID = "1H-cUJKEMAtGTdEdRzxhMV2kpsx51u9TsznyKviTZPsE";
const SHEET_NAME = "WB";
const SPEC_SHEET_NAME = "Спецификация";
const SPEC_DATA_START_ROW = 5;
const PHOTO_SPREADSHEET_ID = "12902ms2HZg8PowDYsRz9sDlRjMYTPxRZ936swd9mrG8";
const PHOTO_SHEET_NAME = "WB_Cards";

function formatDate(date) {
  const pad = (n) => n < 10 ? '0' + n : n;
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  return year + '-' + month + '-' + day;
}

function getSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getPhotoSpreadsheet() {
  return SpreadsheetApp.openById(PHOTO_SPREADSHEET_ID);
}

function getPhotoMapping() {
  try {
    const sheet = getPhotoSpreadsheet().getSheetByName(PHOTO_SHEET_NAME);
    if (!sheet) return {};

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return {};

    const data = sheet.getRange(2, 6, lastRow - 1, 9).getValues(); // F:N

    const mapping = {};
    data.forEach(row => {
      const vendorCode = row[0];
      const photoUrls = row[8];
      if (vendorCode && photoUrls) {
        const urls = photoUrls.toString().split(',');
        if (urls.length > 0 && urls[0].trim()) {
          mapping[vendorCode] = urls[0].trim();
        }
      }
    });
    return mapping;
  } catch(e) {
    return {};
  }
}

function doGet(e) {
  const params = e ? e.parameter : {};
  const action = params ? params.action : null;
  const page = params ? params.page : null;
  const callback = params ? (params.callback || '') : '';

  // JSONP-aware response: оборачивает в callback(data) если передан callback
  const sendResult = (data) => {
    const json = JSON.stringify(data);
    if (callback) {
      return ContentService.createTextOutput(callback + '(' + json + ')')
          .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService.createTextOutput(json)
        .setMimeType(ContentService.MimeType.JSON)
        .setHeader("Access-Control-Allow-Origin", "*")
        .setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        .setHeader("Access-Control-Allow-Headers", "Content-Type");
  };

  if (action === 'getAllBarcodes') {
    try { return sendResult(getAllBarcodes()); }
    catch(err) { return sendResult({ error: err.message }); }
  }

  if (action === 'getData') {
    try { return sendResult(getData()); }
    catch(err) { return sendResult({ error: err.message }); }
  }

  if (action === 'saveData') {
    try {
      const dataStr = params.data || (e.postData ? e.postData.contents : '[]');
      const updates = JSON.parse(dataStr);
      return sendResult({ success: true, result: saveData(updates) });
    } catch(err) { return sendResult({ error: err.message }); }
  }

  if (action === 'lookupBarcode') {
    try {
      return sendResult(lookupBarcode(params.barcode || ''));
    } catch(err) { return sendResult({ error: err.message }); }
  }

  if (action === 'savePackaging') {
    try {
      return sendResult(savePackaging(params.model || '', params.packType || ''));
    } catch(err) { return sendResult({ error: err.message }); }
  }

  // Новое: сохраняет и repacked, и packType (позволяет снять галочку)
  if (action === 'saveItem') {
    try {
      const model = params.model || '';
      const repacked = params.repacked === 'true';
      const packType = params.packType || '';
      return sendResult(saveItem(model, repacked, packType));
    } catch(err) { return sendResult({ error: err.message }); }
  }

  if (page === 'scanner') {
    return HtmlService.createHtmlOutputFromFile('index')
        .setTitle("Сканер упаковки");
  }

  return HtmlService.createHtmlOutputFromFile('отметка упаковки страничка')
      .setTitle("Отметка упаковки");
}

function lookupBarcode(barcode) {
  if (!barcode) return { found: false, error: 'Штрих-код не указан' };

  const ss = getSpreadsheet();

  const specSheet = ss.getSheetByName(SPEC_SHEET_NAME);
  if (!specSheet) return { found: false, error: 'Лист "Спецификация" не найден' };

  const lastSpecRow = specSheet.getLastRow();
  if (lastSpecRow < SPEC_DATA_START_ROW) return { found: false, error: 'Штрих-код не найден' };

  const numSpecRows = lastSpecRow - SPEC_DATA_START_ROW + 1;
  const specData = specSheet.getRange(SPEC_DATA_START_ROW, 1, numSpecRows, 3).getValues();

  let model = null;
  for (let i = 0; i < specData.length; i++) {
    const cellBarcode = specData[i][2]; // колонка C
    if (cellBarcode && cellBarcode.toString().trim() === barcode.toString().trim()) {
      model = specData[i][0]; // колонка A
      break;
    }
  }

  if (!model) return { found: false, error: 'Штрих-код не найден в Спецификации' };

  const wbSheet = ss.getSheetByName(SHEET_NAME);
  if (!wbSheet) return { found: false, error: 'Лист WB не найден' };

  const lastWbRow = wbSheet.getLastRow();
  if (lastWbRow < 6) return { found: false, error: 'Нет данных в листе WB' };

  const numWbRows = lastWbRow - 5;
  const wbData = wbSheet.getRange(6, 1, numWbRows, 45).getValues();

  for (let i = 0; i < wbData.length; i++) {
    const rowModel = wbData[i][3]; // колонка D
    if (rowModel && rowModel.toString().trim() === model.toString().trim()) {
      const repackedValue = wbData[i][42]; // колонка AQ (теперь дата вместо boolean)
      const packType = wbData[i][44]; // колонка AS
      let timestamp = '';
      let isPacked = false;

      if (repackedValue) {
        // Проверяем, это Date-объект (новый формат с датой)
        if (repackedValue instanceof Date) {
          const pad = (n) => n < 10 ? '0' + n : n;
          timestamp = repackedValue.getFullYear() + '-' + pad(repackedValue.getMonth() + 1) + '-' + pad(repackedValue.getDate());
          isPacked = true;
        }
        // Проверяем, это строка в формате YYYY-MM-DD
        else if (typeof repackedValue === 'string') {
          const str = repackedValue.trim();
          if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
            timestamp = str;
            isPacked = true;
          }
        }
        // Старый формат - boolean или число (TRUE, 1, и т.д.)
        else if (repackedValue === true || repackedValue === 1 || repackedValue === 'TRUE' || repackedValue === 'true') {
          isPacked = true;
          timestamp = ''; // для старых данных не выводим дату
        }
      }

      return {
        found: true,
        model: model.toString(),
        repacked: isPacked,
        timestamp: timestamp,
        packType: packType ? packType.toString() : ''
      };
    }
  }

  return { found: false, error: 'Модель "' + model + '" не найдена в листе WB' };
}

function savePackaging(model, packType) {
  if (!model) return { success: false, error: 'Модель не указана' };

  const sheet = getSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) return { success: false, error: 'Лист WB не найден' };

  const lastRow = sheet.getLastRow();
  if (lastRow < 6) return { success: false, error: 'Нет данных в листе WB' };

  const numRows = lastRow - 5;
  const data = sheet.getRange(6, 4, numRows, 1).getValues();

  for (let i = 0; i < data.length; i++) {
    const rowModel = data[i][0];
    if (rowModel && rowModel.toString().trim() === model.toString().trim()) {
      const rowNum = 6 + i;
      const now = new Date();
      const timestamp = formatDate(now);
      sheet.getRange(rowNum, 43).setValue(timestamp);   // AQ — дата/время упаковки
      sheet.getRange(rowNum, 45).setValue(packType); // AS — тип упаковки
      return { success: true };
    }
  }

  return { success: false, error: 'Модель "' + model + '" не найдена' };
}

/**
 * Сохраняет и статус упаковки (repacked), и тип упаковки.
 * В отличие от savePackaging, позволяет снять отметку (repacked=false).
 * Вместо TRUE/FALSE теперь сохраняет дату в формате "YYYY-MM-DD".
 */
function saveItem(model, repacked, packType) {
  if (!model) return { success: false, error: 'Модель не указана' };

  const sheet = getSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) return { success: false, error: 'Лист WB не найден' };

  const lastRow = sheet.getLastRow();
  if (lastRow < 6) return { success: false, error: 'Нет данных в листе WB' };

  const numRows = lastRow - 5;
  const data = sheet.getRange(6, 4, numRows, 1).getValues();

  for (let i = 0; i < data.length; i++) {
    const rowModel = data[i][0];
    if (rowModel && rowModel.toString().trim() === model.toString().trim()) {
      const rowNum = 6 + i;
      if (repacked === true) {
        const now = new Date();
        const timestamp = formatDate(now);
        sheet.getRange(rowNum, 43).setValue(timestamp); // AQ - дата/время упаковки
      } else {
        sheet.getRange(rowNum, 43).setValue(''); // AQ - очистить при отметке снята
      }
      sheet.getRange(rowNum, 45).setValue(packType || '');    // AS
      return { success: true };
    }
  }

  return { success: false, error: 'Модель "' + model + '" не найдена' };
}

function getData(usePhotos) {
  try {
    const sheet = getSpreadsheet().getSheetByName(SHEET_NAME);
    if (!sheet) {
      throw new Error("Лист '" + SHEET_NAME + "' не найден!");
    }
    const lastRow = sheet.getLastRow();

    if (lastRow < 6) return [];

    const startRow = 6;
    const numRows = lastRow - 5;

    const range = sheet.getRange(startRow, 1, numRows, 45);
    const values = range.getValues();

    const packTypes = new Set();
    values.forEach(row => {
      const pt = row[44];
      if (pt) packTypes.add(pt);
    });

    const photoMapping = (usePhotos !== false) ? getPhotoMapping() : {};

    return {
      items: values.map((row, i) => ({
        rowNum: startRow + i,
        type: row[2],
        model: row[3],
        repacked: row[42],
        packType: row[44],
        photoUrl: photoMapping[row[3]] || null
      })),
      packTypeOptions: Array.from(packTypes).sort()
    };
  } catch(e) {
    return { error: e.message };
  }
}

function saveData(updates) {
  const sheet = getSpreadsheet().getSheetByName(SHEET_NAME);
  const response = getData();
  const currentData = response.items || response;

  if (!currentData || currentData.error) {
    throw new Error(currentData ? currentData.error : 'Ошибка получения данных');
  }

  const saved = [];
  const errors = [];
  const now = new Date();
  const timestamp = formatDate(now);

  updates.forEach(u => {
    const currentRow = currentData.find(r => r.model === u.model);

    if (!currentRow) {
      errors.push('Модель ' + u.model + ' не найдена в таблице');
      return;
    }

    if (u.repacked) {
      sheet.getRange(currentRow.rowNum, 43).setValue(timestamp);
    } else {
      sheet.getRange(currentRow.rowNum, 43).setValue('');
    }
    if (u.packType !== undefined) {
      sheet.getRange(currentRow.rowNum, 45).setValue(u.packType);
    }
    saved.push(currentRow.rowNum);
  });

  return { saved: saved, errors: errors };
}

/**
 * Возвращает все штрих-коды → модели + статусы упаковки + тип изделия + фото.
 * Используется сканером для предзагрузки всех данных при старте.
 * Также используется таблицей всех изделий.
 */
function getAllBarcodes() {
  try {
    const ss = getSpreadsheet();

    // 1. Спецификация: A (модель) и C (штрих-код)
    const specSheet = ss.getSheetByName(SPEC_SHEET_NAME);
    if (!specSheet) return { error: 'Лист "Спецификация" не найден' };

    const lastSpecRow = specSheet.getLastRow();
    if (lastSpecRow < SPEC_DATA_START_ROW) return { barcodes: {} };

    const numSpecRows = lastSpecRow - SPEC_DATA_START_ROW + 1;
    const specData = specSheet.getRange(SPEC_DATA_START_ROW, 1, numSpecRows, 3).getValues();

    const barcodeToModel = {};
    specData.forEach(row => {
      const model = row[0]; // A
      const barcode = row[2]; // C
      if (barcode && model) {
        barcodeToModel[barcode.toString().trim()] = model.toString().trim();
      }
    });

    // 2. WB: C (тип), D (модель), AQ (repacked), AS (packType)
    const wbSheet = ss.getSheetByName(SHEET_NAME);
    if (!wbSheet) return { error: 'Лист WB не найден' };

    const lastWbRow = wbSheet.getLastRow();
    if (lastWbRow < 6) return { barcodes: {} };

    const numWbRows = lastWbRow - 5;
    const wbData = wbSheet.getRange(6, 1, numWbRows, 45).getValues();

    // 3. Фотографии
    const photoMapping = getPhotoMapping();

    const modelStatus = {};
    wbData.forEach(row => {
      const model = row[3]; // D
      if (model) {
        const repackedValue = row[42]; // AQ - теперь дата вместо boolean
        const packType = row[44]; // AS
        let timestamp = '';
        let isPacked = false;

        if (repackedValue) {
          // Проверяем, это Date-объект (новый формат с датой)
          if (repackedValue instanceof Date) {
            const pad = (n) => n < 10 ? '0' + n : n;
            timestamp = repackedValue.getFullYear() + '-' + pad(repackedValue.getMonth() + 1) + '-' + pad(repackedValue.getDate());
            isPacked = true;
          }
          // Проверяем, это строка в формате YYYY-MM-DD
          else if (typeof repackedValue === 'string') {
            const str = repackedValue.trim();
            if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
              timestamp = str;
              isPacked = true;
            }
          }
          // Старый формат - boolean или число (TRUE, 1, и т.д.)
          else if (repackedValue === true || repackedValue === 1 || repackedValue === 'TRUE' || repackedValue === 'true') {
            isPacked = true;
            timestamp = ''; // для старых данных не выводим дату
          }
        }

        modelStatus[model.toString().trim()] = {
          repacked: isPacked,
          timestamp: timestamp,
          packType: packType ? packType.toString() : '',
          type: (row[2] || '').toString()  // C = тип изделия
        };
      }
    });

    // 4. Сборка: barcode → { model, repacked, timestamp, packType, type, photoUrl }
    const result = {};
    Object.keys(barcodeToModel).forEach(barcode => {
      const model = barcodeToModel[barcode];
      const status = modelStatus[model] || { repacked: false, timestamp: '', packType: '', type: '' };
      result[barcode] = {
        model: model,
        repacked: status.repacked,
        timestamp: status.timestamp,
        packType: status.packType,
        type: status.type,
        photoUrl: photoMapping[model] || null
      };
    });

    // 5. Список типов упаковки из листа "ФОРМУЛЫ/выпадающие списки", столбец AD, строки 3+
    const packTypes = [];
    try {
      const formulaSheet = ss.getSheetByName('ФОРМУЛЫ/выпадающие списки');
      if (formulaSheet) {
        const lastFormulaRow = formulaSheet.getLastRow();
        if (lastFormulaRow >= 3) {
          const numFormulaRows = lastFormulaRow - 2;
          // AD = колонка 30 (A=1, ..., Z=26, AA=27, AB=28, AC=29, AD=30)
          const formulaData = formulaSheet.getRange(3, 30, numFormulaRows, 1).getValues();
          formulaData.forEach(row => {
            const val = row[0];
            if (val && val.toString().trim()) packTypes.push(val.toString().trim());
          });
        }
      }
    } catch(packErr) {
      // Не критично — клиент использует фолбэк
    }

    return { barcodes: result, packTypes: packTypes };
  } catch(e) {
    return { error: e.message };
  }
}
