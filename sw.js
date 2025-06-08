// sw.js - Service Worker
const CACHE_NAME = 'taskmaster-v2';
const urlsToCache = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.json',
  '/icons/icon-72x72.png',
  '/icons/icon-96x96.png',
  '/icons/icon-128x128.png',
  '/icons/icon-144x144.png',
  '/icons/icon-152x152.png',
  '/icons/icon-192x192.png',
  '/icons/icon-384x384.png',
  '/icons/icon-512x512.png',
  '/icons/check-192x192.png',
  '/icons/list-192x192.png',
  '/icons/trash-192x192.png',
  '/icons/edit-192x192.png',
  '/icons/add-192x192.png',
];

// Instalación del Service Worker
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Cache abierto');
                return cache.addAll(urlsToCache);
            })
    );
});

// Activación del Service Worker
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Eliminando cache antiguo:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// Interceptar peticiones de red
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Devolver desde cache si existe
                if (response) {
                    return response;
                }

                // Clonar la petición
                const fetchRequest = event.request.clone();

                return fetch(fetchRequest).then((response) => {
                    // Verificar si es una respuesta válida
                    if (!response || response.status !== 200 || response.type !== 'basic') {
                        return response;
                    }

                    // Clonar la respuesta
                    const responseToCache = response.clone();

                    caches.open(CACHE_NAME)
                        .then((cache) => {
                            cache.put(event.request, responseToCache);
                        });

                    return response;
                }).catch(() => {
                    // Si falla la red, devolver página offline personalizada
                    if (event.request.destination === 'document') {
                        return caches.match('/index.html');
                    }
                });
            })
    );
});

// Sincronización en segundo plano
self.addEventListener('sync', (event) => {
    if (event.tag === 'background-sync') {
        event.waitUntil(doBackgroundSync());
    }
});

async function doBackgroundSync() {
    console.log('Ejecutando sincronización en segundo plano');
    // Aquí puedes implementar lógica de sincronización
}

// Notificaciones push
self.addEventListener('push', (event) => {
    const options = {
        body: event.data ? event.data.text() : 'Nueva notificación',
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-72x72.png',
        vibrate: [100, 50, 100],
        data: {
            dateOfArrival: Date.now(),
            primaryKey: 1
        },
        actions: [
            {
                action: 'explore',
                title: 'Ver tareas',
                icon: '/icons/icon-192x192.png'
            },
            {
                action: 'close',
                title: 'Cerrar',
                icon: '/icons/icon-192x192.png'
            }
        ]
    };

    event.waitUntil(
        self.registration.showNotification('TaskMaster', options)
    );
});

// Manejar clicks en notificaciones
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    if (event.action === 'explore') {
        event.waitUntil(
            clients.openWindow('/')
        );
    }
});