/**
 * Application runtime configuration.
 *
 * In split deployments (Vercel frontend + Render backend), VITE_BACKEND_URL
 * points to the backend HTTPS origin (e.g. https://skribbl-clone-backend.onrender.com).
 * In local development or unified single-port hosting, VITE_BACKEND_URL is unset,
 * falling back to relative paths / same-origin proxy.
 */
const rawBackendUrl = import.meta.env.VITE_BACKEND_URL;

export const BACKEND_URL: string = rawBackendUrl && rawBackendUrl.trim() !== ''
  ? rawBackendUrl.trim().replace(/\/+$/, '')
  : '';
