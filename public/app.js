/**
 * ============================================
 * WhatsApp Sender - Frontend Application
 * Developed by: Carlos David Donoso Cordero (ddchack)
 * Website: carlos-donoso.com
 * Version: 1.0.0
 * ============================================
 * 
 * Sistema de mensajería masiva para WhatsApp
 * Desarrollado para uso interno - Importadora Tomebamba
 * 
 */

// ==================== ESTADO GLOBAL ====================
const state = {
    contacts: [],
    lists: [],
    templates: [],
    history: [],
    selectedContacts: [],
    whatsappStatus: 'disconnected',
    currentSection: 'dashboard'
};

// ==================== INICIALIZACIÓN ====================
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initEventSource();
    loadInitialData();
    initEventListeners();
});

// Cargar datos iniciales
async function loadInitialData() {
    await Promise.all([
        loadLists(),
        loadContacts(),
        loadTemplates(),
        loadHistory(),
        loadStats(),
        checkWhatsAppStatus()
    ]);
}

// ==================== NAVEGACIÓN ====================
function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const section = item.dataset.section;
            navigateTo(section);
        });
    });
}

function navigateTo(sectionName) {
    // Actualizar navegación
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.section === sectionName);
    });

    // Mostrar sección
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    
    const targetSection = document.getElementById('section' + capitalize(sectionName));
    if (targetSection) {
        targetSection.classList.add('active');
    }

    state.currentSection = sectionName;

    // Recargar datos según la sección
    switch(sectionName) {
        case 'contacts':
            loadContacts();
            break;
        case 'templates':
            loadTemplates();
            break;
        case 'history':
            loadHistory();
            break;
        case 'send':
            updateSendSection();
            break;
        case 'dashboard':
            loadStats();
            break;
    }
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// ==================== SERVER-SENT EVENTS ====================
function initEventSource() {
    const eventSource = new EventSource('/api/events');

    eventSource.addEventListener('qr', (e) => {
        const data = JSON.parse(e.data);
        showQRCode(data.qr);
    });

    eventSource.addEventListener('status', (e) => {
        const data = JSON.parse(e.data);
        updateConnectionStatus(data.status);
    });

    eventSource.onerror = () => {
        console.log('SSE connection lost, reconnecting...');
        setTimeout(initEventSource, 5000);
    };
}

// ==================== WHATSAPP CONNECTION ====================
async function checkWhatsAppStatus() {
    try {
        const response = await fetch('/api/whatsapp/status');
        const data = await response.json();
        updateConnectionStatus(data.status);
        if (data.qr) {
            showQRCode(data.qr);
        }
    } catch (error) {
        console.error('Error checking WhatsApp status:', error);
    }
}

function updateConnectionStatus(status) {
    state.whatsappStatus = status;
    const indicator = document.getElementById('statusIndicator');
    const btn = document.getElementById('btnConnect');
    const qrContainer = document.getElementById('qrContainer');

    indicator.className = 'status-indicator ' + status;
    
    const statusTexts = {
        'connected': 'Conectado',
        'disconnected': 'Desconectado',
        'qr': 'Esperando QR...'
    };
    
    indicator.querySelector('.status-text').textContent = statusTexts[status] || status;

    if (status === 'connected') {
        btn.textContent = 'Desconectar';
        btn.className = 'btn btn-danger';
        btn.onclick = disconnectWhatsApp;
        qrContainer.style.display = 'none';
    } else {
        btn.textContent = 'Conectar';
        btn.className = 'btn btn-connect';
        btn.onclick = connectWhatsApp;
    }
}

async function connectWhatsApp() {
    try {
        const btn = document.getElementById('btnConnect');
        btn.disabled = true;
        btn.textContent = 'Conectando...';
        
        const response = await fetch('/api/whatsapp/connect', { method: 'POST' });
        const data = await response.json();
        
        if (!data.success) {
            showToast(data.message, 'error');
        }
    } catch (error) {
        showToast('Error al conectar: ' + error.message, 'error');
    } finally {
        document.getElementById('btnConnect').disabled = false;
    }
}

async function disconnectWhatsApp() {
    if (!confirm('¿Seguro que deseas desconectar WhatsApp?')) return;
    
    try {
        await fetch('/api/whatsapp/disconnect', { method: 'POST' });
        updateConnectionStatus('disconnected');
        showToast('WhatsApp desconectado', 'info');
    } catch (error) {
        showToast('Error al desconectar: ' + error.message, 'error');
    }
}

