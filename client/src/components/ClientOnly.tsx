'use client';

import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';

interface ClientOnlyProps {
    children: ReactNode;
    fallback?: ReactNode;
}

/**
 * Prevents hydration mismatch by only rendering children after client mount.
 * Use this for components that access browser-only APIs (window, localStorage, etc.)
 */
export function ClientOnly({ children, fallback = null }: ClientOnlyProps) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) {
        return <>{fallback}</>;
    }

    return <>{children}</>;
}
