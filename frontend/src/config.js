// Blackbox BOM — Application Configuration
//
// Same-origin by default. The Docker Compose deployment (see
// docker-compose.yml + frontend/nginx.conf) serves this bundle from nginx
// on a single port and reverse-proxies /api/ and /ws/ to the backend
// container — there is no separate backend port exposed to the browser.
// Relative/derived defaults mean the built bundle works unmodified no
// matter what host/port/protocol serves it (http://localhost, a LAN
// hostname, a custom FRONTEND_PORT, HTTPS behind a real domain, etc.),
// with zero build-time configuration required.
//
// Only set window.__BBOX_CONFIG (e.g. via a small inline <script> injected
// before this bundle loads) if the API/WS truly live on a *different*
// origin than the one serving the page.
function defaultWsBase() {
  if (typeof window === 'undefined' || !window.location) return 'ws://localhost/ws';
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws`;
}

const DEFAULTS = {
  API_BASE: '/api/v1',
  WS_BASE: defaultWsBase(),
  ENABLE_ANALYTICS: true,
  ENABLE_WEBSOCKET_COLLAB: true,
  SESSION_TIMEOUT_MINUTES: 60,
  REFRESH_INTERVAL: 30000,
  CACHE_TTL_SECONDS: 300,
};

const userConfig = (typeof window !== 'undefined' && window.__BBOX_CONFIG) || {};
const config = { ...DEFAULTS, ...userConfig };

export default config;
export const API_BASE = () => config.API_BASE;
export const WS_BASE = () => config.WS_BASE;
