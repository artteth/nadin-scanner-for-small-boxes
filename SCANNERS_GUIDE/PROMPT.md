# Промпт для AI-ассистента

Скопируйте всё, что ниже блока `=== ПРОМПТ НАЧИНАЕТСЯ ЗДЕСЬ ===`, и вставьте в чат с другим AI (Claude, ChatGPT, Gemini, Copilot и т.д.). Вместе с промптом приложите файлы из этой папки: `02-html-markup.html`, `03-styles.css`, `04-scanners.js`, `05-scanbot-detailed.md` — или скопируйте их содержимое в сообщение.

---

## === ПРОМПТ НАЧИНАЕТСЯ ЗДЕСЬ ===

Мне нужно добавить в мой веб-проект функционал сканирования QR-кодов и штрих-кодов камерой телефона **ровно так же**, как он реализован в моём другом проекте. Подключи все 4 сканера и кнопку Scanbot SDK с теми же настройками, тем же поведением и тем же UX.

### Что должно получиться

На странице 4 кнопки запуска сканера и одно поле ручного ввода:

1. **«Сканировать QR-код»** — библиотека `html5-qrcode@2.3.8` (основной сканер с готовым UI).
2. **«Сканировать (ZBar)»** — библиотека `jsqr@1.4.0` в режиме HD (`1280×720`), ручной цикл через `<video>` + `<canvas>` + `requestAnimationFrame`.
3. **«Сканировать (Scanbot SDK)»** — `scanbot-web-sdk@8.0.1`, режим RTU UI (`ScanbotSDK.UI.createBarcodeScanner`). Работает 60 сек без лицензии.
4. **«Сканировать (jsQR)»** — ещё один вариант на `jsQR` как fallback (минимальная конфигурация камеры, без HD).
5. **Поле «Ввести код вручную»** — на случай, если камера не справляется.

Каждая кнопка открывает свою модалку со своей областью видео и своим полем ручного ввода внутри. Нажатие «×» или Enter в поле ввода закрывает модалку.

### Обязательные требования

- **Код JS должен быть без ES-модулей**, все функции глобальные — чтобы работали inline `onclick` в HTML.
- **Порядок загрузки `<script>` строгий**: сначала CDN-библиотеки в `<head>`, потом основной код в конце `<body>`.
- **`navigator.mediaDevices.getUserMedia`** с `facingMode: 'environment'` (задняя камера).
- Для ZBar — запрашиваем HD: `width: { ideal: 1280 }, height: { ideal: 720 }`.
- Для Scanbot — обязательно тег `<script type="module" ...>`, путь к WASM `enginePath: '/scanbot-engine/bin/barcode-scanner/'`, предзагрузка движка в фоне через `setTimeout(..., 500)` после `DOMContentLoaded`.
- MIME `.wasm` → `application/wasm` на сервере.
- Кеширование `scanbot-engine` на 7 дней (`Cache-Control: public, max-age=604800`).
- Камера работает только по HTTPS (или localhost).

### CDN-ссылки (именно эти версии)

```html
<script src="https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js"></script>
<script type="module" src="https://cdn.jsdelivr.net/npm/scanbot-web-sdk@8.0.1/bundle/ScanbotSDK.ui2.min.js"></script>
```

### ID элементов (не менять — JS на них завязан)

- Кнопки: `#scan-btn`, `#scan-btn-zbar`, `#scan-btn-scanbot`, `#scan-btn-jsqr`
- Модалки: `#scanner-modal`, `#zbar-scanner-modal`, `#scanbot-scanner-modal`, `#jsqr-scanner-modal`
- Области видео: `#qr-reader`, `#zbar-reader`, `#scanbot-reader`, `#jsqr-reader`
- Кнопки закрытия: `#close-scanner`, `#close-zbar-scanner`, `#close-scanbot-scanner`, `#close-jsqr-scanner`
- Главное поле ручного ввода: `#manual-code` + `#manual-submit`
- Поля ручного ввода в модалках: `#manual-code-modal`, `#manual-code-zbar`, `#manual-code-scanbot`, `#manual-code-jsqr` (+ соответствующие `manual-submit-...`)

### Логика сканеров (все 4)

