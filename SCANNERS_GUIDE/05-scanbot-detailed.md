# Scanbot SDK — подробная инструкция

Scanbot — самый мощный сканер в этой папке. Распознаёт QR, EAN, UPC, Code 128/39/93, PDF417, DataMatrix, Aztec, ITF и другие форматы. Работает в плохом свете, под углом, при бликах. **60 секунд без лицензии — потом SDK попросит ключ.**

## 1. Что такое RTU UI

Scanbot предлагает два способа использовать сканер:

1. **RTU UI** (Ready-To-Use) — SDK сам открывает готовый полноэкранный интерфейс с камерой, рамкой наведения, вибрацией при успехе, кнопкой закрытия. **Мы используем именно этот вариант** — проще всего.
2. **Classic UI** — вы сами делаете интерфейс, а SDK только даёт API декодирования кадров.

## 2. Полная схема подключения

```
<head>                          ← type="module" ОБЯЗАТЕЛЕН
  <script type="module"
     src="https://cdn.jsdelivr.net/npm/scanbot-web-sdk@8.0.1/bundle/ScanbotSDK.ui2.min.js">
  </script>
</head>

<body>
  <button id="scan-btn-scanbot">Сканировать (Scanbot)</button>
  <!-- Никакой специальной разметки не нужно — SDK рисует своё -->

  <script src="scanners.js"></script>
</body>
```

На сервере:
```
/scanbot-engine/bin/barcode-scanner/
    ├── ScanbotSDK.Asm-simd-threads.js
    ├── ScanbotSDK.Asm-simd-threads.wasm
    ├── ScanbotSDK.Asm-simd-threads.worker.js
    ├── ScanbotSDK.Asm-simd.wasm
    ├── ScanbotSDK.Asm.wasm
    ├── ScanbotSDK.Core-simd-threads.js
    ├── ScanbotSDK.Core-simd.js
    └── ScanbotSDK.Core.js
```

Сервер должен:
- отдавать `.wasm` с MIME-типом `application/wasm`,
- разрешать запросы с вашего домена (обычно само собой),
- лучше кешировать (`Cache-Control: public, max-age=604800`) — файлы большие.

## 3. Инициализация (один раз)

```js
let scanbotInitialized = false;

async function initScanbotSDK() {
    if (scanbotInitialized) return true;
    try {
        await ScanbotSDK.initialize({
            enginePath: '/scanbot-engine/bin/barcode-scanner/'
            // licenseKey: 'YOUR_KEY'  // опционально
        });
        scanbotInitialized = true;
        return true;
    } catch (e) {
        console.error('Scanbot init error:', e);
        return false;
    }
}
```

**Где вызывать?** Сразу после загрузки страницы в фоне — тогда первое нажатие кнопки откроет сканер мгновенно:
```js
setTimeout(() => {
    if (typeof ScanbotSDK !== 'undefined') {
        initScanbotSDK().then(() => console.log('Scanbot готов'));
    }
}, 500);
```

## 4. Запуск RTU-сканера

```js
async function openScanbotScanner() {
    if (typeof ScanbotSDK === 'undefined') {
        alert('Scanbot SDK не загружен');
        return;
    }
    const ok = await initScanbotSDK();
    if (!ok) return;

    try {
        const config = new ScanbotSDK.UI.Config.BarcodeScannerScreenConfiguration();
        // Тут можно настроить: config.topBar.title.text = 'Мой сканер' и т.д.

        const result = await ScanbotSDK.UI.createBarcodeScanner(config);

        if (result && result.items && result.items.length > 0) {
            const code = result.items[0].barcode.text;
            const format = result.items[0].barcode.format;  // 'QR_CODE', 'EAN_13', ...
            console.log('Отсканировано:', format, code);
            handleCodeScan(code);
        }
    } catch (error) {
        if (!error.message?.includes('cancel')) {
            console.error('Scanbot error:', error);
        }
    }
}
```

Если пользователь закрыл сканер, не отсканировав — в `error.message` будет слово `cancel`, и это нормально.

## 5. Закрытие программно

RTU UI закрывается сам (кнопкой крестик внутри оверлея). Если нужно закрыть из кода:
```js
try { ScanbotSDK.UI.abortScanner(); } catch (e) {}
```

## 6. Настройка конфигурации

`BarcodeScannerScreenConfiguration` имеет десятки полей. Основные:

```js
const config = new ScanbotSDK.UI.Config.BarcodeScannerScreenConfiguration();

// Заголовок вверху
config.topBar.title.text = 'Наведите на штрих-код';
config.topBar.backgroundColor = new ScanbotSDK.UI.Config.Color('#2563eb');

// Какие форматы распознавать (по умолчанию — все)
config.useCase.barcodeFormats = ['QR_CODE', 'EAN_13', 'CODE_128'];

// Режим: один код / много / один раз и закрыть
// single / multiple / multiple-unique / find-and-pick
config.useCase = new ScanbotSDK.UI.Config.SingleScanningMode();

// Вибрация и звук
config.sound.successBeepEnabled = true;
config.vibration.enabled = true;

// Пауза после успешного сканирования перед автозакрытием
// (только в single-режиме)

// Локализация надписей
config.localization.barcode_scanner_cancel = 'Отмена';
```

Полный список опций: https://docs.scanbot.io/barcode-scanner-sdk/web/ui-components/rtu-ui-v2/barcode-scanner/

## 7. Лицензирование

Без ключа SDK:
- **работает 60 секунд** с момента `initialize()`,
- потом возвращает пустой результат или ошибку.

Ключ:
- **Триальный**: бесплатно на https://scanbot.io/trial/ — 7 дней.
- **Платный**: подписка (для коммерции).

Ключ передаётся так:
```js
await ScanbotSDK.initialize({
    enginePath: '/scanbot-engine/bin/barcode-scanner/',
    licenseKey: 'eyJhbGciOi...' // длинная JWT-строка
});
```

Ключ привязан к домену. На `localhost` и `127.0.0.1` работает любой триальный.

## 8. Типичные проблемы

| Симптом | Причина | Решение |
|---|---|---|
| `ScanbotSDK is not defined` | Скрипт не загрузился или забыли `type="module"` | Проверьте тег `<script type="module" src="...">` |
| `Failed to load engine` | Неверный `enginePath` или отсутствуют wasm-файлы | Убедитесь что файлы лежат на сервере и `.wasm` отдаётся с MIME `application/wasm` |
| Сканер открывается, но закрывается через ~минуту | Закончился 60-сек бесплатный режим | Получите триальный ключ |
| Камера не включается | Сайт не на HTTPS | Используйте HTTPS (Tailscale Funnel, Cloudflare Tunnel, ngrok, LetsEncrypt) |
| Черный экран сканера на iPhone в WebView | Особенности iOS WebView | Открывайте в Safari, не в WebView |

## 9. Когда выбрать Scanbot, а когда нет

**Использовать Scanbot, если:**
- нужны разные форматы штрих-кодов (EAN/UPC/PDF417/DataMatrix)
- условия сложные — помятые коды, плохой свет, бликующий пластик
- важна скорость и UX (вибрация, звук, рамка наведения из коробки)
- проект коммерческий и бюджет позволяет лицензию

**Достаточно html5-qrcode, если:**
- только QR-коды
- обычные условия съёмки
- проект некоммерческий или прототип
- не хочется носить 10 МБ WASM

## 10. Ссылки

- Главная: https://scanbot.io
- Документация Web SDK: https://docs.scanbot.io/barcode-scanner-sdk/web/
- npm: https://www.npmjs.com/package/scanbot-web-sdk
- Получить триал: https://scanbot.io/trial/
