/**
 * api.ts — Fetch wrapper with JWT in-memory storage and auto-refresh
 *
 * Security design:
 *   - Access token stored in module-level variable (NOT localStorage/sessionStorage)
 *     → Eliminates XSS token theft via localStorage
 *   - Refresh token stored in httpOnly cookie (server-controlled)
 *   - On 401: attempt silent refresh via cookie, retry original request
 *   - On refresh failure: clear state, redirect to /login
 *   - credentials: "include" on all requests so cookies are sent
 */

// ============================================================
// In-memory token store (module scope = not accessible from other scripts)
// ============================================================

let _accessToken: string | null = null;

export function setAccessToken(token: string): void {
  _accessToken = token;
}

export function getAccessToken(): string | null {
  return _accessToken;
}

export function clearAccessToken(): void {
  _accessToken = null;
}

// ============================================================
// Refresh logic
// ============================================================

let _isRefreshing = false;
let _refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  // Deduplicate concurrent refresh attempts
  if (_isRefreshing && _refreshPromise) {
    return _refreshPromise;
  }

  _isRefreshing = true;
  _refreshPromise = (async () => {
    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include",
      });

      if (!res.ok) {
        return null;
      }

      const data = (await res.json()) as { accessToken: string };
      setAccessToken(data.accessToken);
      return data.accessToken;
    } catch {
      return null;
    } finally {
      _isRefreshing = false;
      _refreshPromise = null;
    }
  })();

  return _refreshPromise;
}

// ============================================================
// Core fetch wrapper
// ============================================================

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

function buildHeaders(method: HttpMethod, extraHeaders?: HeadersInit): Headers {
  const headers = new Headers(extraHeaders);

  if (_accessToken) {
    headers.set("Authorization", `Bearer ${_accessToken}`);
  }

  // Set JSON content type for mutation methods (unless caller overrides)
  if (
    ["POST", "PUT", "PATCH"].includes(method) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  return headers;
}

export async function apiFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const method = ((options.method ?? "GET") as HttpMethod).toUpperCase() as HttpMethod;

  const headers = buildHeaders(method, options.headers as HeadersInit | undefined);

  const init: RequestInit = {
    ...options,
    method,
    headers,
    credentials: "include",
  };

  let response = await fetch(path, init);

  // On 401: attempt silent token refresh and retry once
  if (response.status === 401) {
    const newToken = await refreshAccessToken();

    if (newToken) {
      // Retry with the new token
      headers.set("Authorization", `Bearer ${newToken}`);
      response = await fetch(path, { ...init, headers });
    } else {
      // Refresh failed — clear state and redirect to login
      clearAccessToken();
      window.location.href = "/login";
      // Return the 401 so callers can handle it if needed
      return response;
    }
  }

  return response;
}

// ============================================================
// Typed convenience methods
// ============================================================

async function get<T = unknown>(path: string): Promise<T> {
  const res = await apiFetch(path, { method: "GET" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw Object.assign(new Error((body as { error: string }).error ?? res.statusText), {
      status: res.status,
      body,
    });
  }
  return res.json() as Promise<T>;
}

async function post<T = unknown>(path: string, body?: unknown): Promise<T> {
  const res = await apiFetch(path, {
    method: "POST",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: res.statusText }));
    throw Object.assign(
      new Error((errBody as { error: string }).error ?? res.statusText),
      { status: res.status, body: errBody },
    );
  }
  return res.json() as Promise<T>;
}

async function put<T = unknown>(path: string, body?: unknown): Promise<T> {
  const res = await apiFetch(path, {
    method: "PUT",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: res.statusText }));
    throw Object.assign(
      new Error((errBody as { error: string }).error ?? res.statusText),
      { status: res.status, body: errBody },
    );
  }
  return res.json() as Promise<T>;
}

async function patch<T = unknown>(path: string, body?: unknown): Promise<T> {
  const res = await apiFetch(path, {
    method: "PATCH",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: res.statusText }));
    throw Object.assign(
      new Error((errBody as { error: string }).error ?? res.statusText),
      { status: res.status, body: errBody },
    );
  }
  return res.json() as Promise<T>;
}

async function del<T = unknown>(path: string): Promise<T> {
  const res = await apiFetch(path, { method: "DELETE" });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: res.statusText }));
    throw Object.assign(
      new Error((errBody as { error: string }).error ?? res.statusText),
      { status: res.status, body: errBody },
    );
  }
  return res.json() as Promise<T>;
}

export const api = { get, post, put, patch, delete: del } as const;
