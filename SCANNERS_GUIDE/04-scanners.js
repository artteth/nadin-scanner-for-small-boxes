/* =========================================================================
   4 реализации сканера QR/штрих-кодов + обработчик кода.
   Перенесено 1-в-1 из рабочего проекта (js/scanners.js + js/init.js).

   ТРЕБУЕТ В HTML:
     - CDN скрипты: html5-qrcode, jsQR, scanbot-web-sdk (см. 01-dependencies.md)
     - Разметку из 02-html-markup.html

   ИНИЦИАЛИЗАЦИЯ:
     Вызвать initScannerButtons() после DOMContentLoaded.
     Модифицировать handleCodeScan() под свою бизнес-логику (помечено XXX).
   ========================================================================= */

/* ---- Глобальные переменные состояния ---- */
let html5QrcodeScanner = null;   // инстанс html5-qrcode (создаётся один раз)
let zbarStream = null;           // MediaStream камеры для ZBar-сканера
let scanbotInitialized = false;  // флаг: Scanbot SDK уже проинициализирован?


/* =============================================================
   ВСПОМОГАТЕЛЬНЫЕ УТИЛИТЫ
   ============================================================= */

function lockBodyScroll()   { document.body.style.overflow = 'hidden'; }
function unlockBodyScroll() { document.body.style.overflow = ''; }

/** Простой тост внизу экрана. Заменить на свой UI при необходимости. */
function showToast(message, type = 'info') {
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    t.textContent = message;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2500);
}


/* =============================================================
   СКАНЕР 1 — html5-qrcode (главный, с готовым UI)
   ============================================================= */

function openScanner() {
    const modal = document.getElementById('scanner-modal');
    modal?.classList.add('active');
    lockBodyScroll();

    // Инстанс создаём лениво и переиспользуем
    if (!html5QrcodeScanner) {
        html5QrcodeScanner = new Html5QrcodeScanner(
            'qr-reader',                                  // id div-контейнера
            { fps: 10, qrbox: { width: 250, height: 250 } }, // параметры
            false                                         // verbose
        );
    }

    html5QrcodeScanner.render(
        handleQRCodeScan,
        (error) => console.log('Scanner error:', error)
    );
}

function closeScanner() {
    const modal = document.getElementById('scanner-modal');
    modal?.classList.remove('active');
    unlockBodyScroll();
    if (html5QrcodeScanner) {
        html5QrcodeScanner.clear().catch(err => console.log('Error clearing scanner:', err));
    }
}

function handleQRCodeScan(decodedText) {
    console.log('QR код:', decodedText);
    handleCodeScan(decodedText);
    closeScanner();
}


/* =============================================================
   СКАНЕР 2 — «ZBar» (внутри jsQR + ручной цикл)
   ============================================================= */

async function openZbarScanner() {
    const modal = document.getElementById('zbar-scanner-modal');
    modal?.classList.add('active');
    lockBodyScroll();

    const reader = document.getElementById('zbar-reader');
    if (!reader) return;
    reader.innerHTML = '<div class="empty-state">Инициализация камеры...</div>';

    if (typeof jsQR === 'undefined') {
        reader.innerHTML = '<div class="empty-state">Ошибка: jsQR не загружен</div>';
        return;
    }

    try {
        // 1. Запрашиваем заднюю камеру в HD
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'environment',
                width:  { ideal: 1280 },
                height: { ideal: 720  }
            }
        });
        zbarStream = stream;

        // 2. Создаём <video> и рисуем его в контейнер
        const canvas = document.createElement('canvas');
        const ctx    = canvas.getContext('2d');
        const video  = document.createElement('video');
        video.srcObject  = stream;
        video.autoplay   = true;
        video.playsInline = true;
        video.style.width  = '100%';
        video.style.height = 'auto';

        reader.innerHTML = '';
        reader.appendChild(video);

        // 3. На каждом кадре — копируем в canvas и скармливаем jsQR
        const scan = () => {
            if (video.readyState === video.HAVE_ENOUGH_DATA) {
                canvas.height = video.videoHeight;
                canvas.width  = video.videoWidth;
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const code = jsQR(imageData.data, imageData.width, imageData.height);
                if (code) {
                    console.log('ZBar код:', code.data);
                    handleCodeScan(code.data);
                    closeZbarScanner();
                    return;                 // важно: остановить цикл
                }
            }
            requestAnimationFrame(scan);
        };
        scan();

    } catch (error) {
        console.error('ZBar ошибка:', error);
        reader.innerHTML = '<div class="empty-state">Ошибка камеры: ' + error.message + '</div>';
    }
}

