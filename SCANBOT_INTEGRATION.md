# Интеграция Scanbot Web SDK v8 (UI2 API)

## Что работает

Scanbot Web SDK v8 загружается с CDN (jsDelivr) и работает без собственного сервера. Без лицензии — trial-режим (60 секунд на сессию сканирования).

## Подключение SDK

В `<head>` добавляется скрипт как ES-модуль:

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/scanbot-web-sdk@8.0.1/bundle/ScanbotSDK.ui2.min.js"></script>
```

**Важно:**
- Файл именно `ScanbotSDK.ui2.min.js` (UI2-бандл), а не `ScanbotSDK.min.js`
- Загрузка через `type="module"` — обязательно, иначе SDK не инициализируется
- Версия `@8.0.1` — зафиксирована, чтобы не сломалось при обновлении пакета

## Инициализация

```javascript
var scanbotSdkInstance = null;

// Инициализация один раз, потом переиспользуем
if (!scanbotSdkInstance) {
  scanbotSdkInstance = await ScanbotSDK.initialize({
    enginePath: 'https://cdn.jsdelivr.net/npm/scanbot-web-sdk@8.0.1/bundle/bin/complete/',
    licenseKey: ''  // Пустая строка = trial (60 сек)
  });
}
```

### Критический параметр — `enginePath`

```
https://cdn.jsdelivr.net/npm/scanbot-web-sdk@8.0.1/bundle/bin/complete/
```

**Именно `bundle/bin/complete/`** — не `bundle/` и не `bundle/bin/`. SDK загружает WASM-файлы из этой директории. Неправильный путь = ошибка "Error initializing the ScanbotSDK worker".

## Запуск сканера

```javascript
// Создаём конфигурацию
var config = new ScanbotSDK.UI.Config.BarcodeScannerScreenConfiguration();

// Запускаем — SDK сам открывает полноэкранный сканер с камерой
var result = await ScanbotSDK.UI.createBarcodeScanner(config);

// Обрабатываем результат
if (result && result.items && result.items.length > 0) {
  var barcode = result.items[0].barcode;
  console.log('Штрих-код:', barcode.text);
  console.log('Формат:', barcode.format);
}
```

SDK сам управляет:
- Камерой (запуск, остановка)
- Полноэкранным UI (рамка, подсказки, кнопка закрытия)
- Распознаванием всех форматов 1D/2D кодов

## Полный рабочий пример

```javascript
var scanbotSdkInstance = null;

async function openScanbotSDK() {
  // Проверяем что SDK загрузился (type="module" загружается асинхронно)
  if (typeof ScanbotSDK === 'undefined') {
    alert('Scanbot SDK ещё загружается. Подождите.');
    return;
  }

  try {
    // Инициализируем SDK (один раз)
    if (!scanbotSdkInstance) {
      scanbotSdkInstance = await ScanbotSDK.initialize({
        enginePath: 'https://cdn.jsdelivr.net/npm/scanbot-web-sdk@8.0.1/bundle/bin/complete/',
        licenseKey: ''
      });
    }

    // Открываем сканер
    var config = new ScanbotSDK.UI.Config.BarcodeScannerScreenConfiguration();
    var result = await ScanbotSDK.UI.createBarcodeScanner(config);

    // Результат
    if (result && result.items && result.items.length > 0) {
      var barcode = result.items[0].barcode;
      document.getElementById('barcodeInput').value = barcode.text;
    }
  } catch (err) {
    console.error('[Scanbot SDK]', err);
    alert('Ошибка Scanbot: ' + err.message);
  }
}
```

## Что НЕ работает (и почему)

| Подход | Почему не работает |
|---|---|
| `new ScanbotSDK({...})` | Это старый API (v4-v5), в v8 не существует |
| `ScanbotSDK.initialize({ enginePath: '.../bundle/' })` | Неправильный путь — WASM-файлы лежат в `bundle/bin/complete/` |
| `<script src="...ScanbotSDK.min.js">` (без type="module") | SDK v8 использует ES-модули, без `type="module"` не загружается |
| `@latest` вместо `@8.0.1` | Может сломаться при мажорном обновлении, лучше фиксировать версию |

## Лицензия

Без `licenseKey` SDK работает в trial-режиме:
- Сканирование работает 60 секунд за сессию
- После истечения нужно перезагрузить страницу
- Для продакшена нужна лицензия с сайта scanbot.io

## Совместимость

Проверено и работает:
- iPhone (iOS 16+) — Safari
- Android — Chrome
- Desktop — Chrome, Firefox, Safari
