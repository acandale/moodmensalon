self.addEventListener("push", (event) => {
  let payload = {
    title: "MOOD MEN SALON",
    body: "Ai un reminder pentru programarea ta.",
    url: "/dashboard",
    tag: "appointment-reminder",
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      payload = { ...payload, ...parsed };
    } catch {
      payload.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/pwa-192x192.png",
      badge: "/pwa-192x192.png",
      tag: payload.tag || "appointment-reminder",
      data: { url: payload.url || "/dashboard" },
      vibrate: [200, 100, 200],
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl =
    (event.notification.data && event.notification.data.url) || "/dashboard";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) {
            if ("navigate" in client && typeof client.navigate === "function") {
              client.navigate(targetUrl);
            }
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
        return undefined;
      })
  );
});
