// app.js
class TaskMasterPWA {
    constructor() {
        this.tasks = [];
        this.currentFilter = 'all';
        this.isOnline = navigator.onLine;
        this.deferredPrompt = null;

        this.initializeApp();
        this.setupEventListeners();
        this.registerServiceWorker();
        this.setupInstallPrompt();
    }

    async initializeApp() {
        await this.initializeDatabase();
        await this.loadTasks();
        this.updateConnectionStatus();
        this.renderTasks();
    }

    async initializeDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('TaskMasterDB', 1);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                if (!db.objectStoreNames.contains('tasks')) {
                    const store = db.createObjectStore('tasks', { keyPath: 'id' });
                    store.createIndex('completed', 'completed', { unique: false });
                    store.createIndex('priority', 'priority', { unique: false });
                    store.createIndex('createdAt', 'createdAt', { unique: false });
                }
            };
        });
    }

    setupEventListeners() {
        // Task input
        const taskInput = document.getElementById('task-input');
        const addBtn = document.getElementById('add-task-btn');
        const prioritySelect = document.getElementById('priority-select');

        addBtn.addEventListener('click', () => this.addTask());
        taskInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addTask();
        });

        // Filters
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.setFilter(e.target.dataset.filter);
            });
        });

        // Nuevo: botón de sincronización con animación
        const syncBtn = document.getElementById('sync-btn');
        syncBtn.addEventListener('click', async () => {
            syncBtn.classList.add('rotating');
            await this.syncTasks();
            syncBtn.classList.remove('rotating');
        });

        // Connection status
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.updateConnectionStatus();
            this.showNotification('Conexión restaurada', 'success');
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
            this.updateConnectionStatus();
            this.showNotification('Sin conexión - Trabajando offline', 'error');
        });

        // Install prompt
        const installBtn = document.getElementById('install-btn');
        const dismissBtn = document.getElementById('dismiss-btn');
        if (installBtn) {
            installBtn.addEventListener('click', () => {
                this.installApp();
            });
        }
        if (dismissBtn) {
            dismissBtn.addEventListener('click', () => {
                this.dismissInstallPrompt();
            });
        }
    }

    async registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('sw.js');
                console.log('Service Worker registrado:', registration);
            } catch (error) {
                console.error('Error al registrar Service Worker:', error);
            }
        }
    }

    setupInstallPrompt() {
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
            this.showInstallPrompt();
        });

        window.addEventListener('appinstalled', () => {
            this.hideInstallPrompt();
            this.showNotification('¡App instalada correctamente!', 'success');
        });
    }

    async addTask() {
        const input = document.getElementById('task-input');
        const dateInput = document.getElementById('task-date');
        const timeInput = document.getElementById('task-time');
        const prioritySelect = document.getElementById('priority-select');
        const text = input.value.trim();
        const date = dateInput.value;
        const time = timeInput.value;

        if (!text) {
            this.showNotification('Por favor ingresa una tarea', 'error');
            return;
        }

        const task = {
            id: Date.now().toString(),
            text: text,
            date: date,   // <-- guarda la fecha
            time: time,   // <-- guarda la hora
            priority: prioritySelect.value,
            completed: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        try {
            await this.saveTask(task);
            this.tasks.unshift(task);
            this.renderTasks();

            input.value = '';
            dateInput.value = '';
            timeInput.value = '';
            prioritySelect.value = 'medium';

            this.showNotification('Tarea agregada', 'success');
        } catch (error) {
            console.error('Error al agregar tarea:', error);
            this.showNotification('Error al agregar tarea', 'error');
        }
    }

    async saveTask(task) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['tasks'], 'readwrite');
            const store = transaction.objectStore('tasks');
            const request = store.put(task);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async loadTasks() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['tasks'], 'readonly');
            const store = transaction.objectStore('tasks');
            const request = store.getAll();

            request.onsuccess = () => {
                this.tasks = request.result.sort((a, b) =>
                    new Date(b.createdAt) - new Date(a.createdAt)
                );
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    }

    async deleteTask(taskId) {
        try {
            await this.removeTaskFromDB(taskId);
            this.tasks = this.tasks.filter(task => task.id !== taskId);
            this.renderTasks();
            this.showNotification('Tarea eliminada', 'success');
        } catch (error) {
            console.error('Error al eliminar tarea:', error);
            this.showNotification('Error al eliminar tarea', 'error');
        }
    }

    async removeTaskFromDB(taskId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['tasks'], 'readwrite');
            const store = transaction.objectStore('tasks');
            const request = store.delete(taskId);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async toggleTask(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;

        task.completed = !task.completed;
        task.updatedAt = new Date().toISOString();

        try {
            await this.saveTask(task);
            this.renderTasks();

            const status = task.completed ? 'completada' : 'marcada como pendiente';
            this.showNotification(`Tarea ${status}`, 'success');
        } catch (error) {
            console.error('Error al actualizar tarea:', error);
            this.showNotification('Error al actualizar tarea', 'error');
        }
    }

    setFilter(filter) {
        this.currentFilter = filter;

        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        document.querySelector(`[data-filter="${filter}"]`).classList.add('active');
        this.renderTasks();
    }

    getFilteredTasks() {
        switch (this.currentFilter) {
            case 'completed':
                return this.tasks.filter(task => task.completed);
            case 'pending':
                return this.tasks.filter(task => !task.completed);
            default:
                return this.tasks;
        }
    }

    renderTasks() {
        const container = document.getElementById('tasks-container');
        const emptyState = document.getElementById('empty-state');
        const filteredTasks = this.getFilteredTasks();

        if (filteredTasks.length === 0) {
            container.innerHTML = '';
            emptyState.classList.remove('hidden');
            return;
        }

        emptyState.classList.add('hidden');

    container.innerHTML = filteredTasks.map(task => `
        <div class="task-card ${task.completed ? 'completed' : ''} ${task.priority}-priority">
            <div class="task-header">
                <div class="task-text ${task.completed ? 'completed' : ''}">${task.text}</div>
                <div class="priority-badge priority-${task.priority}">${this.getPriorityText(task.priority)}</div>
            </div>
            ${task.date || task.time ? `
                <div class="task-datetime">
                    ${task.date ? `<span class="task-date">${task.date}</span>` : ''}
                    ${task.time ? `<span class="task-time">${task.time}</span>` : ''}
                </div>
            ` : ''}
            <div class="task-actions">
                <button class="task-btn complete-btn" onclick="app.toggleTask('${task.id}')">
                    ${task.completed ? 'Desmarcar' : 'Completar'}
                </button>
                <button class="task-btn delete-btn" onclick="app.deleteTask('${task.id}')">
                    Eliminar
                </button>
            </div>
        </div>
    `).join('');
    }

    getPriorityText(priority) {
        const priorities = {
            high: 'Alta',
            medium: 'Media',
            low: 'Baja'
        };
        return priorities[priority] || 'Media';
    }

    updateConnectionStatus() {
        const statusIndicator = document.querySelector('.status-indicator');
        const statusText = document.querySelector('.status-text');

        if (this.isOnline) {
            statusIndicator.classList.remove('offline');
            statusText.textContent = 'Online';
        } else {
            statusIndicator.classList.add('offline');
            statusText.textContent = 'Offline';
        }
    }

    async syncTasks() {
        // Aquí va tu lógica real de sincronización
        // Simulación de sincronización
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (this.isOnline) {
            this.showNotification('Tareas sincronizadas', 'success');
        } else {
            this.showNotification('Sin conexión para sincronizar', 'error');
        }
    }

    showInstallPrompt() {
        document.getElementById('install-prompt').classList.remove('hidden');
    }

    hideInstallPrompt() {
        document.getElementById('install-prompt').classList.add('hidden');
    }

    async installApp() {
        if (!this.deferredPrompt) return;

        this.deferredPrompt.prompt();
        const { outcome } = await this.deferredPrompt.userChoice;

        if (outcome === 'accepted') {
            console.log('Usuario aceptó la instalación');
        }

        this.deferredPrompt = null;
        this.hideInstallPrompt();
    }

    dismissInstallPrompt() {
        this.hideInstallPrompt();
        this.deferredPrompt = null;
    }

    showNotification(message, type = 'success') {
        const notification = document.getElementById('notification');
        const notificationText = document.getElementById('notification-text');

        notification.className = `notification ${type}`;
        notificationText.textContent = message;
        notification.classList.remove('hidden');

        setTimeout(() => {
            notification.classList.add('hidden');
        }, 3000);
    }
}

// Inicializar la aplicación
const app = new TaskMasterPWA();