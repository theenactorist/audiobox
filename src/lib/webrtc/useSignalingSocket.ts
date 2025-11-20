import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

export function useSignalingSocket() {
    const socketRef = useRef<Socket | null>(null);

    useEffect(() => {
        const socketUrl = process.env.NEXT_PUBLIC_SIGNALING_URL || 'http://localhost:3001';
        socketRef.current = io(socketUrl);

        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
            }
        };
    }, []);

    const emit = useCallback((event: string, ...args: any[]) => {
        if (socketRef.current) {
            socketRef.current.emit(event, ...args);
        }
    }, []);

    const on = useCallback((event: string, callback: (...args: any[]) => void) => {
        if (socketRef.current) {
            socketRef.current.on(event, callback);
        }
    }, []);

    const off = useCallback((event: string, callback?: (...args: any[]) => void) => {
        if (socketRef.current) {
            socketRef.current.off(event, callback);
        }
    }, []);

    return { socket: socketRef.current, emit, on, off };
}
