/**
 * ============================================
 * WhatsApp Sender - Database Module
 * Developed by: Carlos David Donoso Cordero (ddchack)
 * Website: carlos-donoso.com
 * ============================================
 */

const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'whatsapp_sender.db'));

// Inicializar tablas
function initDatabase() {
    // Tabla de contactos
    db.exec(`
        CREATE TABLE IF NOT EXISTS contacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            phone TEXT NOT NULL UNIQUE,
            name TEXT,
            email TEXT,
            company TEXT,
            list_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (list_id) REFERENCES lists(id)
        )
    `);

    // Tabla de listas/grupos
    db.exec(`
        CREATE TABLE IF NOT EXISTS lists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Tabla de plantillas
    db.exec(`
        CREATE TABLE IF NOT EXISTS templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            content TEXT NOT NULL,
            media_path TEXT,
            media_type TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Tabla de historial de envíos
    db.exec(`
        CREATE TABLE IF NOT EXISTS send_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            contact_id INTEGER,
            phone TEXT NOT NULL,
            message TEXT,
            status TEXT DEFAULT 'pending',
            error_message TEXT,
            sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (contact_id) REFERENCES contacts(id)
        )
    `);

    // Crear lista por defecto si no existe
    const defaultList = db.prepare('SELECT id FROM lists WHERE name = ?').get('General');
    if (!defaultList) {
        db.prepare('INSERT INTO lists (name, description) VALUES (?, ?)').run('General', 'Lista por defecto');
    }

    console.log('✅ Base de datos inicializada correctamente');
}

// ==================== CONTACTOS ====================

function addContact(phone, name = null, email = null, company = null, listId = 1) {
    const cleanPhone = phone.replace(/\D/g, '');
    try {
        const stmt = db.prepare(`
            INSERT OR REPLACE INTO contacts (phone, name, email, company, list_id)
            VALUES (?, ?, ?, ?, ?)
        `);
        return stmt.run(cleanPhone, name, email, company, listId);
    } catch (error) {
        console.error('Error al agregar contacto:', error);
        return null;
    }
}

function importContacts(contacts, listId = 1) {
    const stmt = db.prepare(`
        INSERT OR REPLACE INTO contacts (phone, name, email, company, list_id)
        VALUES (?, ?, ?, ?, ?)
    `);
    
    const insertMany = db.transaction((contactsList) => {
        let imported = 0;
        for (const contact of contactsList) {
            const cleanPhone = contact.phone?.toString().replace(/\D/g, '');
            if (cleanPhone && cleanPhone.length >= 10) {
                stmt.run(cleanPhone, contact.name || null, contact.email || null, contact.company || null, listId);
                imported++;
            }
        }
        return imported;
    });
    
    return insertMany(contacts);
}

function getContacts(listId = null) {
    if (listId) {
        return db.prepare('SELECT * FROM contacts WHERE list_id = ? ORDER BY name').all(listId);
    }
    return db.prepare('SELECT * FROM contacts ORDER BY name').all();
}

function getContactById(id) {
    return db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);
}

function deleteContact(id) {
    return db.prepare('DELETE FROM contacts WHERE id = ?').run(id);
}

function deleteAllContacts(listId = null) {
    if (listId) {
        return db.prepare('DELETE FROM contacts WHERE list_id = ?').run(listId);
    }
    return db.prepare('DELETE FROM contacts').run();
}

// ==================== LISTAS ====================

function createList(name, description = '') {
    const stmt = db.prepare('INSERT INTO lists (name, description) VALUES (?, ?)');
    return stmt.run(name, description);
}

function getLists() {
    return db.prepare(`
        SELECT l.*, COUNT(c.id) as contact_count 
        FROM lists l 
        LEFT JOIN contacts c ON l.id = c.list_id 
        GROUP BY l.id 
        ORDER BY l.name
    `).all();
}

function deleteList(id) {
    if (id === 1) return false; // No eliminar lista por defecto
    db.prepare('UPDATE contacts SET list_id = 1 WHERE list_id = ?').run(id);
    return db.prepare('DELETE FROM lists WHERE id = ?').run(id);
}

// ==================== PLANTILLAS ====================

function createTemplate(name, content, mediaPath = null, mediaType = null) {
    const stmt = db.prepare('INSERT INTO templates (name, content, media_path, media_type) VALUES (?, ?, ?, ?)');
    return stmt.run(name, content, mediaPath, mediaType);
}

function getTemplates() {
    return db.prepare('SELECT * FROM templates ORDER BY created_at DESC').all();
}

function getTemplateById(id) {
    return db.prepare('SELECT * FROM templates WHERE id = ?').get(id);
}

function updateTemplate(id, name, content, mediaPath = null, mediaType = null) {
    const stmt = db.prepare('UPDATE templates SET name = ?, content = ?, media_path = ?, media_type = ? WHERE id = ?');
    return stmt.run(name, content, mediaPath, mediaType, id);
}

function deleteTemplate(id) {
    return db.prepare('DELETE FROM templates WHERE id = ?').run(id);
}

// ==================== HISTORIAL ====================

function addToHistory(contactId, phone, message, status = 'pending', errorMessage = null) {
    const stmt = db.prepare(`
        INSERT INTO send_history (contact_id, phone, message, status, error_message)
        VALUES (?, ?, ?, ?, ?)
    `);
    return stmt.run(contactId, phone, message, status, errorMessage);
}

function updateHistoryStatus(id, status, errorMessage = null) {
    const stmt = db.prepare('UPDATE send_history SET status = ?, error_message = ? WHERE id = ?');
    return stmt.run(status, errorMessage, id);
}

function getHistory(limit = 100) {
    return db.prepare(`
        SELECT h.*, c.name as contact_name 
        FROM send_history h 
        LEFT JOIN contacts c ON h.contact_id = c.id 
        ORDER BY h.sent_at DESC 
        LIMIT ?
    `).all(limit);
}

function getHistoryStats() {
    return db.prepare(`
        SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
        FROM send_history
        WHERE DATE(sent_at) = DATE('now')
    `).get();
}

function clearHistory() {
    return db.prepare('DELETE FROM send_history').run();
}

module.exports = {
    initDatabase,
    // Contactos
    addContact,
    importContacts,
    getContacts,
    getContactById,
    deleteContact,
    deleteAllContacts,
    // Listas
    createList,
    getLists,
    deleteList,
    // Plantillas
    createTemplate,
    getTemplates,
    getTemplateById,
    updateTemplate,
    deleteTemplate,
    // Historial
    addToHistory,
    updateHistoryStatus,
    getHistory,
    getHistoryStats,
    clearHistory
};