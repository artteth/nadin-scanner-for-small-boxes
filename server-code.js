const SPREADSHEET_ID = "1H-cUJKEMAtGTdEdRzxhMV2kpsx51u9TsznyKviTZPsE";
const SHEET_NAME = "WB";
const SPEC_SHEET_NAME = "Спецификация";
const SPEC_DATA_START_ROW = 5;
const PHOTO_SPREADSHEET_ID = "12902ms2HZg8PowDYsRz9sDlRjMYTPxRZ936swd9mrG8";
const PHOTO_SHEET_NAME = "WB_Cards";

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
  const params = e ? e.parameter : null;
  const action = params ? params.action : null;
  const page = params ? params.page : null;

  const createResponse = (data) => {
    return ContentService.createTextOutput(JSON.stringify(data))
        .setMimeType(ContentService.MimeType.JSON)
        .setHeader("Access-Control-Allow-Origin", "*")
        .setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        .setHeader("Access-Control-Allow-Headers", "Content-Type");
  };

  if (action === 'getData') {
    try {
      const data = getData();
      return createResponse(data);
    } catch(err) {
      return createResponse({ error: err.message });
    }
  }

  if (action === 'saveData') {
    try {
      const dataStr = e.parameter.data || e.postData.contents;
      const updates = JSON.parse(dataStr);
      const result = saveData(updates);
      return createResponse({ success: true, result: result });
    } catch(err) {
      return createResponse({ error: err.message });
    }
  }

  if (action === 'lookupBarcode') {
    try {
      const barcode = params.barcode || '';
      const result = lookupBarcode(barcode);
      return createResponse(result);
    } catch(err) {
      return createResponse({ error: err.message });
    }
  }

  if (action === 'savePackaging') {
    try {
      const model = params.model || '';
      const packType = params.packType || '';
      const result = savePackaging(model, packType);
      return createResponse(result);
    } catch(err) {
      return createResponse({ error: err.message });
    }
  }

  if (page === 'scanner') {
    return HtmlService.createHtmlOutputFromFile('сканер')
        .setTitle("Сканер упаковки");
  }

  return HtmlService.createHtmlOutputFromFile('отметка упаковки страничка')
      .setTitle("Отметка упаковки");
}

function lookupBarcode(barcode) {
  if (!barcode) return { found: false, error: 'Штрих-код не указан' };

  const ss = getSpreadsheet();

  // Ищем штрих-код в листе Спецификация, колонка C (3)
  const specSheet = ss.getSheetByName(SPEC_SHEET_NAME);
  if (!specSheet) return { found: false, error: 'Лист "Спецификация" не найден' };

  const lastSpecRow = specSheet.getLastRow();
  if (lastSpecRow < SPEC_DATA_START_ROW) return { found: false, error: 'Штрих-код не найден' };

  const numSpecRows = lastSpecRow - SPEC_DATA_START_ROW + 1;
  // Читаем колонки A и C
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

  // Ищем модель в листе WB, колонка D (4)
  const wbSheet = ss.getSheetByName(SHEET_NAME);
  if (!wbSheet) return { found: false, error: 'Лист WB не найден' };

  const lastWbRow = wbSheet.getLastRow();
  if (lastWbRow < 6) return { found: false, error: 'Нет данных в листе WB' };

  const numWbRows = lastWbRow - 5;
  const wbData = wbSheet.getRange(6, 1, numWbRows, 45).getValues();

  for (let i = 0; i < wbData.length; i++) {
    const rowModel = wbData[i][3]; // колонка D
    if (rowModel && rowModel.toString().trim() === model.toString().trim()) {
      const repacked = wbData[i][42]; // колонка AQ
      const packType = wbData[i][44]; // колонка AS
      const isPacked = repacked === true || repacked === 1 || repacked === 'TRUE' || repacked === 'true';
      return {
        found: true,
        model: model.toString(),
        repacked: isPacked,
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
  const data = sheet.getRange(6, 4, numRows, 1).getValues(); // только колонка D

  for (let i = 0; i < data.length; i++) {
    const rowModel = data[i][0];
    if (rowModel && rowModel.toString().trim() === model.toString().trim()) {
      const rowNum = 6 + i;
      sheet.getRange(rowNum, 43).setValue(true);   // AQ — упаковано
      sheet.getRange(rowNum, 45).setValue(packType); // AS — тип упаковки
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

  updates.forEach(u => {
    const currentRow = currentData.find(r => r.model === u.model);

    if (!currentRow) {
      errors.push('Модель ' + u.model + ' не найдена в таблице');
      return;
    }

    sheet.getRange(currentRow.rowNum, 43).setValue(u.repacked ? true : false);
    if (u.packType !== undefined) {
      sheet.getRange(currentRow.rowNum, 45).setValue(u.packType);
    }
    saved.push(currentRow.rowNum);
  });

  return { saved: saved, errors: errors };
}

/**
 * Возвращает все штрих-коды → модели + статусы упаковки.
 * Используется сканером для предзагрузки данных при старте страницы.
 * Поиск работает локально — без вызова сервера при каждом сканировании.
 */
function getAllBarcodes() {
  try {
    const ss = getSpreadsheet();

    // 1. Загружаем Спецификацию: колонки A (модель) и C (штрих-код)
    const specSheet = ss.getSheetByName(SPEC_SHEET_NAME);
    if (!specSheet) return { error: 'Лист "Спецификация" не найден' };

    const lastSpecRow = specSheet.getLastRow();
    if (lastSpecRow < SPEC_DATA_START_ROW) return { barcodes: {} };

    const numSpecRows = lastSpecRow - SPEC_DATA_START_ROW + 1;
    const specData = specSheet.getRange(SPEC_DATA_START_ROW, 1, numSpecRows, 3).getValues();

    // barcode → model
    const barcodeToModel = {};
    specData.forEach(row => {
      const model = row[0]; // колонка A
      const barcode = row[2]; // колонка C
      if (barcode && model) {
        barcodeToModel[barcode.toString().trim()] = model.toString().trim();
      }
    });

    // 2. Загружаем WB: колонки D (модель), AQ (repacked), AS (packType)
    const wbSheet = ss.getSheetByName(SHEET_NAME);
    if (!wbSheet) return { error: 'Лист WB не найден' };

    const lastWbRow = wbSheet.getLastRow();
    if (lastWbRow < 6) return { barcodes: {} };

    const numWbRows = lastWbRow - 5;
    // D=4, AQ=43, AS=45 — читаем с 1 по 45
    const wbData = wbSheet.getRange(6, 1, numWbRows, 45).getValues();

    // model → { repacked, packType }
    const modelStatus = {};
    wbData.forEach(row => {
      const model = row[3]; // колонка D
      if (model) {
        const repacked = row[42]; // колонка AQ
        const packType = row[44]; // колонка AS
        const isPacked = repacked === true || repacked === 1 || repacked === 'TRUE' || repacked === 'true';
        modelStatus[model.toString().trim()] = {
          repacked: isPacked,
          packType: packType ? packType.toString() : ''
        };
      }
    });

    // 3. Собираем: barcode → { model, repacked, packType }
    const result = {};
    Object.keys(barcodeToModel).forEach(barcode => {
      const model = barcodeToModel[barcode];
      const status = modelStatus[model] || { repacked: false, packType: '' };
      result[barcode] = {
        model: model,
        repacked: status.repacked,
        packType: status.packType
      };
    });

    return { barcodes: result };
  } catch(e) {
    return { error: e.message };
  }
}
