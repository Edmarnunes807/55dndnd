// ============================================
// CONFIGURAÇÕES GLOBAIS
// ============================================

// COLE A URL DO SEU APPS SCRIPT AQUI ⬇️
const GOOGLE_SHEETS_API = "https://script.google.com/macros/s/AKfycbxi90miW5pVxtL78ZD8_8leS4XoN6BIGvtJNmm8yv2nDaNo8CdNxzJjLd0NcSWiI9NPww/exec";

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
let isModalOpen = false;

// ============================================
// ELEMENTOS DOM
// ============================================
const scannerContainer = document.getElementById('scannerContainer');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const testBtn = document.getElementById('testBtn');
const confirmModal = document.getElementById('confirmModal');
const scannedCodeElement = document.getElementById('scannedCode');
const quantityInput = document.getElementById('quantity');
const cancelBtn = document.getElementById('cancelBtn');
const saveBtn = document.getElementById('saveBtn');
const statusMessage = document.getElementById('statusMessage');
const loading = document.getElementById('loading');

// ============================================
// FUNÇÕES PRINCIPAIS
// ============================================

// INICIALIZAÇÃO
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Scanner Rápido Inicializado');
    
    // Testar conexão inicial
    setTimeout(testApiConnection, 1500);
    
    // Testar permissão de câmera
    testCameraPermission();
    
    // Configurar eventos
    setupEventListeners();
    
    // Adicionar botão de teste direto
    addTestButton();
});

// CONFIGURAR EVENT LISTENERS
function setupEventListeners() {
    startBtn.addEventListener('click', initScanner);
    stopBtn.addEventListener('click', stopScanner);
    testBtn.addEventListener('click', testApiConnection);
    cancelBtn.addEventListener('click', handleCancel);
    saveBtn.addEventListener('click', saveToGoogleSheets);
    
    // Eventos de teclado
    quantityInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            saveToGoogleSheets();
        }
    });
    
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && isModalOpen) {
            handleCancel();
        }
    });
    
    // Fechar modal ao clicar fora
    confirmModal.addEventListener('click', function(e) {
        if (e.target === confirmModal) {
            handleCancel();
        }
    });
}

// ============================================
// FUNÇÕES DA API
// ============================================

// TESTAR CONEXÃO COM A API
async function testApiConnection() {
    try {
        showStatus('🔍 Testando conexão com servidor...', 'info');
        
        const testUrl = `${GOOGLE_SHEETS_API}?operation=ping&t=${Date.now()}`;
        console.log('Testando URL:', testUrl);
        
        const response = await fetch(testUrl);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const result = await response.json();
        console.log('Resposta do ping:', result);
        
        if (result.success) {
            showStatus('✅ API conectada com sucesso!', 'success');
            return true;
        } else {
            showStatus('❌ API retornou erro: ' + (result.error || 'Desconhecido'), 'error');
            return false;
        }
        
    } catch (error) {
        console.error('❌ Erro na conexão:', error);
        showStatus(`❌ Falha na conexão: ${error.message}`, 'error');
        return false;
    }
}

