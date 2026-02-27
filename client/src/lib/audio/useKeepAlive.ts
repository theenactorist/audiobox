import { useRef, useCallback } from 'react';

/**
 * useKeepAlive — Mobile Background Audio Keep-Alive (iOS + Android)
 * 
 * Plays a near-silent audio loop via a hidden <audio> element when activated.
 * This signals to mobile OSes that the tab is an active media player, making them
 * less aggressive about suspending JavaScript execution when the tab is backgrounded.
 * 
 * Also registers a Media Session API handler so Chrome Android shows the
 * broadcast in the notification shade and treats the tab as a foreground media task.
 * 
 * Layers:
 *   1. Silent audio loop — keeps JS alive on iOS Safari and Android Chrome
 *   2. MediaStream attachment — makes Safari treat page as live audio player
 *   3. Media Session API — registers with Android's media notification system
 */

// Tiny silent WAV file encoded as base64 (44 bytes header + minimal silence)
// This is a valid 1-sample mono 8-bit WAV at 8000Hz
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

export function useKeepAlive() {
    const silentAudioRef = useRef<HTMLAudioElement | null>(null);
    const streamAudioRef = useRef<HTMLAudioElement | null>(null);

    /**
     * Start the silent audio loop (Layer 1), attach live stream (Layer 2),
     * and register Media Session (Layer 3).
     * MUST be called from a user gesture handler (click) to satisfy autoplay policy.
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

        // Layer 3: Media Session API — Android Chrome notification integration
        // This registers the page as an active media player in the OS, which:
        //   - Shows a persistent "Now Playing" notification on Android
        //   - Prevents Chrome from aggressively throttling the tab
        //   - Gives the OS a strong signal that audio recording is intentional
        if ('mediaSession' in navigator) {
            try {
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: 'AudioBox — Broadcasting Live',
                    artist: 'AudioBox Studio',
                    album: 'Live Broadcast',
                });

                // Set playback state to "playing" so Android keeps the tab alive
                navigator.mediaSession.playbackState = 'playing';

                // Handle media button events (e.g. headphone pause button)
                navigator.mediaSession.setActionHandler('pause', () => {
                    console.log('[KeepAlive] Media session pause requested — ignoring to keep broadcast alive');
                    // Don't actually pause — we want to keep broadcasting
                    // Re-assert playing state
                    navigator.mediaSession.playbackState = 'playing';
                });
                navigator.mediaSession.setActionHandler('play', () => {
                    console.log('[KeepAlive] Media session play requested');
                    navigator.mediaSession.playbackState = 'playing';
                });

                console.log('[KeepAlive] Media Session API registered (Android notification active)');
            } catch (err) {
                console.warn('[KeepAlive] Media Session API failed:', err);
            }
        }
    }, []);

    /**
     * Stop all keep-alive audio elements and clear Media Session.
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

        // Clear Media Session
        if ('mediaSession' in navigator) {
            try {
                navigator.mediaSession.playbackState = 'none';
                navigator.mediaSession.metadata = null;
                navigator.mediaSession.setActionHandler('pause', null);
                navigator.mediaSession.setActionHandler('play', null);
                console.log('[KeepAlive] Media Session cleared');
            } catch (err) {
                // Some browsers don't support clearing handlers
            }
        }
    }, []);

    return { activate, deactivate };
}
