/**
 * ============================================
 * WhatsApp Sender - WhatsApp Module (Baileys)
 * Developed by: Carlos David Donoso Cordero (ddchack)
 * Website: carlos-donoso.com
 * Version: 1.2.0 - Compatible con Baileys 6.5.0
 * ============================================
 */

const { 
    default: makeWASocket, 
    DisconnectReason, 
    useMultiFileAuthState,
    makeCacheableSignalKeyStore,
    delay 
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');

let sock = null;
let qrCodeData = null;
let connectionStatus = 'disconnected';
let eventEmitter = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;

// Logger silencioso
const logger = pino({ level: 'silent' });

// Función para configurar el event emitter
function setEventEmitter(emitter) {
    eventEmitter = emitter;
}

// Función para emitir eventos
function emit(event, data) {
    if (eventEmitter) {
        eventEmitter.emit(event, data);
    }
}

// Iniciar conexión con WhatsApp
async function connectToWhatsApp() {
    const authPath = path.join(__dirname, 'auth');
    
    // Crear carpeta de auth si no existe
    if (!fs.existsSync(authPath)) {
        fs.mkdirSync(authPath, { recursive: true });
    }

    // Resetear intentos si es una nueva conexión manual
    reconnectAttempts = 0;

    try {
        const { state, saveCreds } = await useMultiFileAuthState(authPath);
        
        console.log('📱 Iniciando conexión con WhatsApp...');

        sock = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger),
            },
            logger,
            printQRInTerminal: false,
            browser: ['WhatsApp Sender', 'Safari', '1.0.0'],
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 0,
            retryRequestDelayMs: 250,
            maxMsgRetryCount: 5,
            markOnlineOnConnect: true,
        });

        // Manejar eventos de conexión
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            // Manejar código QR
            if (qr) {
                console.log('');
                console.log('════════════════════════════════════════');
                console.log('📱 CÓDIGO QR GENERADO');
                console.log('   Escanea con WhatsApp > Dispositivos vinculados');
                console.log('════════════════════════════════════════');
                console.log('');
                
                try {
                    qrCodeData = await QRCode.toDataURL(qr);
                    connectionStatus = 'qr';
                    emit('qr', qrCodeData);
                    emit('status', { status: 'qr' });
                } catch (err) {
                    console.error('Error generando QR:', err);
                }
            }

            // Conexión cerrada
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const reason = DisconnectReason[statusCode] || statusCode;
                
                console.log(`❌ Conexión cerrada - Razón: ${reason} (${statusCode})`);
                
                connectionStatus = 'disconnected';
                qrCodeData = null;
                emit('status', { status: 'disconnected' });

                // Manejar diferentes razones de desconexión
                if (statusCode === DisconnectReason.loggedOut) {
                    console.log('🚪 Sesión cerrada por el usuario');
                    // Limpiar carpeta auth
                    if (fs.existsSync(authPath)) {
                        fs.rmSync(authPath, { recursive: true, force: true });
                        console.log('🗑️ Sesión eliminada - Reconecta para escanear QR');
                    }
                } else if (statusCode === DisconnectReason.restartRequired) {
                    console.log('🔄 Reinicio requerido, reconectando...');
                    setTimeout(() => connectToWhatsApp(), 1000);
                } else if (statusCode === DisconnectReason.timedOut) {
                    console.log('⏱️ Tiempo de espera agotado, reconectando...');
                    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                        reconnectAttempts++;
                        setTimeout(() => connectToWhatsApp(), 3000);
                    }
                } else if (statusCode === 405) {
                    console.log('');
                    console.log('⚠️  ERROR 405 - Posibles causas:');
                    console.log('    1. Red corporativa bloqueando WebSocket');
                    console.log('    2. Firewall/Antivirus bloqueando conexión');
                    console.log('    3. VPN activa interfiriendo');
                    console.log('');
                    console.log('💡 SOLUCIONES:');
                    console.log('    - Intenta desde otra red (datos móviles/casa)');
                    console.log('    - Desactiva VPN si está activa');
                    console.log('    - Desactiva firewall temporalmente');
                    console.log('');
                } else if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                    reconnectAttempts++;
                    console.log(`🔄 Reconectando... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
                    setTimeout(() => connectToWhatsApp(), 3000);
                } else {
                    console.log('⚠️ Máximo de intentos alcanzado. Presiona Conectar de nuevo.');
                    reconnectAttempts = 0;
                }
            }

            // Conexión abierta
            if (connection === 'open') {
                console.log('');
                console.log('════════════════════════════════════════');
                console.log('✅ CONECTADO A WHATSAPP CORRECTAMENTE');
                console.log('════════════════════════════════════════');
                console.log('');
                
                connectionStatus = 'connected';
                qrCodeData = null;
                reconnectAttempts = 0;
                emit('status', { status: 'connected' });
            }
        });

        // Guardar credenciales cuando se actualicen
        sock.ev.on('creds.update', saveCreds);

        return sock;

    } catch (error) {
        console.error('❌ Error al conectar:', error.message);
        connectionStatus = 'disconnected';
        emit('status', { status: 'disconnected', error: error.message });
        throw error;
    }
}

// Obtener estado de conexión
function getConnectionStatus() {
    return {
        status: connectionStatus,
        qr: qrCodeData
    };
}

// Desconectar
async function disconnect() {
    if (sock) {
        try {
            await sock.logout();
        } catch (e) {
            // Ignorar errores al desconectar
        }
        sock = null;
        connectionStatus = 'disconnected';
        qrCodeData = null;
        reconnectAttempts = 0;
    }
}

// Formatear número de teléfono
function formatPhoneNumber(phone) {
    let cleaned = phone.toString().replace(/\D/g, '');
    
    // Si empieza con 0, asumimos que es Ecuador y quitamos el 0
    if (cleaned.startsWith('0')) {
        cleaned = '593' + cleaned.substring(1);
    }
    
    // Si no tiene código de país, agregar Ecuador (593)
    if (cleaned.length === 9 || cleaned.length === 10) {
        cleaned = '593' + cleaned;
    }
    
    return cleaned + '@s.whatsapp.net';
}

// Verificar si el número existe en WhatsApp
async function checkNumberExists(phone) {
    if (!sock || connectionStatus !== 'connected') {
        throw new Error('WhatsApp no está conectado');
    }
    
    const formattedPhone = formatPhoneNumber(phone);
    const [result] = await sock.onWhatsApp(formattedPhone.replace('@s.whatsapp.net', ''));
    return result?.exists || false;
}

// Enviar mensaje de texto
async function sendTextMessage(phone, message) {
    if (!sock || connectionStatus !== 'connected') {
        throw new Error('WhatsApp no está conectado');
    }

    const jid = formatPhoneNumber(phone);
    
    try {
        await sock.sendMessage(jid, { text: message });
        console.log(`✅ Mensaje enviado a ${phone}`);
        return { success: true, phone, message: 'Mensaje enviado' };
    } catch (error) {
        console.log(`❌ Error enviando a ${phone}: ${error.message}`);
        return { success: false, phone, message: error.message };
    }
}

// Enviar imagen con caption
async function sendImageMessage(phone, imagePath, caption = '') {
    if (!sock || connectionStatus !== 'connected') {
        throw new Error('WhatsApp no está conectado');
    }

    const jid = formatPhoneNumber(phone);
    
    try {
        await sock.sendMessage(jid, {
            image: fs.readFileSync(imagePath),
            caption: caption
        });
        return { success: true, phone, message: 'Imagen enviada' };
    } catch (error) {
        return { success: false, phone, message: error.message };
    }
}

// Enviar documento
async function sendDocumentMessage(phone, documentPath, filename) {
    if (!sock || connectionStatus !== 'connected') {
        throw new Error('WhatsApp no está conectado');
    }

    const jid = formatPhoneNumber(phone);
    
    try {
        await sock.sendMessage(jid, {
            document: fs.readFileSync(documentPath),
            fileName: filename,
            mimetype: getMimeType(documentPath)
        });
        return { success: true, phone, message: 'Documento enviado' };
    } catch (error) {
        return { success: false, phone, message: error.message };
    }
}

// Obtener mime type
function getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
        '.pdf': 'application/pdf',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.xls': 'application/vnd.ms-excel',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.mp4': 'video/mp4',
        '.mp3': 'audio/mpeg'
    };
    return mimeTypes[ext] || 'application/octet-stream';
}

// Reemplazar variables en el mensaje
function replaceVariables(message, contact) {
    let result = message;
    result = result.replace(/{nombre}/gi, contact.name || '');
    result = result.replace(/{email}/gi, contact.email || '');
    result = result.replace(/{empresa}/gi, contact.company || '');
    result = result.replace(/{telefono}/gi, contact.phone || '');
    // Limpiar espacios dobles que puedan quedar si falta algún campo
    result = result.replace(/\s+/g, ' ').trim();
    return result;
}

// Enviar mensajes masivos
async function sendBulkMessages(contacts, messageTemplate, mediaPath = null, mediaType = null, onProgress = null) {
    if (!sock || connectionStatus !== 'connected') {
        throw new Error('WhatsApp no está conectado');
    }

    const results = {
        total: contacts.length,
        sent: 0,
        failed: 0,
        details: []
    };

    console.log(`📤 Iniciando envío masivo a ${contacts.length} contactos...`);

    for (let i = 0; i < contacts.length; i++) {
        const contact = contacts[i];
        const personalizedMessage = replaceVariables(messageTemplate, contact);
        
        try {
            let result;
            
            if (mediaPath && mediaType) {
                if (mediaType.startsWith('image')) {
                    result = await sendImageMessage(contact.phone, mediaPath, personalizedMessage);
                } else {
                    result = await sendDocumentMessage(contact.phone, mediaPath, path.basename(mediaPath));
                    // Enviar texto después del documento si hay mensaje
                    if (personalizedMessage) {
                        await sendTextMessage(contact.phone, personalizedMessage);
                    }
                }
            } else {
                result = await sendTextMessage(contact.phone, personalizedMessage);
            }

            if (result.success) {
                results.sent++;
                results.details.push({ ...result, contact });
            } else {
                results.failed++;
                results.details.push({ ...result, contact });
            }
        } catch (error) {
            results.failed++;
            results.details.push({
                success: false,
                phone: contact.phone,
                message: error.message,
                contact
            });
        }

        // Callback de progreso
        if (onProgress) {
            onProgress({
                current: i + 1,
                total: contacts.length,
                lastResult: results.details[results.details.length - 1]
            });
        }

        // Delay aleatorio entre mensajes (3-7 segundos) para evitar baneo
        if (i < contacts.length - 1) {
            const randomDelay = Math.floor(Math.random() * 4000) + 3000;
            await delay(randomDelay);
        }
    }

    console.log(`📊 Envío completado: ${results.sent} enviados, ${results.failed} fallidos`);
    return results;
}

module.exports = {
    connectToWhatsApp,
    getConnectionStatus,
    disconnect,
    sendTextMessage,
    sendImageMessage,
    sendDocumentMessage,
    sendBulkMessages,
    checkNumberExists,
    replaceVariables,
    setEventEmitter
};