// SALVAR DADOS VIA GET (MÉTODO CORRETO)
async function saveToGoogleSheets() {
    const quantidade = quantityInput.value.trim();
    const code = scannedCodeElement.textContent;
    
    // Validação
    if (!quantidade || isNaN(quantidade) || quantidade < 1) {
        showStatus('❌ Digite uma quantidade válida!', 'error');
        quantityInput.focus();
        quantityInput.select();
        return;
    }
    
    if (!code || code.length < 8) {
        showStatus('❌ Código inválido!', 'error');
        return;
    }
    
    // Mostrar loading
    loading.style.display = 'block';
    saveBtn.disabled = true;
    cancelBtn.disabled = true;
    
    try {
        // CONSTRUIR URL COM PARÂMETROS GET
        const params = new URLSearchParams({
            operation: 'save',
            ean: code,
            quantidade: parseInt(quantidade),
            timestamp: new Date().getTime(),
            source: 'scanner_app',
            version: '1.0'
        });
        
        const url = `${GOOGLE_SHEETS_API}?${params.toString()}`;
        console.log('📤 Enviando dados via GET:', url);
        
        // FAZER REQUISIÇÃO GET (NÃO POST!)
        const response = await fetch(url);
        console.log('📥 Status da resposta:', response.status);
        
        // Tentar parsear JSON
        let result;
        try {
            result = await response.json();
            console.log('📥 Resposta JSON:', result);
        } catch (jsonError) {
            // Se não for JSON, tentar ler como texto
            const text = await response.text();
            console.error('❌ Resposta não é JSON:', text.substring(0, 200));
            throw new Error('Resposta inválida do servidor');
        }
        
        // Verificar resultado
        if (result && result.success) {
            // Sucesso!
            showStatus(`✅ Salvo com sucesso! ${code} x${quantidade}`, 'success');
            
            // Feedback tátil
            if (navigator.vibrate) {
                navigator.vibrate([100, 50, 100]);
            }
            
            // Fechar modal após 1.5 segundos
            setTimeout(() => {
                closeConfirmationModal();
                
                // Reiniciar scanner após 1 segundo
                setTimeout(() => {
                    if (!isModalOpen) {
                        initScanner();
                    }
                }, 1000);
            }, 1500);
            
        } else {
            // Erro do servidor
            const errorMsg = result?.error || result?.details || 'Erro desconhecido no servidor';
            console.error('❌ Erro na resposta:', errorMsg);
            throw new Error(errorMsg);
        }
        
    } catch (error) {
        console.error('❌ Erro ao salvar:', error);
        
        // Mensagem de erro amigável
        let userMessage = error.message;
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            userMessage = 'Falha na conexão. Verifique sua internet.';
        } else if (error.message.includes('CORS')) {
            userMessage = 'Erro de configuração do servidor.';
        }
        
        showStatus(`❌ ${userMessage}`, 'error');
        
        // Restaurar interface
        loading.style.display = 'none';
        saveBtn.disabled = false;
        cancelBtn.disabled = false;
        
        // Manter modal aberto para nova tentativa
        quantityInput.focus();
        quantityInput.select();
    }
}

// ============================================
// FUNÇÕES DO SCANNER
// ============================================

// INICIAR SCANNER
async function initScanner() {
    if (isScanning) return;
    
    try {
        showStatus('📷 Iniciando câmera...', 'info');
        
        // Mostrar área do scanner
        scannerContainer.style.display = 'block';
        startBtn.style.display = 'none';
        stopBtn.style.display = 'inline-flex';
        stopBtn.disabled = false;
        
        // Verificar biblioteca
        if (typeof Html5Qrcode === 'undefined') {
            throw new Error('Biblioteca do scanner não foi carregada');
        }
        
        // Configuração do scanner
        const config = {
            fps: 30,
            qrbox: { width: 280, height: 180 },
            aspectRatio: 4/3,
            formatsToSupport: [
                Html5QrcodeSupportedFormats.EAN_13,
                Html5QrcodeSupportedFormats.EAN_8,
                Html5QrcodeSupportedFormats.UPC_A,
                Html5QrcodeSupportedFormats.UPC_E,
                Html5QrcodeSupportedFormats.CODE_128,
                Html5QrcodeSupportedFormats.CODE_39,
                Html5QrcodeSupportedFormats.QR_CODE
            ],
            showTorchButtonIfSupported: true,
            showZoomSliderIfSupported: true
        };
        
        // Criar instância do scanner
        html5QrCode = new Html5Qrcode("reader");
        
        // Tentar usar câmera traseira
        const rearCameraId = await findRearCamera();
        
        if (rearCameraId) {
            // Usar câmera específica
            await html5QrCode.start(
                rearCameraId,
                config,
                onScanSuccess,
                onScanError
            );
            currentCameraId = rearCameraId;
        } else {
            // Fallback para modo ambiente
            await html5QrCode.start(
                { facingMode: "environment" },
                config,
                onScanSuccess,
                onScanError
            );
            currentCameraId = "environment";
        }
        
        // Sucesso
        isScanning = true;
        showStatus('✅ Scanner ativo! Aponte para um código...', 'success');
        
    } catch (error) {
        console.error('❌ Erro ao iniciar scanner:', error);
        await handleScannerError(error);
    }
}