function showQRCode(qrData) {
    const qrContainer = document.getElementById('qrContainer');
    const qrImage = document.getElementById('qrCode');
    qrImage.src = qrData;
    qrContainer.style.display = 'block';
}

// ==================== CONTACTOS ====================
async function loadContacts(listId = null) {
    try {
        let url = '/api/contacts';
        if (listId) url += `?listId=${listId}`;
        
        const response = await fetch(url);
        state.contacts = await response.json();
        renderContacts();
    } catch (error) {
        showToast('Error al cargar contactos: ' + error.message, 'error');
    }
}

function renderContacts() {
    const tbody = document.getElementById('contactsTable');
    
    if (state.contacts.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-state">
                    No hay contactos. <a href="#" onclick="showImportModal()">Importa un CSV</a> o 
                    <a href="#" onclick="showAddContactModal()">agrega uno manualmente</a>.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = state.contacts.map(contact => {
        const list = state.lists.find(l => l.id === contact.list_id);
        return `
            <tr data-id="${contact.id}">
                <td><input type="checkbox" class="contact-checkbox" value="${contact.id}"></td>
                <td>${formatPhone(contact.phone)}</td>
                <td>${contact.name || '-'}</td>
                <td>${contact.email || '-'}</td>
                <td>${contact.company || '-'}</td>
                <td><span class="badge">${list?.name || 'General'}</span></td>
                <td>
                    <button class="btn-icon" onclick="deleteContact(${contact.id})" title="Eliminar">🗑️</button>
                </td>
            </tr>
        `;
    }).join('');

    // Actualizar contador
    document.getElementById('statContacts').textContent = state.contacts.length;
}

function formatPhone(phone) {
    if (!phone) return '-';
    const cleaned = phone.toString();
    if (cleaned.startsWith('593') && cleaned.length === 12) {
        return `+${cleaned.slice(0,3)} ${cleaned.slice(3,5)} ${cleaned.slice(5,8)} ${cleaned.slice(8)}`;
    }
    return phone;
}

function showAddContactModal() {
    document.getElementById('contactPhone').value = '';
    document.getElementById('contactName').value = '';
    document.getElementById('contactEmail').value = '';
    document.getElementById('contactCompany').value = '';
    updateListSelect('contactList');
    openModal('addContactModal');
}

async function addContact() {
    const phone = document.getElementById('contactPhone').value.trim();
    const name = document.getElementById('contactName').value.trim();
    const email = document.getElementById('contactEmail').value.trim();
    const company = document.getElementById('contactCompany').value.trim();
    const listId = document.getElementById('contactList').value;

    if (!phone) {
        showToast('El teléfono es obligatorio', 'error');
        return;
    }

    try {
        const response = await fetch('/api/contacts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, name, email, company, listId })
        });

        const data = await response.json();
        
        if (data.success) {
            showToast('Contacto agregado correctamente', 'success');
            closeModal('addContactModal');
            loadContacts();
        } else {
            showToast(data.message, 'error');
        }
    } catch (error) {
        showToast('Error al agregar contacto: ' + error.message, 'error');
    }
}

async function deleteContact(id) {
    if (!confirm('¿Seguro que deseas eliminar este contacto?')) return;

    try {
        await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
        showToast('Contacto eliminado', 'success');
        loadContacts();
    } catch (error) {
        showToast('Error al eliminar contacto: ' + error.message, 'error');
    }
}

function showImportModal() {
    document.getElementById('importFile').value = '';
    updateListSelect('importList');
    openModal('importModal');
}