- **html5-qrcode**: `new Html5QrcodeScanner('qr-reader', { fps: 10, qrbox: { width: 250, height: 250 } }, false)`. Инстанс создаётся **лениво и один раз**, хранится в глобальной переменной `html5QrcodeScanner = null`. При закрытии — `scanner.clear()`.

- **ZBar/jsQR**: открываем `getUserMedia` → создаём `<video>` → в `requestAnimationFrame` копируем кадр в `canvas` → `jsQR(imageData.data, width, height)` → если код найден — останавливаем цикл и вызываем обработчик. Stream хранится в глобальной `zbarStream = null`, при закрытии — `.getTracks().forEach(t => t.stop())`.

- **Scanbot**: инициализация через `await ScanbotSDK.initialize({ enginePath: '...' })`, предохранитель `scanbotInitialized = false`. Открытие через `ScanbotSDK.UI.createBarcodeScanner(new ScanbotSDK.UI.Config.BarcodeScannerScreenConfiguration())` — **SDK сам рисует полноэкранный UI**, наша модалка нужна только для единообразия и ручного ввода. Результат: `result.items[0].barcode.text`. Если ошибка содержит слово `cancel` — пользователь закрыл сканер, это нормально, молчим.

- **Ручной ввод**: из поля `#manual-code` или любого `#manual-code-*` внутри модалки, по кнопке или Enter — вызывает `handleCodeScan(code)`.

### Общий обработчик кода

Все 4 сканера и ручной ввод вызывают **одну функцию** `handleCodeScan(code)`. В исходном проекте она парсит `код.split('_')` и ищет партию. **В моём новом проекте вместо этого нужна такая логика:**

> **← СЮДА ВСТАВЬТЕ СВОЮ БИЗНЕС-ЛОГИКУ: что делать с отсканированным кодом.**
> Например: «Отправь POST-запрос на `/api/scan` с полем `code`, покажи результат в блоке `#result»`».

### Код-заготовки

Дальше — точные заготовки HTML/CSS/JS из рабочего проекта. Адаптируй их под стили моего проекта, но **логику, ID, порядок инициализации, структуру функций и названия глобальных переменных не меняй**.

[ПРИЛОЖИ ЗДЕСЬ СОДЕРЖИМОЕ ФАЙЛОВ:
 `02-html-markup.html`
 `03-styles.css`
 `04-scanners.js`
 `05-scanbot-detailed.md`]

### Что сделать

1. Добавь `<script>` теги в `<head>` моей страницы.
2. Вставь HTML-разметку кнопок и модалок в `<body>`.
3. Подключи CSS (скопируй нужные правила в мой файл стилей или подключи отдельным `<link>`).
4. Положи `04-scanners.js` в проект и подключи в конце `<body>`.
5. Подставь в `handleCodeScan()` мою бизнес-логику (см. выше).
6. Если проекту нужен Scanbot — объясни, как разместить папку `scanbot-engine/bin/barcode-scanner/` с WASM-файлами (можно скопировать из `node_modules/scanbot-web-sdk/bundle/bin/barcode-scanner/` после `npm install scanbot-web-sdk@8.0.1`). Проверь, что сервер отдаёт `.wasm` с MIME `application/wasm`.
7. Напомни, что камера работает **только по HTTPS** (или localhost), и предложи варианты локальной разработки (Tailscale Funnel, ngrok, self-signed cert).

После вставки кода — покажи мне изменённые файлы целиком и коротко объясни, что куда положил.

## === ПРОМПТ ЗАКАНЧИВАЕТСЯ ЗДЕСЬ ===

---

## Как использовать этот промпт

**Вариант А — быстрый (один файл):**
Скопируйте промпт + содержимое четырёх файлов (`02-`, `03-`, `04-`, `05-`) в одно сообщение AI.

**Вариант Б — загрузка файлов:**
Если AI поддерживает загрузку файлов (Claude, ChatGPT с Projects, Gemini), загрузите всю папку `SCANNERS_GUIDE/` и просто вставьте текст промпта.

**Вариант В — ссылка на архив:**
Заархивируйте папку `SCANNERS_GUIDE/` + папку `scanbot-engine/` (если нужен Scanbot), выложите куда-нибудь, и дайте AI ссылку вместе с промптом.