// ENCONTRAR CÂMERA TRASEIRA
async function findRearCamera() {
    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
            return null;
        }
        
        const devices = await navigator.mediaDevices.enumerateDevices();
        cameras = devices.filter(device => device.kind === 'videoinput');
        
        console.log('📸 Câmeras encontradas:', cameras.map(c => c.label || 'Sem nome'));
        
        // Buscar câmera traseira
        for (const device of cameras) {
            if (!device.label) continue;
            
            const label = device.label.toLowerCase();
            const isRearCamera = REAR_CAMERA_KEYWORDS.some(keyword => 
                label.includes(keyword.toLowerCase())
            );
            
            if (isRearCamera) {
                console.log('✅ Câmera traseira encontrada:', device.label);
                currentCameraIndex = cameras.indexOf(device);
                return device.deviceId;
            }
        }
        
        // Se não encontrou, usar a última câmera (geralmente é a traseira em dispositivos móveis)
        if (cameras.length > 0) {
            console.log('⚠️  Usando última câmera disponível:', cameras[cameras.length - 1].label);
            currentCameraIndex = cameras.length - 1;
            return cameras[cameras.length - 1].deviceId;
        }
        
        return null;
        
    } catch (error) {
        console.error("❌ Erro ao buscar câmeras:", error);
        return null;
    }
}

// HANDLE SCANNER ERROR
async function handleScannerError(error) {
    console.error('Scanner error:', error);
    
    // Tentar parar o scanner
    if (html5QrCode) {
        try {
            await html5QrCode.stop();
            html5QrCode.clear();
        } catch (stopError) {
            console.log('Erro ao parar scanner:', stopError);
        }
    }
    
    // Resetar variáveis
    isScanning = false;
    html5QrCode = null;
    currentCameraId = null;
    
    // Resetar interface
    scannerContainer.style.display = 'none';
    startBtn.style.display = 'inline-flex';
    stopBtn.style.display = 'none';
    stopBtn.disabled = true;
    
    // Mostrar mensagem de erro apropriada
    if (error.message && error.message.includes('NotAllowedError')) {
        showStatus('❌ Permissão da câmera negada. Permita o acesso à câmera nas configurações do navegador.', 'error');
    } else if (error.message && error.message.includes('NotFoundError')) {
        showStatus('❌ Nenhuma câmera encontrada no dispositivo.', 'error');
    } else if (error.message && error.message.includes('NotSupportedError')) {
        showStatus('❌ Navegador não suporta esta funcionalidade.', 'error');
    } else if (error.message && error.message.includes('NotReadableError')) {
        showStatus('❌ Câmera já está em uso por outra aplicação.', 'error');
    } else {
        showStatus('❌ Erro ao acessar a câmera: ' + error.message, 'error');
    }
}

// SUCESSO NO SCAN
function onScanSuccess(decodedText, decodedResult) {
    const now = Date.now();
    const code = decodedText.trim();
    
    // Validar código
    if (!isValidBarcode(code)) {
        console.log('Código inválido ignorado:', code);
        return;
    }
    
    // Prevenir scans duplicados rápidos
    if (code === lastScanned && (now - lastScanTime) < 2000) {
        console.log('Scan duplicado ignorado:', code);
        return;
    }
    
    // Atualizar último scan
    lastScanned = code;
    lastScanTime = now;
    
    console.log('✅ Código escaneado:', code);
    showStatus(`📷 Código detectado: ${code}`, 'success');
    
    // Parar scanner imediatamente
    if (html5QrCode && isScanning) {
        html5QrCode.pause();
        
        setTimeout(async () => {
            try {
                await html5QrCode.stop();
                html5QrCode.clear();
                
                isScanning = false;
                html5QrCode = null;
                
                // Esconder scanner
                scannerContainer.style.display = 'none';
                startBtn.style.display = 'inline-flex';
                stopBtn.style.display = 'none';
                
                // Mostrar modal de confirmação
                showConfirmationModal(code);
                
            } catch (error) {
                console.error('Erro ao parar scanner:', error);
            }
        }, 100);
    }
}

