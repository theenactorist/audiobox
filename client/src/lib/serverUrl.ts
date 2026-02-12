/**
 * Get the signaling/API server URL.
 * In production, the client is served from the same origin as the server,
 * so we can just use window.location.origin.
 * In development, we use VITE_SIGNALING_URL or fall back to localhost:3001.
 */
export function getServerUrl(): string {
    // If VITE_SIGNALING_URL is explicitly set, use it
    if (import.meta.env.VITE_SIGNALING_URL) {
        return import.meta.env.VITE_SIGNALING_URL;
    }

    // In production, client is served from the same origin as the API
    if (import.meta.env.PROD) {
        return window.location.origin;
    }

    // Dev fallback
    return 'http://localhost:3001';
}
