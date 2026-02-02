// ============================================
// CONFIGURAÇÕES GLOBAIS
// ============================================
const GOOGLE_SHEETS_API = "https://script.google.com/macros/s/AKfycbzhcpS4DTvz87CfrUF5GyNJcokU8aJr_EPznJUGYBB4Bn6QBqJw4yplGyCkLRi0WlD4jQ/exec";
const REAR_CAMERA_KEYWORDS = ["back", "rear", "environment", "traseira", "camera 0"];

// ============================================
// VARIÁVEIS GLOBAIS
// ============================================
let html5QrCode = null;
let currentCameraId = null;
let isScanning = false;
let lastScanned = '';
let lastScanTime = 0;
let cameras = [];
let currentCameraIndex = 0;

// ============================================
// ELEMENTOS DOM
// ============================================
const scannerContainer = document.getElementById('scannerContainer');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const confirmModal = document.getElementById('confirmModal');
const scannedCodeElement = document.getElementById('scannedCode');
const quantityInput = document.getElementById('quantity');
const cancelBtn = document.getElementById('cancelBtn');
const saveBtn = document.getElementById('saveBtn');
const statusMessage = document.getElementById('statusMessage');
const loading = document.getElementById('loading');

// ============================================
// INICIALIZAÇÃO
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Scanner Rápido inicializado');
    
    // Testar conexão inicial
    setTimeout(testApiConnection, 1000);
    
    // Configurar eventos
    setupEventListeners();
    
    // Testar permissão da câmera
    testCameraPermission();
});

// ============================================
// FUNÇÕES DO SCANNER
// ============================================
async function initScanner() {
    if (isScanning) return;
    
    try {
        updateStatus('📷 Iniciando câmera...', 'info');
        
        // Mostrar interface do scanner
        scannerContainer.style.display = 'block';
        startBtn.style.display = 'none';
        stopBtn.style.display = 'inline-flex';
        
        const config = {
            fps: 30,
            qrbox: { width: 300, height: 200 },
            aspectRatio: 4/3,
            formatsToSupport: [
                Html5QrcodeSupportedFormats.EAN_13,
                Html5QrcodeSupportedFormats.EAN_8,
                Html5QrcodeSupportedFormats.UPC_A,
                Html5QrcodeSupportedFormats.UPC_E,
                Html5QrcodeSupportedFormats.CODE_128,
                Html5QrcodeSupportedFormats.CODE_39,
                Html5QrcodeSupportedFormats.QR_CODE
            ]
        };
        
        // Verificar se a biblioteca está disponível
        if (typeof Html5Qrcode === 'undefined') {
            throw new Error('Biblioteca de scanner não carregada');
        }
        
        html5QrCode = new Html5Qrcode("reader");
        
        // Tentar encontrar câmera traseira
        const rearCameraId = await findRearCamera();
        
        if (rearCameraId) {
            currentCameraId = rearCameraId;
            
            const cameraConfig = {
                ...config,
                videoConstraints: {
                    deviceId: { exact: rearCameraId },
                    width: { min: 1280, ideal: 1920, max: 2560 },
                    height: { min: 720, ideal: 1080, max: 1440 },
                    frameRate: { ideal: 30, min: 24 },
                    advanced: [{ focusMode: "continuous" }]
                }
            };
            
            await html5QrCode.start(
                rearCameraId,
                cameraConfig,
                onScanSuccess,
                onScanError
            );
            
            // Ativar autofocus após iniciar
            setTimeout(enableAutofocus, 800);
            
        } else {
            // Fallback para modo ambiente
            const fallbackConfig = {
                ...config,
                videoConstraints: {
                    facingMode: { exact: "environment" },
                    width: { min: 1280, ideal: 1920 },
                    height: { min: 720, ideal: 1080 },
                    advanced: [{ focusMode: "continuous" }]
                }
            };
            
            await html5QrCode.start(
                { facingMode: "environment" },
                fallbackConfig,
                onScanSuccess,
                onScanError
            );
            
            currentCameraId = "environment";
            
            // Ativar autofocus após iniciar
            setTimeout(enableAutofocus, 800);
        }
        
        updateStatus('✅ Scanner ativo! Aponte para um código...', 'success');
        isScanning = true;
        stopBtn.disabled = false;
        
    } catch (error) {
        console.error('Erro ao iniciar scanner:', error);
        await handleScannerError(error);
    }
}

