/** Base API client with auth handling and error management */

export class ApiError extends Error {
  status: number;
  statusText: string;
  body?: unknown;

  constructor(status: number, statusText: string, body?: unknown) {
    super(`API Error: ${status} ${statusText}`);
    this.name = "ApiError";
    this.status = status;
    this.statusText = statusText;
    this.body = body;
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      // ignore parse errors
    }

    if (response.status === 401) {
      // Redirect to login on auth failure
      const returnUrl = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/login?return=${returnUrl}`;
      throw new ApiError(401, "Unauthorized", body);
    }

    throw new ApiError(response.status, response.statusText, body);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    method: "GET",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
    },
  });
  return handleResponse<T>(response);
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return handleResponse<T>(response);
}

export async function apiPut<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "PUT",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return handleResponse<T>(response);
}

export async function apiDelete<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    method: "DELETE",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
    },
  });
  return handleResponse<T>(response);
}

/** Login */
export interface LoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface LoginResponse {
  success: boolean;
  email: string;
}

export async function login(req: LoginRequest): Promise<LoginResponse> {
  return apiPost<LoginResponse>("/api/auth/login", req);
}

export async function logout(): Promise<void> {
  return apiPost<void>("/api/auth/logout");
}

/** Check session */
export interface SessionInfo {
  email: string;
  accountId: string;
}

export async function getSession(): Promise<SessionInfo> {
  return apiGet<SessionInfo>("/api/auth/session");
}
