import { API_BASE_URL } from "./api-base-url";

export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API_BASE_URL}${path}`, { ...init, credentials: "include" });
}