async function findRearCamera() {
    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
            return null;
        }
        
        const devices = await navigator.mediaDevices.enumerateDevices();
        cameras = devices.filter(device => device.kind === 'videoinput');
        
        const exactCamera = cameras.find(device => 
            device.label && device.label.includes("camera 0, facing back")
        );
        
        if (exactCamera) {
            currentCameraIndex = cameras.indexOf(exactCamera);
            return exactCamera.deviceId;
        }
        
        const rearCamera = cameras.find(device => {
            if (!device.label) return false;
            const label = device.label.toLowerCase();
            return REAR_CAMERA_KEYWORDS.some(keyword => 
                label.includes(keyword.toLowerCase())
            );
        });
        
        if (rearCamera) {
            currentCameraIndex = cameras.indexOf(rearCamera);
            return rearCamera.deviceId;
        }
        
        if (cameras.length > 1) {
            currentCameraIndex = cameras.length - 1;
            return cameras[cameras.length - 1].deviceId;
        }
        
        if (cameras.length === 1) {
            currentCameraIndex = 0;
            return cameras[0].deviceId;
        }
        
        return null;
        
    } catch (error) {
        console.error("Erro ao encontrar câmera:", error);
        return null;
    }
}

async function handleScannerError(error) {
    if (html5QrCode) {
        try {
            await html5QrCode.stop();
            html5QrCode.clear();
        } catch (e) {
            console.log('Erro ao parar scanner:', e);
        }
    }
    
    isScanning = false;
    html5QrCode = null;
    currentCameraId = null;
    
    scannerContainer.style.display = 'none';
    startBtn.style.display = 'inline-flex';
    stopBtn.style.display = 'none';
    stopBtn.disabled = true;
    
    if (error.message && error.message.includes('permission')) {
        updateStatus('❌ Permissão da câmera negada.', 'error');
    } else if (error.message && error.message.includes('NotFoundError')) {
        updateStatus('❌ Nenhuma câmera encontrada.', 'error');
    } else {
        updateStatus('❌ Erro ao iniciar scanner.', 'error');
    }
}

function onScanError(error) {
    if (!error || typeof error !== 'string' || !error.includes("No MultiFormat Readers")) {
        console.log('Erro de scan:', error);
    }
}

function onScanSuccess(decodedText, decodedResult) {
    const now = Date.now();
    const code = decodedText.trim();
    
    if (!isValidBarcode(code)) return;
    if (code === lastScanned && (now - lastScanTime) < 2000) return;
    
    lastScanned = code;
    lastScanTime = now;
    
    updateStatus(`📷 Código detectado: ${code}`, 'success');
    
    // Parar scanner imediatamente
    if (html5QrCode) {
        html5QrCode.pause();
        setTimeout(() => {
            if (html5QrCode && isScanning) {
                html5QrCode.stop().then(() => {
                    html5QrCode.clear();
                    isScanning = false;
                    
                    // Fechar visualização da câmera
                    scannerContainer.style.display = 'none';
                    startBtn.style.display = 'inline-flex';
                    stopBtn.style.display = 'none';
                    stopBtn.disabled = true;
                    
                    // Mostrar modal de confirmação
                    showConfirmationModal(code);
                });
            }
        }, 100);
    }
}

function isValidBarcode(code) {
    if (!/^\d+$/.test(code) && !isValidQRCode(code)) return false;
    if (/^\d+$/.test(code) && (code.length < 8 || code.length > 13)) return false;
    return true;
}

function isValidQRCode(code) {
    return code && code.trim().length > 0;
}

async function stopScanner() {
    if (html5QrCode && isScanning) {
        try {
            await html5QrCode.stop();
            html5QrCode.clear();
        } catch (error) {
            console.log('Erro ao parar scanner:', error);
        }
        
        isScanning = false;
        html5QrCode = null;
        currentCameraId = null;
        
        scannerContainer.style.display = 'none';
        startBtn.style.display = 'inline-flex';
        stopBtn.style.display = 'none';
        stopBtn.disabled = true;
        
        updateStatus('⏹ Scanner parado.', 'info');
    }
}

// ============================================
// FUNÇÃO DE AUTOFOCUS
// ============================================
async function enableAutofocus() {
    try {
        if (!html5QrCode || !isScanning) return;
        
        const videoElement = document.querySelector('#reader video');
        if (!videoElement) return;
        
        const videoStream = videoElement.srcObject;
        if (!videoStream) return;
        
        const videoTrack = videoStream.getVideoTracks()[0];
        if (!videoTrack) return;
        
        const capabilities = videoTrack.getCapabilities();
        
        if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
            await videoTrack.applyConstraints({
                advanced: [{ focusMode: 'continuous' }]
            });
        } 
        else if (capabilities.focusMode && capabilities.focusMode.includes('single-shot')) {
            await videoTrack.applyConstraints({
                advanced: [{ focusMode: 'single-shot' }]
            });
        }
        else if (capabilities.focusDistance) {
            await videoTrack.applyConstraints({
                advanced: [{ focusDistance: 0 }]
            });
        }
        
    } catch (focusError) {
        console.log('Autofocus não disponível:', focusError);
    }
}