function closeZbarScanner() {
    const modal = document.getElementById('zbar-scanner-modal');
    modal?.classList.remove('active');
    unlockBodyScroll();
    if (zbarStream) {
        zbarStream.getTracks().forEach(track => track.stop());
        zbarStream = null;
    }
}


/* =============================================================
   СКАНЕР 3 — Scanbot SDK (коммерческий, с готовым полноэкранным UI)
   Работает 60 секунд без лицензии — потом нужен ключ.
   Подробнее — см. 05-scanbot-detailed.md
   ============================================================= */

async function initScanbotSDK() {
    if (scanbotInitialized) return true;
    try {
        await ScanbotSDK.initialize({
            // Папка с WASM-движком. Должна лежать на том же домене.
            enginePath: '/scanbot-engine/bin/barcode-scanner/'
            // licenseKey: '...'  // опционально; без ключа работает 60 сек
        });
        scanbotInitialized = true;
        return true;
    } catch (e) {
        console.error('Scanbot init ошибка:', e);
        return false;
    }
}

async function openScanbotScanner() {
    if (typeof ScanbotSDK === 'undefined') {
        showToast('Scanbot SDK не загружен', 'error');
        return;
    }

    const ok = await initScanbotSDK();
    if (!ok) {
        showToast('Ошибка инициализации Scanbot', 'error');
        return;
    }

    try {
        // RTU UI: Scanbot САМ открывает полноэкранный сканер.
        // Никакой модалки из HTML не требуется — она есть только для
        // единообразия и поля ручного ввода.
        const config = new ScanbotSDK.UI.Config.BarcodeScannerScreenConfiguration();
        const result = await ScanbotSDK.UI.createBarcodeScanner(config);

        if (result && result.items && result.items.length > 0) {
            const code = result.items[0].barcode.text;
            console.log('Scanbot код:', code);
            handleCodeScan(code);
        }
    } catch (error) {
        console.error('Scanbot ошибка:', error);
        // Пользователь закрыл сканер — не ругаемся
        if (!error.message?.includes('cancel')) {
            showToast('Ошибка сканера: ' + error.message, 'error');
        }
    }
}

function closeScanbotScanner() {
    // RTU UI закрывает себя сам; функция оставлена для совместимости.
    try { ScanbotSDK.UI.abortScanner(); } catch (e) {}
}


/* =============================================================
   СКАНЕР 4 — jsQR (минимальная реализация, как fallback)
   Практически то же, что ZBar-вариант, но без параметров HD.
   ============================================================= */

async function openJsqrScanner() {
    const modal = document.getElementById('jsqr-scanner-modal');
    modal?.classList.add('active');
    lockBodyScroll();

    const reader = document.getElementById('jsqr-reader');
    if (!reader) return;
    reader.innerHTML = '<div class="empty-state">Инициализация камеры...</div>';

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' }
        });
        const video = document.createElement('video');
        video.srcObject  = stream;
        video.autoplay   = true;
        video.playsInline = true;

        reader.innerHTML = '';
        reader.appendChild(video);

        const canvas = document.createElement('canvas');
        const ctx    = canvas.getContext('2d');

        const scan = () => {
            if (video.readyState === video.HAVE_ENOUGH_DATA) {
                canvas.height = video.videoHeight;
                canvas.width  = video.videoWidth;
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const code = jsQR(imageData.data, imageData.width, imageData.height);
                if (code) {
                    handleCodeScan(code.data);
                    closeJsqrScanner();
                    stream.getTracks().forEach(track => track.stop());
                    return;
                }
            }
            requestAnimationFrame(scan);
        };
        scan();
    } catch (error) {
        console.error('jsQR ошибка:', error);
        reader.innerHTML = '<div class="empty-state">Ошибка: ' + error.message + '</div>';
    }
}

