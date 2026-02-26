import { useRef, useCallback } from 'react';

/**
 * useKeepAlive — iOS Background Audio Keep-Alive
 * 
 * Plays a near-silent audio loop via a hidden <audio> element when activated.
 * This signals to iOS that the tab is an active media player, making the OS
 * less aggressive about suspending JavaScript execution when the tab is backgrounded.
 * 
 * Also attaches a MediaStream to a second hidden <audio> element (MediaStreamDestination trick)
 * which makes Safari treat the page as a live audio stream player.
 */

// Tiny silent WAV file encoded as base64 (44 bytes header + minimal silence)
// This is a valid 1-sample mono 8-bit WAV at 8000Hz
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

export function useKeepAlive() {
    const silentAudioRef = useRef<HTMLAudioElement | null>(null);
    const streamAudioRef = useRef<HTMLAudioElement | null>(null);

    /**
     * Start the silent audio loop (Layer 1) and optionally attach a live stream (Layer 2).
     * MUST be called from a user gesture handler (click) to satisfy iOS autoplay policy.
     */
    const activate = useCallback((liveStream?: MediaStream) => {
        // Layer 1: Silent audio keep-alive
        if (!silentAudioRef.current) {
            const audio = new Audio(SILENT_WAV);
            audio.loop = true;
            audio.volume = 0.01; // Near-silent but not zero (iOS may ignore volume=0)
            audio.setAttribute('playsinline', 'true');

            // Play — this works because we're inside a user gesture handler
            audio.play().catch(err => {
                console.warn('[KeepAlive] Silent audio play failed:', err);
            });

            silentAudioRef.current = audio;
            console.log('[KeepAlive] Silent audio loop started');
        }

        // Layer 2: Attach live MediaStream to hidden <audio> element
        // This makes Safari treat the page as a "live media player"
        if (liveStream && !streamAudioRef.current) {
            const streamEl = new Audio();
            streamEl.srcObject = liveStream;
            streamEl.volume = 0; // We don't actually want to hear the loopback
            streamEl.muted = true; // Mute to avoid echo
            streamEl.setAttribute('playsinline', 'true');

            streamEl.play().catch(err => {
                console.warn('[KeepAlive] Stream audio play failed:', err);
            });

            streamAudioRef.current = streamEl;
            console.log('[KeepAlive] MediaStream attached to hidden audio element');
        }
    }, []);

    /**
     * Stop all keep-alive audio elements.
     */
    const deactivate = useCallback(() => {
        if (silentAudioRef.current) {
            silentAudioRef.current.pause();
            silentAudioRef.current.src = '';
            silentAudioRef.current = null;
            console.log('[KeepAlive] Silent audio stopped');
        }

        if (streamAudioRef.current) {
            streamAudioRef.current.pause();
            streamAudioRef.current.srcObject = null;
            streamAudioRef.current = null;
            console.log('[KeepAlive] Stream audio element removed');
        }
    }, []);

    return { activate, deactivate };
}
