// Cloud Sync Module — bridges frontend localStorage with PostgreSQL backend
// Provides automatic sync on login, periodic sync, and manual sync triggers

const SYNC_API = 'http://localhost:8001/api/v1/user-sync';
const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const SYNC_KEYS = [
  '__bbox_rows',
  '__bbox_notifications',
  '__bbox_comments',
  '__bbox_templates',
  '__bbox_checklist',
  '__bbox_checklist_dismissed',
  '__bbox_scrape_history',
  '__bbox_recent_scans',
  '__bbox_notif',
  '__bbox_a11y',
  '__bbox_rate',
];

let syncTimer = null;
let syncInProgress = false;

function isAuthenticated() {
  return document.cookie.includes('access_token=');
}

async function syncAllToServer() {
  if (syncInProgress) return;
  if (!isAuthenticated()) return;

  syncInProgress = true;
  const payload = {};

  for (const key of SYNC_KEYS) {
    const val = localStorage.getItem(key);
    if (val !== null) {
      try {
        payload[key] = JSON.parse(val);
      } catch {
        payload[key] = val;
      }
    }
  }

  try {
    const resp = await fetch(`${SYNC_API}/sync-all`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (resp.ok) {
      const result = await resp.json();
      console.log(`[CloudSync] Synced ${result.count} keys to server`);
    } else if (resp.status === 401) {
      console.warn('[CloudSync] Auth expired, stopping sync');
      window.toast?.('Cloud sync stopped — session expired', { kind: 'warn' });
      stopSync();
    }
  } catch (e) {
    console.warn('[CloudSync] Sync failed (offline?):', e.message);
    window.toast?.('Cloud sync failed — check your connection', { kind: 'error' });
  } finally {
    syncInProgress = false;
  }
}

async function pullFromServer() {
  if (!isAuthenticated()) return;

  try {
    const resp = await fetch(`${SYNC_API}/export-all`, {
      credentials: 'include',
    });
    if (!resp.ok) return;

    const data = await resp.json();
    let restored = 0;

    for (const [key, value] of Object.entries(data)) {
      const stored = localStorage.getItem(key);
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      if (stored !== serialized) {
        localStorage.setItem(key, serialized);
        restored++;
      }
    }

    if (restored > 0) {
      console.log(`[CloudSync] Synced ${restored} keys from server`);
      window.dispatchEvent(new CustomEvent('cloudsync:restored', { detail: { count: restored } }));
      if (data.__bbox_rows) {
        window.dispatchEvent(new CustomEvent('cloudsync:rows-updated'));
      }
    }
  } catch (e) {
    console.warn('[CloudSync] Pull failed:', e.message);
    window.toast?.('Failed to pull latest data from server', { kind: 'warn' });
  }
}

function startSync() {
  stopSync();
  // Pull from server on start
  pullFromServer();
  // Periodic sync
  syncTimer = setInterval(syncAllToServer, SYNC_INTERVAL_MS);
  console.log(`[CloudSync] Started (interval: ${SYNC_INTERVAL_MS / 1000}s)`);
}

function stopSync() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}

function triggerSync() {
  syncAllToServer();
}

// Expose to window for use from other modules
export const cloudSync = {
  start: startSync,
  stop: stopSync,
  syncNow: triggerSync,
  pullNow: pullFromServer,
};
window.cloudSync = cloudSync;

// Auto-start when auth cookie is detected
(function autoInit() {
  let lastAuth = isAuthenticated();

  if (lastAuth) {
    setTimeout(startSync, 2000);
  }

  setInterval(() => {
    const current = isAuthenticated();
    if (current && !lastAuth) {
      setTimeout(startSync, 1000);
    } else if (!current && lastAuth) {
      stopSync();
    }
    lastAuth = current;
  }, 3000);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      const current = isAuthenticated();
      if (current && !lastAuth) {
        setTimeout(startSync, 1000);
      } else if (!current && lastAuth) {
        stopSync();
      }
      lastAuth = current;
    }
  });
})();
