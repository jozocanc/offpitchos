self.addEventListener('push', function(event) {
  if (!event.data) return

  const data = event.data.json()

  const options = {
    body: data.message || 'New notification',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'offpitchos',
    data: {
      url: data.url || '/dashboard',
    },
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'OffPitchOS', options)
  )
})

self.addEventListener('notificationclick', function(event) {
  event.notification.close()

  const url = event.notification.data?.url || '/dashboard'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (const client of clientList) {
        if (client.url.includes('/dashboard') && 'focus' in client) {
          // Take an already-open app window to the push's deep link
          // (e.g. /dashboard/check-in) instead of just focusing it.
          const target = new URL(url, self.location.origin).href
          if (client.url !== target && 'navigate' in client) {
            return client.focus().then(function(c) { return (c || client).navigate(target) })
          }
          return client.focus()
        }
      }
      return clients.openWindow(url)
    })
  )
})
