// Blackbox BOM — Application Configuration

const DEFAULTS = {
  API_BASE: 'http://localhost:8001/api/v1',
  WS_BASE: 'ws://localhost:8001/ws',
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
