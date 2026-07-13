// Installs a global fetch() patch so every one of this app's ~47 scattered
// `fetch('http://localhost:5001/api/...')` calls automatically carries the logged-in
// user's Bearer token, without having to hand-edit every call site. Call installFetchAuth()
// once at startup (see main.tsx).
//
// Backend routes now reject any request without a valid token (see backend's
// src/middleware/auth.ts + src/index.ts router mounting), so this is required for the
// app to keep working post-login, not just a nice-to-have.
import { useAuthStore } from './store/authStore';

let installed = false;

export function installFetchAuth() {
  if (installed) return;
  installed = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
    const isApiCall = url.includes('/api/');
    const isLoginCall = url.includes('/api/auth/login');

    let finalInit = init;
    if (isApiCall && !isLoginCall) {
      const token = useAuthStore.getState().token;
      if (token) {
        finalInit = {
          ...init,
          headers: {
            ...(init?.headers || {}),
            Authorization: `Bearer ${token}`,
          },
        };
      }
    }

    const response = await originalFetch(input, finalInit);

    // Session expired or token invalid/missing — log out through the store (which also
    // clears sessionStorage) so App.tsx's `if (!user) return <Login />` takes over on the
    // next render, instead of leaving the user staring at silently-failing pages.
    if (isApiCall && !isLoginCall && response.status === 401) {
      useAuthStore.getState().logout();
    }

    return response;
  };
}