function closeJsqrScanner() {
    const modal = document.getElementById('jsqr-scanner-modal');
    modal?.classList.remove('active');
    unlockBodyScroll();
}


/* =============================================================
   ОБРАБОТКА СКАНИРОВАННОГО КОДА
   <<< XXX Замените логику внутри на свою бизнес-обработку >>>
   ============================================================= */

async function handleManualInput() {
    const input = document.getElementById('manual-code');
    const code = input?.value.trim();
    if (code) {
        await handleCodeScan(code);
        input.value = '';
    }
}

async function handleCodeScan(code) {
    console.log('=== Сканирование:', code, '===');

    // --- XXX НАЧАЛО: ЗАМЕНИТЬ НА СВОЮ ЛОГИКУ ---
    // В исходном проекте код формата "партия_рулон", ищем партию в orders.
    // В вашем проекте: отправьте на API, найдите в БД, откройте нужный экран и т.п.
    showToast('Отсканирован код: ' + code, 'info');
    // --- XXX КОНЕЦ ---
}


/* =============================================================
   ПОДКЛЮЧЕНИЕ ВСЕХ КНОПОК И ОБРАБОТЧИКОВ
   Вызывать один раз после DOMContentLoaded.
   ============================================================= */

function initScannerButtons() {
    // Предзагрузка Scanbot движка — чтобы первое нажатие было быстрым
    setTimeout(() => {
        if (typeof ScanbotSDK !== 'undefined') {
            initScanbotSDK().then(() => console.log('Scanbot SDK готов'));
        }
    }, 500);

    // Главные 4 кнопки
    document.getElementById('scan-btn')?.addEventListener('click', openScanner);
    document.getElementById('scan-btn-zbar')?.addEventListener('click', openZbarScanner);
    document.getElementById('scan-btn-scanbot')?.addEventListener('click', openScanbotScanner);
    document.getElementById('scan-btn-jsqr')?.addEventListener('click', openJsqrScanner);

    // Кнопки закрытия модалок
    document.getElementById('close-scanner')?.addEventListener('click', closeScanner);
    document.getElementById('close-zbar-scanner')?.addEventListener('click', closeZbarScanner);
    document.getElementById('close-scanbot-scanner')?.addEventListener('click', closeScanbotScanner);
    document.getElementById('close-jsqr-scanner')?.addEventListener('click', closeJsqrScanner);

    // Главное поле ручного ввода (вне модалок)
    document.getElementById('manual-submit')?.addEventListener('click', handleManualInput);
    document.getElementById('manual-code')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleManualInput();
    });

    // Поля ручного ввода внутри каждой модалки
    bindModalManualInput('manual-code-modal',   'manual-submit-modal',   closeScanner);
    bindModalManualInput('manual-code-zbar',    'manual-submit-zbar',    closeZbarScanner);
    bindModalManualInput('manual-code-scanbot', 'manual-submit-scanbot', closeScanbotScanner);
    bindModalManualInput('manual-code-jsqr',    'manual-submit-jsqr',    closeJsqrScanner);
}

function bindModalManualInput(inputId, buttonId, closeFn) {
    const input  = document.getElementById(inputId);
    const button = document.getElementById(buttonId);
    const submit = async () => {
        const code = input?.value.trim();
        if (!code) return;
        await handleCodeScan(code);
        input.value = '';
        closeFn();
    };
    button?.addEventListener('click', submit);
    input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
}

// Авто-запуск
document.addEventListener('DOMContentLoaded', initScannerButtons);
