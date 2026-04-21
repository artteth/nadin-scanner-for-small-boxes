# Зависимости и CDN-ссылки

Все библиотеки подключаются через CDN (кроме Scanbot движка — WASM-файлы должны лежать локально). Эти `<script>` идут в `<head>`.

## Полный набор `<script>` тегов

```html
<!-- html5-qrcode: главный QR/штрих-код сканер с готовым UI -->
<script src="https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js"></script>

<!-- jsQR: чистый декодер QR (без UI) -->
<script src="https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js"></script>

<!-- Scanbot Web SDK: коммерческий сканер.
     ВАЖНО: type="module" обязателен.
     Работает 60 секунд без лицензии, затем просит триал/ключ -->
<script type="module"
        src="https://cdn.jsdelivr.net/npm/scanbot-web-sdk@8.0.1/bundle/ScanbotSDK.ui2.min.js"></script>
```

## Версии (точно те, что проверены в рабочем проекте)

| Библиотека | Версия | Размер | Форматы |
|---|---|---|---|
| html5-qrcode | 2.3.8 | ~180 KB | QR + EAN/Code128/Code39 и др. (ZXing под капотом) |
| jsqr | 1.4.0 | ~45 KB | только QR |
| scanbot-web-sdk | 8.0.1 | ~100 KB JS + **~10 MB WASM локально** | QR, EAN-8/13, UPC-A/E, Code 39/93/128, ITF, PDF417, DataMatrix, Aztec и др. |

## Альтернативные CDN (если основной не работает)

```html
<!-- html5-qrcode -->
<script src="https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js"></script>

<!-- jsQR -->
<script src="https://unpkg.com/jsqr@1.4.0/dist/jsQR.min.js"></script>
```

## Scanbot: локальные WASM-файлы

Scanbot **не загружает движок с CDN** — WASM-файлы должны лежать в папке вашего проекта. В исходном проекте путь такой:

```
scanbot-engine/
└── bin/
    └── barcode-scanner/
        ├── ScanbotSDK.Asm-simd-threads.js       (99 KB)
        ├── ScanbotSDK.Asm-simd-threads.wasm     (10 MB)
        ├── ScanbotSDK.Asm-simd-threads.worker.js
        ├── ScanbotSDK.Asm-simd.wasm             (10 MB)
        ├── ScanbotSDK.Asm.wasm                  (9.6 MB)
        ├── ScanbotSDK.Core-simd-threads.js      (133 KB)
        ├── ScanbotSDK.Core-simd.js              (121 KB)
        └── ScanbotSDK.Core.js                   (121 KB)
```

В коде этот путь указывается так:
```js
await ScanbotSDK.initialize({
    enginePath: '/scanbot-engine/bin/barcode-scanner/'
});
```

Файлы движка можно взять:
1. Из **этого рабочего проекта** (папка `scanbot-engine/`) — самый простой путь.
2. Из **npm** — `npm install scanbot-web-sdk@8.0.1`, далее скопировать из `node_modules/scanbot-web-sdk/bundle/bin/barcode-scanner/`.
3. Скачать с официального сайта: https://docs.scanbot.io/barcode-scanner-sdk/web/installation/

## Требования сервера для WASM

Сервер должен отдавать `.wasm` с корректным MIME-типом:

```js
'.wasm': 'application/wasm'
```

И желательно кешировать движок, т.к. файлы большие:
```js
'Cache-Control': 'public, max-age=604800'   // 7 дней
```

## Требования окружения

- **HTTPS** обязателен для доступа к `navigator.mediaDevices.getUserMedia`. Исключение — `http://localhost`.
- Современный браузер с WebAssembly (для Scanbot) — любой актуальный Chrome/Safari/Firefox подходит.
- Мобильный браузер должен разрешить камеру (всплывающий запрос — один раз).

## Проверка загрузки в консоли браузера

```js
typeof Html5QrcodeScanner  // "function" — html5-qrcode загружен
typeof jsQR                // "function" — jsQR загружен
typeof ScanbotSDK          // "object"   — Scanbot загружен (модуль)
```