// ERRO NO SCAN
function onScanError(error) {
    // Ignorar erros comuns que não afetam a funcionalidade
    if (!error || typeof error !== 'string') return;
    
    if (!error.includes("No MultiFormat Readers")) {
        console.log('Scan error (não crítico):', error);
    }
}

// PARAR SCANNER
async function stopScanner() {
    if (!html5QrCode || !isScanning) return;
    
    try {
        await html5QrCode.stop();
        html5QrCode.clear();
        
        isScanning = false;
        html5QrCode = null;
        currentCameraId = null;
        
        // Atualizar interface
        scannerContainer.style.display = 'none';
        startBtn.style.display = 'inline-flex';
        stopBtn.style.display = 'none';
        stopBtn.disabled = true;
        
        showStatus('⏹ Scanner parado manualmente.', 'info');
        
    } catch (error) {
        console.error('Erro ao parar scanner:', error);
        showStatus('❌ Erro ao parar scanner.', 'error');
    }
}

// VALIDAR CÓDIGO DE BARRAS
function isValidBarcode(code) {
    if (!code || code.trim() === '') return false;
    
    // Aceita QR codes (qualquer texto)
    if (code.length > 13) return true;
    
    // Para códigos de barras, verifica se são apenas dígitos
    if (!/^\d+$/.test(code)) return false;
    
    // Comprimento comum de códigos EAN/UPC
    const validLengths = [8, 12, 13, 14];
    return validLengths.includes(code.length);
}

// ============================================
// FUNÇÕES DA INTERFACE
// ============================================

// MOSTRAR MODAL DE CONFIRMAÇÃO
function showConfirmationModal(code) {
    isModalOpen = true;
    
    scannedCodeElement.textContent = code;
    quantityInput.value = '1';
    
    confirmModal.style.display = 'flex';
    
    // Focar no campo de quantidade
    setTimeout(() => {
        quantityInput.focus();
        quantityInput.select();
    }, 100);
    
    // Feedback tátil
    if (navigator.vibrate) {
        navigator.vibrate(200);
    }
}

// FECHAR MODAL
function closeConfirmationModal() {
    isModalOpen = false;
    confirmModal.style.display = 'none';
    loading.style.display = 'none';
    saveBtn.disabled = false;
    cancelBtn.disabled = false;
}

// HANDLE CANCEL
function handleCancel() {
    closeConfirmationModal();
    
    // Reiniciar scanner após breve delay
    setTimeout(() => {
        if (!isModalOpen) {
            initScanner();
        }
    }, 500);
}

// MOSTRAR STATUS
function showStatus(message, type = 'info') {
    statusMessage.textContent = message;
    statusMessage.className = `status ${type}`;
    statusMessage.style.display = 'block';
    
    // Auto-esconder mensagens após alguns segundos
    if (type === 'success') {
        setTimeout(() => {
            if (statusMessage.textContent === message) {
                statusMessage.style.display = 'none';
            }
        }, 5000);
    } else if (type === 'info') {
        setTimeout(() => {
            if (statusMessage.textContent === message) {
                statusMessage.style.display = 'none';
            }
        }, 3000);
    }
}

// TESTAR PERMISSÃO DA CÂMERA
function testCameraPermission() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showStatus('❌ Navegador não suporta acesso à câmera', 'error');
        startBtn.disabled = true;
        return;
    }
    
    navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
            // Parar stream de teste
            stream.getTracks().forEach(track => track.stop());
            showStatus('✅ Câmera disponível', 'success');
        })
        .catch(err => {
            console.log('Permissão da câmera:', err);
            showStatus('⚠️ Permita o acesso à câmera para usar o scanner', 'warning');
        });
}

// ============================================
// FUNÇÕES DE TESTE
// ============================================

