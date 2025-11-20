'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegistration() {
    useEffect(() => {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker
                .register('/sw.js')
                .then((registration) => {
                    console.log('Service Worker registered:', registration);

                    // Keep service worker alive for background audio
                    setInterval(() => {
                        if (registration.active) {
                            registration.active.postMessage({ type: 'KEEP_ALIVE' });
                        }
                    }, 30000); // Every 30 seconds
                })
                .catch((error) => {
                    console.error('Service Worker registration failed:', error);
                });
        }
    }, []);

    return null;
}
