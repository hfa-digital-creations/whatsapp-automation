import axios, { AxiosError } from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api';

export const api = axios.create({ baseURL });

export function getStoredAuth() {
  const raw = localStorage.getItem('wa_auto_auth');
  return raw ? (JSON.parse(raw) as StoredAuth) : null;
}

export interface StoredAuth {
  accessToken: string;
  refreshToken: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'CLIENT';
  mustChangePassword: boolean;
  email: string;
}

export function setStoredAuth(auth: StoredAuth | null) {
  if (auth) localStorage.setItem('wa_auto_auth', JSON.stringify(auth));
  else localStorage.removeItem('wa_auto_auth');
}

api.interceptors.request.use((config) => {
  const auth = getStoredAuth();
  if (auth?.accessToken) {
    config.headers.Authorization = `Bearer ${auth.accessToken}`;
  }
  return config;
});

let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const auth = getStoredAuth();
  if (!auth?.refreshToken) return null;
  try {
    const { data } = await axios.post(`${baseURL}/auth/refresh`, { refreshToken: auth.refreshToken });
    const next: StoredAuth = { ...auth, ...data.data };
    setStoredAuth(next);
    return next.accessToken;
  } catch {
    setStoredAuth(null);
    return null;
  }
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as any;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      if (!refreshing) refreshing = refreshAccessToken().finally(() => (refreshing = null));
      const token = await refreshing;
      if (token) {
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      }
      window.location.assign('/login');
    }
    return Promise.reject(error);
  },
);

export function apiErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string | string[] } | undefined;
    if (Array.isArray(data?.message)) return data!.message.join(', ');
    if (data?.message) return data.message;
  }
  return 'Something went wrong. Please try again.';
}
