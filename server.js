/**
 * ============================================
 * WhatsApp Sender - Main Server
 * Developed by: Carlos David Donoso Cordero (ddchack)
 * Website: carlos-donoso.com
 * Version: 1.0.0
 * ============================================
 * 
 * Sistema de mensajería masiva para WhatsApp
 * Desarrollado para uso interno - Importadora Tomebamba
 * 
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { parse } = require('csv-parse/sync');
const EventEmitter = require('events');

const db = require('./database');
const whatsapp = require('./whatsapp');

const app = express();
const PORT = 3000;

// Event emitter para comunicación en tiempo real
const eventEmitter = new EventEmitter();
whatsapp.setEventEmitter(eventEmitter);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Configurar almacenamiento de archivos
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage });

// Inicializar base de datos
db.initDatabase();

// ==================== RUTAS API ====================

// --- Estado de WhatsApp ---
app.get('/api/whatsapp/status', (req, res) => {
    res.json(whatsapp.getConnectionStatus());
});

app.post('/api/whatsapp/connect', async (req, res) => {
    try {
        await whatsapp.connectToWhatsApp();
        res.json({ success: true, message: 'Conectando...' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/whatsapp/disconnect', async (req, res) => {
    try {
        await whatsapp.disconnect();
        res.json({ success: true, message: 'Desconectado' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// --- Contactos ---
app.get('/api/contacts', (req, res) => {
    const listId = req.query.listId || null;
    const contacts = db.getContacts(listId);
    res.json(contacts);
});

app.post('/api/contacts', (req, res) => {
    const { phone, name, email, company, listId } = req.body;
    if (!phone) {
        return res.status(400).json({ success: false, message: 'Teléfono es requerido' });
    }
    const result = db.addContact(phone, name, email, company, listId || 1);
    res.json({ success: !!result, message: result ? 'Contacto agregado' : 'Error al agregar' });
});

app.post('/api/contacts/import', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No se subió ningún archivo' });
    }

    try {
        const fileContent = fs.readFileSync(req.file.path, 'utf-8');
        const records = parse(fileContent, {
            columns: true,
            skip_empty_lines: true,
            trim: true
        });

        // Mapear columnas (soporta variaciones de nombres)
        const contacts = records.map(record => ({
            phone: record.telefono || record.phone || record.celular || record.numero || '',
            name: record.nombre || record.name || '',
            email: record.email || record.correo || '',
            company: record.empresa || record.company || ''
        }));

        const listId = req.body.listId || 1;
        const imported = db.importContacts(contacts, listId);

        // Eliminar archivo temporal
        fs.unlinkSync(req.file.path);

        res.json({ 
            success: true, 
            message: `${imported} contactos importados correctamente`,
            imported 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.delete('/api/contacts/:id', (req, res) => {
    db.deleteContact(req.params.id);
    res.json({ success: true, message: 'Contacto eliminado' });
});

app.delete('/api/contacts', (req, res) => {
    const listId = req.query.listId || null;
    db.deleteAllContacts(listId);
    res.json({ success: true, message: 'Contactos eliminados' });
});

// --- Listas ---
app.get('/api/lists', (req, res) => {
    res.json(db.getLists());
});

app.post('/api/lists', (req, res) => {
    const { name, description } = req.body;
    if (!name) {
        return res.status(400).json({ success: false, message: 'Nombre es requerido' });
    }
    const result = db.createList(name, description);
    res.json({ success: !!result, id: result?.lastInsertRowid });
});

app.delete('/api/lists/:id', (req, res) => {
    const result = db.deleteList(parseInt(req.params.id));
    res.json({ success: !!result, message: result ? 'Lista eliminada' : 'No se puede eliminar la lista por defecto' });
});

// --- Plantillas ---
app.get('/api/templates', (req, res) => {
    res.json(db.getTemplates());
});

app.get('/api/templates/:id', (req, res) => {
    const template = db.getTemplateById(req.params.id);
    if (template) {
        res.json(template);
    } else {
        res.status(404).json({ success: false, message: 'Plantilla no encontrada' });
    }
});

app.post('/api/templates', upload.single('media'), (req, res) => {
    const { name, content } = req.body;
    if (!name || !content) {
        return res.status(400).json({ success: false, message: 'Nombre y contenido son requeridos' });
    }
    
    let mediaPath = null;
    let mediaType = null;
    
    if (req.file) {
        mediaPath = req.file.path;
        mediaType = req.file.mimetype;
    }
    
    const result = db.createTemplate(name, content, mediaPath, mediaType);
    res.json({ success: !!result, id: result?.lastInsertRowid });
});

app.put('/api/templates/:id', upload.single('media'), (req, res) => {
    const { name, content } = req.body;
    if (!name || !content) {
        return res.status(400).json({ success: false, message: 'Nombre y contenido son requeridos' });
    }
    
    let mediaPath = req.body.keepMedia === 'true' ? undefined : null;
    let mediaType = req.body.keepMedia === 'true' ? undefined : null;
    
    if (req.file) {
        mediaPath = req.file.path;
        mediaType = req.file.mimetype;
    }
    
    const existing = db.getTemplateById(req.params.id);
    const result = db.updateTemplate(
        req.params.id, 
        name, 
        content, 
        mediaPath !== undefined ? mediaPath : existing?.media_path,
        mediaType !== undefined ? mediaType : existing?.media_type
    );
    res.json({ success: !!result });
});

app.delete('/api/templates/:id', (req, res) => {
    const template = db.getTemplateById(req.params.id);
    if (template?.media_path && fs.existsSync(template.media_path)) {
        fs.unlinkSync(template.media_path);
    }
    db.deleteTemplate(req.params.id);
    res.json({ success: true, message: 'Plantilla eliminada' });
});

// --- Envío de mensajes ---
app.post('/api/send', upload.single('media'), async (req, res) => {
    const { message, listId, contactIds, templateId } = req.body;
    
    // Obtener mensaje de plantilla si se especificó
    let messageContent = message;
    let mediaPath = req.file?.path || null;
    let mediaType = req.file?.mimetype || null;
    
    if (templateId) {
        const template = db.getTemplateById(templateId);
        if (template) {
            messageContent = template.content;
            if (template.media_path && !mediaPath) {
                mediaPath = template.media_path;
                mediaType = template.media_type;
            }
        }
    }
    
    if (!messageContent) {
        return res.status(400).json({ success: false, message: 'Mensaje es requerido' });
    }

    // Obtener contactos
    let contacts = [];
    if (contactIds) {
        const ids = JSON.parse(contactIds);
        contacts = ids.map(id => db.getContactById(id)).filter(Boolean);
    } else if (listId) {
        contacts = db.getContacts(listId);
    } else {
        contacts = db.getContacts();
    }

    if (contacts.length === 0) {
        return res.status(400).json({ success: false, message: 'No hay contactos seleccionados' });
    }

    try {
        const results = await whatsapp.sendBulkMessages(
            contacts,
            messageContent,
            mediaPath,
            mediaType,
            (progress) => {
                // Guardar en historial
                const detail = progress.lastResult;
                db.addToHistory(
                    detail.contact?.id,
                    detail.phone,
                    messageContent,
                    detail.success ? 'sent' : 'failed',
                    detail.success ? null : detail.message
                );
            }
        );

        res.json({
            success: true,
            results
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Enviar mensaje individual
app.post('/api/send/single', async (req, res) => {
    const { phone, message } = req.body;
    
    if (!phone || !message) {
        return res.status(400).json({ success: false, message: 'Teléfono y mensaje son requeridos' });
    }

    try {
        const result = await whatsapp.sendTextMessage(phone, message);
        db.addToHistory(null, phone, message, result.success ? 'sent' : 'failed', result.success ? null : result.message);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// --- Historial ---
app.get('/api/history', (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    res.json(db.getHistory(limit));
});

app.get('/api/history/stats', (req, res) => {
    res.json(db.getHistoryStats());
});

app.delete('/api/history', (req, res) => {
    db.clearHistory();
    res.json({ success: true, message: 'Historial eliminado' });
});

// --- Server-Sent Events para actualizaciones en tiempo real ---
app.get('/api/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const onQR = (qr) => {
        res.write(`event: qr\ndata: ${JSON.stringify({ qr })}\n\n`);
    };

    const onStatus = (data) => {
        res.write(`event: status\ndata: ${JSON.stringify(data)}\n\n`);
    };

    eventEmitter.on('qr', onQR);
    eventEmitter.on('status', onStatus);

    req.on('close', () => {
        eventEmitter.off('qr', onQR);
        eventEmitter.off('status', onStatus);
    });
});

// ==================== INICIAR SERVIDOR ====================

app.listen(PORT, () => {
    console.log('');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                                                            ║');
    console.log('║   🚀 WhatsApp Sender - Sistema de Mensajería Masiva        ║');
    console.log('║                                                            ║');
    console.log('║   Desarrollado por: Carlos David Donoso Cordero (ddchack)  ║');
    console.log('║   Website: carlos-donoso.com                               ║');
    console.log('║                                                            ║');
    console.log(`║   ✅ Servidor corriendo en: http://localhost:${PORT}          ║`);
    console.log('║                                                            ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('');
});