async function importContacts() {
    const fileInput = document.getElementById('importFile');
    const listId = document.getElementById('importList').value;

    if (!fileInput.files[0]) {
        showToast('Selecciona un archivo CSV', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    formData.append('listId', listId);

    try {
        const response = await fetch('/api/contacts/import', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            showToast(data.message, 'success');
            closeModal('importModal');
            loadContacts();
        } else {
            showToast(data.message, 'error');
        }
    } catch (error) {
        showToast('Error al importar: ' + error.message, 'error');
    }
}

// ==================== LISTAS ====================
async function loadLists() {
    try {
        const response = await fetch('/api/lists');
        state.lists = await response.json();
        renderLists();
        updateAllListSelects();
    } catch (error) {
        showToast('Error al cargar listas: ' + error.message, 'error');
    }
}

function renderLists() {
    const grid = document.getElementById('listsGrid');
    
    grid.innerHTML = state.lists.map(list => `
        <div class="list-card">
            <div class="list-info">
                <span class="list-name">${list.name}</span>
                <span class="list-count">${list.contact_count || 0} contactos</span>
            </div>
            ${list.id !== 1 ? `
                <button class="btn-icon" onclick="deleteList(${list.id})" title="Eliminar">🗑️</button>
            ` : ''}
        </div>
    `).join('');
}

async function createList() {
    const nameInput = document.getElementById('newListName');
    const name = nameInput.value.trim();

    if (!name) {
        showToast('Ingresa un nombre para la lista', 'error');
        return;
    }

    try {
        const response = await fetch('/api/lists', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });

        const data = await response.json();

        if (data.success) {
            showToast('Lista creada correctamente', 'success');
            nameInput.value = '';
            loadLists();
        } else {
            showToast(data.message, 'error');
        }
    } catch (error) {
        showToast('Error al crear lista: ' + error.message, 'error');
    }
}

async function deleteList(id) {
    if (!confirm('¿Seguro que deseas eliminar esta lista? Los contactos se moverán a "General"')) return;

    try {
        await fetch(`/api/lists/${id}`, { method: 'DELETE' });
        showToast('Lista eliminada', 'success');
        loadLists();
        loadContacts();
    } catch (error) {
        showToast('Error al eliminar lista: ' + error.message, 'error');
    }
}

function updateAllListSelects() {
    updateListSelect('filterList', true);
    updateListSelect('contactList');
    updateListSelect('importList');
    updateListSelect('sendList', true);
}

function updateListSelect(selectId, includeAll = false) {
    const select = document.getElementById(selectId);
    if (!select) return;

    let options = includeAll ? '<option value="">Todas las listas</option>' : '';
    
    options += state.lists.map(list => 
        `<option value="${list.id}">${list.name} (${list.contact_count || 0})</option>`
    ).join('');

    select.innerHTML = options;
}

// ==================== PLANTILLAS ====================
async function loadTemplates() {
    try {
        const response = await fetch('/api/templates');
        state.templates = await response.json();
        renderTemplates();
        updateTemplateSelects();
    } catch (error) {
        showToast('Error al cargar plantillas: ' + error.message, 'error');
    }
}

function renderTemplates() {
    const grid = document.getElementById('templatesGrid');
    
    if (state.templates.length === 0) {
        grid.innerHTML = `
            <div class="empty-state card">
                <p>No hay plantillas creadas. <a href="#" onclick="showTemplateModal()">Crea una nueva</a></p>
            </div>
        `;
        return;
    }

    grid.innerHTML = state.templates.map(template => `
        <div class="template-card card">
            <div class="template-header">
                <h3>${template.name}</h3>
                <div class="template-actions">
                    <button class="btn-icon" onclick="editTemplate(${template.id})" title="Editar">✏️</button>
                    <button class="btn-icon" onclick="deleteTemplate(${template.id})" title="Eliminar">🗑️</button>
                </div>
            </div>
            <div class="template-content">
                <p>${escapeHtml(template.content)}</p>
                ${template.media_path ? '<span class="badge">📎 Archivo adjunto</span>' : ''}
            </div>
            <div class="template-footer">
                <button class="btn btn-sm btn-primary" onclick="useTemplate(${template.id})">
                    Usar plantilla
                </button>
            </div>
        </div>
    `).join('');

    // Actualizar contador
    document.getElementById('statTemplates').textContent = state.templates.length;
}

function showTemplateModal(editId = null) {
    document.getElementById('templateId').value = editId || '';
    document.getElementById('templateName').value = '';
    document.getElementById('templateContent').value = '';
    document.getElementById('templateMedia').value = '';
    document.getElementById('templateModalTitle').textContent = editId ? 'Editar Plantilla' : 'Nueva Plantilla';
    
    openModal('templateModal');
}

async function editTemplate(id) {
    try {
        const response = await fetch(`/api/templates/${id}`);
        const template = await response.json();
        
        document.getElementById('templateId').value = template.id;
        document.getElementById('templateName').value = template.name;
        document.getElementById('templateContent').value = template.content;
        document.getElementById('templateModalTitle').textContent = 'Editar Plantilla';
        
        openModal('templateModal');
    } catch (error) {
        showToast('Error al cargar plantilla: ' + error.message, 'error');
    }
}

async function saveTemplate() {
    const id = document.getElementById('templateId').value;
    const name = document.getElementById('templateName').value.trim();
    const content = document.getElementById('templateContent').value.trim();
    const mediaInput = document.getElementById('templateMedia');

    if (!name || !content) {
        showToast('Nombre y contenido son obligatorios', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('name', name);
    formData.append('content', content);
    
    if (mediaInput.files[0]) {
        formData.append('media', mediaInput.files[0]);
    } else if (id) {
        formData.append('keepMedia', 'true');
    }

    try {
        const url = id ? `/api/templates/${id}` : '/api/templates';
        const method = id ? 'PUT' : 'POST';

        const response = await fetch(url, { method, body: formData });
        const data = await response.json();

        if (data.success !== false) {
            showToast(id ? 'Plantilla actualizada' : 'Plantilla creada', 'success');
            closeModal('templateModal');
            loadTemplates();
        } else {
            showToast(data.message, 'error');
        }
    } catch (error) {
        showToast('Error al guardar plantilla: ' + error.message, 'error');
    }
}

async function deleteTemplate(id) {
    if (!confirm('¿Seguro que deseas eliminar esta plantilla?')) return;

    try {
        await fetch(`/api/templates/${id}`, { method: 'DELETE' });
        showToast('Plantilla eliminada', 'success');
        loadTemplates();
    } catch (error) {
        showToast('Error al eliminar plantilla: ' + error.message, 'error');
    }
}

function useTemplate(id) {
    const template = state.templates.find(t => t.id === id);
    if (template) {
        navigateTo('send');
        setTimeout(() => {
            document.getElementById('sendTemplate').value = id;
            document.getElementById('sendMessage').value = template.content;
            updateMessagePreview();
        }, 100);
    }
}

function updateTemplateSelects() {
    const select = document.getElementById('sendTemplate');
    if (!select) return;

    let options = '<option value="">-- Sin plantilla --</option>';
    options += state.templates.map(t => 
        `<option value="${t.id}">${t.name}</option>`
    ).join('');

    select.innerHTML = options;
}

// ==================== ENVÍO DE MENSAJES ====================
function initEventListeners() {
    // Filtro de listas en contactos
    document.getElementById('filterList')?.addEventListener('change', (e) => {
        loadContacts(e.target.value || null);
    });

    // Selección de plantilla
    document.getElementById('sendTemplate')?.addEventListener('change', (e) => {
        const template = state.templates.find(t => t.id == e.target.value);
        if (template) {
            document.getElementById('sendMessage').value = template.content;
        }
        updateMessagePreview();
    });

    // Preview en tiempo real
    document.getElementById('sendMessage')?.addEventListener('input', updateMessagePreview);

    // Selección de lista para envío
    document.getElementById('sendList')?.addEventListener('change', updateSelectedCount);

    // Select all contacts
    document.getElementById('selectAllContacts')?.addEventListener('change', (e) => {
        document.querySelectorAll('.contact-checkbox').forEach(cb => {
            cb.checked = e.target.checked;
        });
        updateSelectedContacts();
    });

    // Individual contact selection
    document.addEventListener('change', (e) => {
        if (e.target.classList.contains('contact-checkbox')) {
            updateSelectedContacts();
        }
    });
}

function updateSendSection() {
    updateListSelect('sendList', true);
    updateTemplateSelects();
    updateSelectedCount();
}

function updateSelectedCount() {
    const listId = document.getElementById('sendList')?.value;
    let count = 0;
    
    if (listId) {
        count = state.contacts.filter(c => c.list_id == listId).length;
    } else {
        count = state.contacts.length;
    }

    document.getElementById('selectedCount').textContent = `${count} contactos seleccionados`;
}

function updateSelectedContacts() {
    state.selectedContacts = Array.from(document.querySelectorAll('.contact-checkbox:checked'))
        .map(cb => parseInt(cb.value));
}

function updateMessagePreview() {
    const message = document.getElementById('sendMessage')?.value || '';
    const preview = document.getElementById('messagePreview');
    
    if (!message.trim()) {
        preview.innerHTML = '<p>Escribe un mensaje para ver la vista previa...</p>';
        return;
    }

    // Ejemplo de reemplazo con datos ficticios
    const exampleContact = {
        nombre: 'Juan Pérez',
        email: 'juan@email.com',
        empresa: 'Empresa S.A.',
        telefono: '0999123456'
    };

    let previewText = message;
    previewText = previewText.replace(/{nombre}/gi, `<strong>${exampleContact.nombre}</strong>`);
    previewText = previewText.replace(/{email}/gi, `<strong>${exampleContact.email}</strong>`);
    previewText = previewText.replace(/{empresa}/gi, `<strong>${exampleContact.empresa}</strong>`);
    previewText = previewText.replace(/{telefono}/gi, `<strong>${exampleContact.telefono}</strong>`);

    preview.innerHTML = `<p>${previewText.replace(/\n/g, '<br>')}</p>`;
}

async function sendMessages() {
    const message = document.getElementById('sendMessage')?.value.trim();
    const listId = document.getElementById('sendList')?.value;
    const templateId = document.getElementById('sendTemplate')?.value;
    const mediaInput = document.getElementById('sendMedia');

    if (!message) {
        showToast('Escribe un mensaje para enviar', 'error');
        return;
    }

    if (state.whatsappStatus !== 'connected') {
        showToast('WhatsApp no está conectado', 'error');
        return;
    }

    // Confirmar envío
    const count = listId 
        ? state.contacts.filter(c => c.list_id == listId).length 
        : state.contacts.length;

    if (!confirm(`¿Enviar mensaje a ${count} contactos?`)) return;

    // Mostrar progreso
    const progressContainer = document.getElementById('sendProgress');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    const sendResults = document.getElementById('sendResults');
    const btnSend = document.getElementById('btnSend');

    progressContainer.style.display = 'block';
    btnSend.disabled = true;
    progressFill.style.width = '0%';
    sendResults.innerHTML = '';

    // Preparar form data
    const formData = new FormData();
    formData.append('message', message);
    if (listId) formData.append('listId', listId);
    if (templateId) formData.append('templateId', templateId);
    if (mediaInput?.files[0]) formData.append('media', mediaInput.files[0]);

    try {
        const response = await fetch('/api/send', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            progressFill.style.width = '100%';
            progressText.textContent = `${data.results.sent} / ${data.results.total} enviados`;

            // Mostrar resultados
            sendResults.innerHTML = `
                <div class="result-summary">
                    <span class="success">✅ Enviados: ${data.results.sent}</span>
                    <span class="failed">❌ Fallidos: ${data.results.failed}</span>
                </div>
            `;

            showToast(`Envío completado: ${data.results.sent} de ${data.results.total}`, 'success');
            loadHistory();
            loadStats();
        } else {
            showToast(data.message, 'error');
        }
    } catch (error) {
        showToast('Error en el envío: ' + error.message, 'error');
    } finally {
        btnSend.disabled = false;
    }
}

// ==================== HISTORIAL ====================
async function loadHistory() {
    try {
        const response = await fetch('/api/history');
        state.history = await response.json();
        renderHistory();
    } catch (error) {
        showToast('Error al cargar historial: ' + error.message, 'error');
    }
}

function renderHistory() {
    const tbody = document.getElementById('historyTable');
    
    if (state.history.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="empty-state">No hay envíos registrados.</td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = state.history.map(item => {
        const statusClass = item.status === 'sent' ? 'success' : item.status === 'failed' ? 'danger' : 'warning';
        const statusText = item.status === 'sent' ? '✅ Enviado' : item.status === 'failed' ? '❌ Fallido' : '⏳ Pendiente';
        
        return `
            <tr>
                <td>${formatDate(item.sent_at)}</td>
                <td>${formatPhone(item.phone)}</td>
                <td>${item.contact_name || '-'}</td>
                <td class="message-cell" title="${escapeHtml(item.message || '')}">${truncate(item.message, 50)}</td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            </tr>
        `;
    }).join('');
}

async function clearHistory() {
    if (!confirm('¿Seguro que deseas eliminar todo el historial?')) return;

    try {
        await fetch('/api/history', { method: 'DELETE' });
        showToast('Historial eliminado', 'success');
        loadHistory();
        loadStats();
    } catch (error) {
        showToast('Error al eliminar historial: ' + error.message, 'error');
    }
}

// ==================== ESTADÍSTICAS ====================
async function loadStats() {
    try {
        const response = await fetch('/api/history/stats');
        const stats = await response.json();
        
        document.getElementById('statSent').textContent = stats.sent || 0;
        document.getElementById('statFailed').textContent = stats.failed || 0;
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// ==================== UTILIDADES ====================

// Modal
function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// Toast notifications
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    const toastMessage = toast.querySelector('.toast-message');
    
    toast.className = `toast ${type}`;
    toastMessage.textContent = message;
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Helpers
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function truncate(text, maxLength) {
    if (!text) return '-';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('es-EC', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Cerrar modales con ESC
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal.active').forEach(modal => {
            modal.classList.remove('active');
        });
    }
});

// Cerrar modales al hacer click fuera
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        e.target.classList.remove('active');
    }
});

// ==================== FIN DEL ARCHIVO ====================
// Desarrollado por: Carlos David Donoso Cordero (ddchack)
// Website: carlos-donoso.com