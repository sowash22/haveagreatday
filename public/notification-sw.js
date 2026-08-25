self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destination = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
      const openWindow = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (openWindow) {
        await openWindow.navigate(destination);
        return openWindow.focus();
      }
      return self.clients.openWindow(destination);
    }),
  );
});
