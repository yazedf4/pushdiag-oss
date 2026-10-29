self.addEventListener('push', (event) => {
  let payload = { title: 'New Notification', body: 'You have a new update.' };
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = { title: 'Notification', body: event.data.text() };
    }
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/icon-192.png'
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/'));
});

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.registration.pushManager.subscribe(event.oldSubscription.options)
  );
});