// ============================================
// FUNÇÕES DA API - AGORA COM POST
// ============================================
async function testApiConnection() {
    try {
        updateStatus('🔗 Testando conexão...', 'info');
        
        // USANDO POST AGORA
        const formData = new URLSearchParams();
        formData.append('operation', 'ping');
        
        const response = await fetch(GOOGLE_SHEETS_API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: formData
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            updateStatus('✅ API conectada', 'success');
            return true;
        } else {
            updateStatus('❌ API retornou erro', 'error');
            return false;
        }
        
    } catch (error) {
        updateStatus('❌ Falha na conexão', 'error');
        return false;
    }
}

async function saveToGoogleSheets() {
    const quantidade = quantityInput.value.trim();
    const code = scannedCodeElement.textContent;
    
    if (!quantidade || isNaN(quantidade) || quantidade < 1) {
        updateStatus('❌ Digite uma quantidade válida!', 'error');
        quantityInput.focus();
        quantityInput.select();
        return;
    }
    
    loading.style.display = 'block';
    saveBtn.disabled = true;
    cancelBtn.disabled = true;
    
    try {
        // CRIAR FORM DATA PARA ENVIAR VIA POST
        const formData = new URLSearchParams();
        formData.append('operation', 'save');
        formData.append('ean', code);
        formData.append('quantidade', parseInt(quantidade));
        formData.append('timestamp', new Date().getTime());
        formData.append('source', 'scanner_app');
        
        console.log('📤 Enviando dados via POST:', {
            operation: 'save',
            ean: code,
            quantidade: parseInt(quantidade)
        });
        
        // FAZER REQUISIÇÃO POST
        const response = await fetch(GOOGLE_SHEETS_API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: formData
        });
        
        console.log('📥 Status da resposta:', response.status);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const result = await response.json();
        console.log('📥 Resposta do servidor:', result);
        
        if (result.success) {
            updateStatus(`✅ Salvo! ${code} x${quantidade}`, 'success');
            
            // Feedback tátil
            if (navigator.vibrate) {
                navigator.vibrate([100, 50, 100]);
            }
            
            // Fechar modal após sucesso
            setTimeout(() => {
                closeModalAndRestart();
            }, 1500);
            
        } else {
            throw new Error(result.error || 'Erro desconhecido');
        }
        
    } catch (error) {
        console.error('❌ Erro ao salvar:', error);
        
        // Mensagem de erro amigável
        let userMessage = error.message;
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            userMessage = 'Falha na conexão. Verifique sua internet.';
        }
        
        updateStatus(`❌ ${userMessage}`, 'error');
        
        loading.style.display = 'none';
        saveBtn.disabled = false;
        cancelBtn.disabled = false;
        
        quantityInput.focus();
        quantityInput.select();
    }
}

// ============================================
// FUNÇÕES DA INTERFACE
// ============================================
function showConfirmationModal(code) {
    scannedCodeElement.textContent = code;
    quantityInput.value = 1;
    quantityInput.focus();
    
    confirmModal.style.display = 'flex';
    
    // Vibração se suportado
    if (navigator.vibrate) {
        navigator.vibrate(200);
    }
}

function closeModalAndRestart() {
    confirmModal.style.display = 'none';
    loading.style.display = 'none';
    saveBtn.disabled = false;
    cancelBtn.disabled = false;
    
    // Reiniciar scanner
    setTimeout(() => {
        initScanner();
    }, 1000);
}

function updateStatus(message, type = 'info') {
    statusMessage.textContent = message;
    statusMessage.className = `status ${type}`;
    statusMessage.style.display = 'block';
    
    // Auto-esconder mensagens
    if (type === 'success') {
        setTimeout(() => {
            statusMessage.style.display = 'none';
        }, 5000);
    }
}

function testCameraPermission() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        updateStatus('❌ Navegador não suporta câmera', 'error');
        startBtn.disabled = true;
        return;
    }
    
    navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
            stream.getTracks().forEach(track => track.stop());
            updateStatus('✅ Câmera disponível', 'success');
        })
        .catch(err => {
            updateStatus('⚠️ Permita acesso à câmera', 'warning');
        });
}

// ============================================
// CONFIGURAÇÃO DE EVENTOS
// ============================================
function setupEventListeners() {
    startBtn.addEventListener('click', initScanner);
    stopBtn.addEventListener('click', stopScanner);
    
    cancelBtn.addEventListener('click', () => {
        confirmModal.style.display = 'none';
        setTimeout(() => {
            initScanner();
        }, 500);
    });
    
    saveBtn.addEventListener('click', saveToGoogleSheets);
    
    quantityInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            saveToGoogleSheets();
        }
    });
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && confirmModal.style.display === 'flex') {
            cancelBtn.click();
        }
    });
    
    // Fechar modal ao clicar fora
    confirmModal.addEventListener('click', (e) => {
        if (e.target === confirmModal) {
            cancelBtn.click();
        }
    });
}
