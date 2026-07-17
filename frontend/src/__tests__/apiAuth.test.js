import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiRequest, setOnUnauthorized } from '../../api.js';

function res(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: () => null },
    json: async () => body,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  setOnUnauthorized(null);
});

describe('apiRequest 401 handling', () => {
  it('silently refreshes and retries on 401, keeping the user logged in', async () => {
    const onUnauth = vi.fn();
    setOnUnauthorized(onUnauth);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(res(401, { detail: 'expired' })) // GET /parts -> access token expired
      .mockResolvedValueOnce(res(200, {})) // POST /auth/refresh -> ok
      .mockResolvedValueOnce(res(200, [{ id: 1 }])); // retry GET /parts -> ok
    global.fetch = fetchMock;

    const data = await apiRequest('/parts');

    expect(data).toEqual([{ id: 1 }]);
    expect(onUnauth).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(
      fetchMock.mock.calls.some((c) => String(c[0]).includes('/auth/refresh')),
    ).toBe(true);
  });

  it('forces a single logout only when the refresh also fails', async () => {
    const onUnauth = vi.fn();
    setOnUnauthorized(onUnauth);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(res(401, {})) // GET /parts
      .mockResolvedValueOnce(res(401, {})); // POST /auth/refresh fails
    global.fetch = fetchMock;

    await expect(apiRequest('/parts')).rejects.toThrow(/Session expired/);
    expect(onUnauth).toHaveBeenCalledTimes(1);
  });

  it('does NOT log out when the refresh itself is rate-limited (429 transient)', async () => {
    const onUnauth = vi.fn();
    setOnUnauthorized(onUnauth);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(res(401, {})) // GET /parts -> access token expired
      .mockResolvedValueOnce(res(429, {})); // POST /auth/refresh -> rate limited (transient)
    global.fetch = fetchMock;

    await expect(apiRequest('/parts')).rejects.toThrow(/temporarily unavailable/);
    expect(onUnauth).not.toHaveBeenCalled(); // session preserved, no logout
  });

  it('logs out only on a genuine refresh rejection (403 unauthorized)', async () => {
    const onUnauth = vi.fn();
    setOnUnauthorized(onUnauth);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(res(401, {})) // GET /parts
      .mockResolvedValueOnce(res(403, {})); // POST /auth/refresh -> genuinely rejected
    global.fetch = fetchMock;

    await expect(apiRequest('/parts')).rejects.toThrow(/Session expired/);
    expect(onUnauth).toHaveBeenCalledTimes(1);
  });

  it('does not refresh or log out on a failed login (401 on /auth/login)', async () => {
    const onUnauth = vi.fn();
    setOnUnauthorized(onUnauth);
    const fetchMock = vi.fn().mockResolvedValueOnce(res(401, { detail: 'bad creds' }));
    global.fetch = fetchMock;

    await expect(
      apiRequest('/auth/login', { method: 'POST', body: '{}' }),
    ).rejects.toThrow();
    expect(onUnauth).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1); // no refresh attempt
  });
});