// ADICIONAR BOTÃO DE TESTE
function addTestButton() {
    const testSaveBtn = document.createElement('button');
    testSaveBtn.className = 'btn';
    testSaveBtn.innerHTML = '🧪 Testar Envio';
    testSaveBtn.style.marginTop = '10px';
    testSaveBtn.onclick = testDirectSave;
    
    document.querySelector('.controls').appendChild(testSaveBtn);
}

// TESTE DIRETO DE ENVIO
async function testDirectSave() {
    try {
        showStatus('🧪 Testando envio direto...', 'info');
        
        const testCode = '789' + Math.floor(Math.random() * 1000000000).toString().padStart(10, '0');
        const testQty = Math.floor(Math.random() * 10) + 1;
        
        const params = new URLSearchParams({
            operation: 'save',
            ean: testCode,
            quantidade: testQty,
            timestamp: Date.now(),
            source: 'test_button',
            test: 'true'
        });
        
        const url = `${GOOGLE_SHEETS_API}?${params.toString()}`;
        console.log('🧪 URL de teste:', url);
        
        const response = await fetch(url);
        const result = await response.json();
        
        console.log('🧪 Resultado do teste:', result);
        
        if (result.success) {
            showStatus(`🧪 Teste OK! Enviado: ${testCode} x${testQty}`, 'success');
        } else {
            showStatus(`🧪 Teste falhou: ${result.error}`, 'error');
        }
        
    } catch (error) {
        console.error('❌ Erro no teste:', error);
        showStatus(`🧪 Teste falhou: ${error.message}`, 'error');
    }
}

// TESTE DE SCAN SIMULADO (para desenvolvimento)
function simulateScan(code = '7891234567890') {
    if (isScanning) {
        onScanSuccess(code, {});
    } else {
        showConfirmationModal(code);
    }
}

// ============================================
// FUNÇÕES DE DEBUG
// ============================================

// DEBUG: Exibir informações no console
function debugInfo() {
    console.log('=== DEBUG INFO ===');
    console.log('API URL:', GOOGLE_SHEETS_API);
    console.log('Scanner ativo:', isScanning);
    console.log('Modal aberto:', isModalOpen);
    console.log('Último código:', lastScanned);
    console.log('Câmeras disponíveis:', cameras.length);
    console.log('Câmera atual:', currentCameraId);
    console.log('Permissão de câmera:', navigator.permissions ? 'Disponível' : 'Não disponível');
    console.log('==================');
}

// TESTAR TUDO
async function runAllTests() {
    console.log('🧪 INICIANDO TESTES COMPLETOS');
    
    // Teste 1: Conexão API
    const apiTest = await testApiConnection();
    if (!apiTest) return false;
    
    // Teste 2: Envio direto
    await testDirectSave();
    
    // Teste 3: Câmera
    if (navigator.mediaDevices) {
        console.log('✅ Navegador suporta câmera');
    } else {
        console.log('❌ Navegador NÃO suporta câmera');
    }
    
    console.log('🧪 TESTES CONCLUÍDOS');
    return true;
}

// Adicionar atalhos de teclado para debug
document.addEventListener('keydown', function(e) {
    // Ctrl+Shift+D para debug
    if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        debugInfo();
    }
    
    // Ctrl+Shift+T para testes
    if (e.ctrlKey && e.shiftKey && e.key === 'T') {
        runAllTests();
    }
    
    // Ctrl+Shift+S para scan simulado
    if (e.ctrlKey && e.shiftKey && e.key === 'S') {
        simulateScan();
    }
});

// ============================================
// EXPORTAÇÃO PARA DESENVOLVIMENTO
// ============================================

// Disponibilizar funções para o console do navegador
window.ScannerApp = {
    initScanner,
    stopScanner,
    testApiConnection,
    testDirectSave,
    simulateScan,
    runAllTests,
    debugInfo,
    showStatus,
    get API_URL() { return GOOGLE_SHEETS_API; },
    get isScanning() { return isScanning; },
    get lastScanned() { return lastScanned; }
};

console.log('🛠️  ScannerApp disponível no console. Use ScannerApp.debugInfo() para informações.');
