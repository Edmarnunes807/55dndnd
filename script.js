// ========== CONFIGURAÇÕES ==========
const GOOGLE_SHEETS_API = "https://script.google.com/macros/s/AKfycbxi90miW5pVxtL78ZD8_8leS4XoN6BIGvtJNmm8yv2nDaNo8CdNxzJjLd0NcSWiI9NPww/exec";
const REAR_CAMERA_KEYWORDS = ["back", "rear", "environment", "traseira", "camera 0"];

// ========== VARIÁVEIS GLOBAIS ==========
let html5QrCode = null;
let currentCameraId = null;
let isScanning = false;
let lastScanned = '';
let lastScanTime = 0;
let cameras = [];
let currentCameraIndex = 0;

// ========== ELEMENTOS DOM ==========
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

// ========== FUNÇÕES DO SCANNER (EXATAMENTE COMO NO SEU CÓDIGO) ==========
async function initScanner() {
    if (isScanning) return;
    
    try {
        updateStatus('Iniciando câmera...', 'info');
        
        // Mostrar interface do scanner - EXATAMENTE como estava
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
        
        // Tentar encontrar câmera traseira - EXATAMENTE como estava
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
                    // AUTOFOCUS ADICIONADO AQUI
                    advanced: [{ focusMode: "continuous" }]
                }
            };
            
            await html5QrCode.start(
                rearCameraId,
                cameraConfig,
                onScanSuccess,
                onScanError
            );
            
            // ATIVAR AUTOFOCUS APÓS INICIAR
            setTimeout(enableAutofocus, 1000);
            
        } else {
            // Fallback para modo ambiente - EXATAMENTE como estava
            const fallbackConfig = {
                ...config,
                videoConstraints: {
                    facingMode: { exact: "environment" },
                    width: { min: 1280, ideal: 1920 },
                    height: { min: 720, ideal: 1080 },
                    // AUTOFOCUS ADICIONADO AQUI
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
            
            // ATIVAR AUTOFOCUS APÓS INICIAR
            setTimeout(enableAutofocus, 1000);
        }
        
        updateStatus('✅ Scanner ativo! Aponte para um código...', 'success');
        isScanning = true;
        stopBtn.disabled = false;
        
    } catch (error) {
        console.error('Erro ao iniciar scanner:', error);
        await handleScannerError(error);
    }
}

// ========== FUNÇÃO DE AUTOFOCUS (RESTAURADA) ==========
async function enableAutofocus() {
    try {
        if (!html5QrCode || !isScanning) return;
        
        // Tentar obter o elemento de vídeo
        const videoElement = document.querySelector('#reader video');
        if (!videoElement) {
            console.log('Elemento de vídeo não encontrado para autofocus');
            return;
        }
        
        // Obter a track de vídeo
        const videoStream = videoElement.srcObject;
        if (!videoStream) return;
        
        const videoTrack = videoStream.getVideoTracks()[0];
        if (!videoTrack) return;
        
        // Tentar aplicar configurações de foco
        const capabilities = videoTrack.getCapabilities();
        
        if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
            // Suporte a autofocus contínuo
            await videoTrack.applyConstraints({
                advanced: [{ focusMode: 'continuous' }]
            });
            console.log('✅ Autofocus contínuo ativado');
        } 
        else if (capabilities.focusMode && capabilities.focusMode.includes('single-shot')) {
            // Suporte a foco single-shot
            await videoTrack.applyConstraints({
                advanced: [{ focusMode: 'single-shot' }]
            });
            console.log('✅ Foco single-shot ativado');
        }
        else if (capabilities.focusDistance) {
            // Ajustar distância de foco
            await videoTrack.applyConstraints({
                advanced: [{ focusDistance: 0 }] // 0 = foco automático
            });
            console.log('✅ Foco automático ajustado');
        }
        
    } catch (focusError) {
        console.log('⚠️  Não foi possível ativar autofocus:', focusError);
        // Não é crítico, apenas log
    }
}

