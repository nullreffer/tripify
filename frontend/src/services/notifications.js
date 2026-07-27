const API = import.meta.env.VITE_API_URL || '';

/**
 * Request notification permission and subscribe the user to push notifications.
 * Registers the service worker if not already registered.
 * Returns true on success, false on failure or denial.
 */
export async function subscribeToNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return false;

  try {
    // Fetch the VAPID public key from the backend
    const keyRes = await fetch(`${API}/api/notifications/vapid-public-key`, { credentials: 'include' });
    if (!keyRes.ok) return false;
    const { key } = await keyRes.json();
    if (!key) return false;

    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });

    await fetch(`${API}/api/notifications/subscribe`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub.toJSON()),
    });

    return true;
  } catch (err) {
    console.error('Push subscription failed:', err);
    return false;
  }
}

/**
 * Unsubscribe the current browser from push notifications.
 * Returns true on success.
 */
export async function unsubscribeFromNotifications() {
  if (!('serviceWorker' in navigator)) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return true;

    await fetch(`${API}/api/notifications/subscribe`, {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });

    await sub.unsubscribe();
    return true;
  } catch (err) {
    console.error('Push unsubscribe failed:', err);
    return false;
  }
}

/**
 * Returns the current push subscription state: 'unsupported' | 'denied' | 'subscribed' | 'unsubscribed'
 */
export async function getNotificationState() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub ? 'subscribed' : 'unsubscribed';
  } catch {
    return 'unsubscribed';
  }
}

/** Convert a base64url VAPID public key to Uint8Array for PushManager.subscribe */
function urlBase64ToUint8Array(base64String) {
  try {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
  } catch (err) {
    throw new Error(`Invalid VAPID public key — check VITE_API_URL and server VAPID configuration: ${err.message}`);
  }
}