// ========== FUNÇÃO PARA FORÇAR FOCO (ÚTIL PARA BAIXA LUMINOSIDADE) ==========
async function forceFocus() {
    try {
        if (!html5QrCode || !isScanning) return;
        
        const videoElement = document.querySelector('#reader video');
        if (!videoElement) return;
        
        const videoStream = videoElement.srcObject;
        if (!videoStream) return;
        
        const videoTrack = videoStream.getVideoTracks()[0];
        if (!videoTrack) return;
        
        const capabilities = videoTrack.getCapabilities();
        
        // Tentar diferentes métodos de foco
        if (capabilities.focusMode) {
            // Ciclar entre modos de foco para forçar ajuste
            await videoTrack.applyConstraints({
                advanced: [{ focusMode: 'manual' }]
            });
            
            await new Promise(resolve => setTimeout(resolve, 100));
            
            await videoTrack.applyConstraints({
                advanced: [{ focusMode: 'continuous' }]
            });
            
            console.log('🔍 Foco forçado/reiniciado');
            updateStatus('🔍 Ajustando foco...', 'info');
        }
        
    } catch (error) {
        console.log('Erro ao forçar foco:', error);
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

// ========== FUNÇÃO ONSCANSUCCESS EXATAMENTE COMO NO SEU CÓDIGO ==========
function onScanSuccess(decodedText, decodedResult) {
    const now = Date.now();
    const code = decodedText.trim();
    
    if (!isValidBarcode(code)) return;
    if (code === lastScanned && (now - lastScanTime) < 2000) return;
    
    lastScanned = code;
    lastScanTime = now;
    
    updateStatus(`📷 Código detectado: ${code}`, 'success');
    
    // PARAR O SCANNER IMEDIATAMENTE - EXATAMENTE como estava
    if (html5QrCode) {
        html5QrCode.pause();
        setTimeout(() => {
            if (html5QrCode && isScanning) {
                html5QrCode.stop().then(() => {
                    html5QrCode.clear();
                    isScanning = false;
                    
                    // Fechar a visualização da câmera
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

// ========== MODAL DE CONFIRMAÇÃO ==========
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

// ========== FUNÇÃO SALVAR CORRIGIDA (USANDO GET) ==========
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
        // CONSTRUIR URL GET (NÃO POST!)
        const params = new URLSearchParams({
            operation: 'save',           // A API espera 'save'
            ean: code,                   // Código do produto
            quantidade: parseInt(quantidade), // Quantidade como número
            timestamp: new Date().getTime(), // Timestamp atual
            source: 'scanner_app'        // Identificador da origem
        });
        
        const url = `${GOOGLE_SHEETS_API}?${params.toString()}`;
        console.log('📤 Enviando via GET:', url);
        
        // FAZER REQUISIÇÃO GET (IMPORTANTE!)
        const response = await fetch(url);
        console.log('📥 Status da resposta:', response.status);
        
        // Verificar resposta
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const result = await response.json();
        console.log('📥 Resposta do servidor:', result);
        
        if (result.success) {
            updateStatus(`✅ Salvo! ${code} - Qtd: ${quantidade}`, 'success');
            
            // Fechar modal e retomar scanner
            setTimeout(() => {
                confirmModal.style.display = 'none';
                loading.style.display = 'none';
                saveBtn.disabled = false;
                cancelBtn.disabled = false;
                
                // Retomar scanner após 1 segundo
                setTimeout(() => {
                    initScanner();
                }, 1000);
            }, 1500);
            
        } else {
            throw new Error(result.error || 'Erro desconhecido no servidor');
        }
        
    } catch (error) {
        console.error('❌ Erro ao salvar:', error);
        updateStatus(`❌ Erro: ${error.message}`, 'error');
        loading.style.display = 'none';
        saveBtn.disabled = false;
        cancelBtn.disabled = false;
        
        // Se der erro, manter modal aberto para tentar novamente
        quantityInput.focus();
        quantityInput.select();
    }
}

// ========== FUNÇÃO PARA TESTAR CONEXÃO ==========
async function testConnection() {
    try {
        updateStatus('🔄 Testando conexão com servidor...', 'info');
        
        // Testar ping usando GET
        const response = await fetch(`${GOOGLE_SHEETS_API}?operation=ping`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            updateStatus('✅ Conexão com servidor OK!', 'success');
            return true;
        } else {
            throw new Error('Servidor retornou erro');
        }
        
    } catch (error) {
        updateStatus(`❌ Falha na conexão: ${error.message}`, 'error');
        return false;
    }
}

// ========== FUNÇÕES AUXILIARES ==========
function updateStatus(message, type = 'info') {
    statusMessage.textContent = message;
    statusMessage.className = `status ${type}`;
    statusMessage.style.display = 'block';
    
    if (type !== 'error') {
        setTimeout(() => {
            statusMessage.style.display = 'none';
        }, 4000);
    }
}

// ========== EVENT LISTENERS ==========
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
        saveBtn.click();
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && confirmModal.style.display === 'flex') {
        cancelBtn.click();
    }
    // Atalho para forçar foco (Ctrl+F)
    if (e.ctrlKey && e.key === 'f' && isScanning) {
        e.preventDefault();
        forceFocus();
    }
});

// ========== ADICIONAR BOTÃO DE CONTROLE DE FOCO ==========
document.addEventListener('DOMContentLoaded', function() {
    // Adicionar botão de foco na interface
    const focusBtn = document.createElement('button');
    focusBtn.id = 'focusBtn';
    focusBtn.className = 'btn';
    focusBtn.innerHTML = '🔍 Forçar Foco';
    focusBtn.style.display = 'none';
    focusBtn.style.marginTop = '10px';
    focusBtn.onclick = forceFocus;
    
    document.querySelector('.controls').appendChild(focusBtn);
    
    // Mostrar/ocultar botão de foco conforme estado do scanner
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.attributeName === 'style') {
                const isScannerVisible = scannerContainer.style.display === 'block';
                focusBtn.style.display = isScannerVisible ? 'inline-flex' : 'none';
            }
        });
    });
    
    observer.observe(scannerContainer, { attributes: true });
});

// ========== INICIALIZAÇÃO ==========
document.addEventListener('DOMContentLoaded', () => {
    // Testar permissão de câmera
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ video: true })
            .then(() => {
                updateStatus('✅ Pronto para escanear', 'success');
            })
            .catch(err => {
                updateStatus('⚠️ Permissão de câmera necessária', 'info');
            });
    } else {
        updateStatus('❌ Navegador não suporta câmera', 'error');
    }
    
    // Testar conexão com API após 2 segundos
    setTimeout(() => {
        testConnection();
    }, 2000);
});
