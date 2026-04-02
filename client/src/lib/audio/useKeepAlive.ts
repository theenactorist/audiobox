import { useRef, useCallback } from 'react';

/**
 * useKeepAlive — Background Audio Keep-Alive (All Platforms)
 * 
 * Plays a near-silent audio loop via a hidden <audio> element when activated.
 * This signals to browsers (especially Chrome) that the tab is an active media
 * player, preventing aggressive background tab throttling that would starve
 * the MediaRecorder of timer ticks and kill the audio stream.
 * 
 * On desktop: Chrome throttles unfocused/split-screen tabs — even more so on
 * battery — and will stop firing MediaRecorder.ondataavailable if it considers
 * the tab inactive. The silent audio loop prevents this.
 * 
 * On mobile: iOS Safari and Android Chrome additionally suspend JS execution
 * entirely when backgrounded. The audio loop + Media Session API keep the
 * tab alive in the notification shade.
 * 
 * Layers:
 *   1. Silent audio loop — keeps JS alive across all browsers
 *   2. MediaStream attachment — makes Safari treat page as live audio player
 *   3. Media Session API / Native Foreground Service — OS-level keep-alive
 */

// Tiny silent WAV file encoded as base64 (44 bytes header + minimal silence)
// This is a valid 1-sample mono 8-bit WAV at 8000Hz
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

import { ForegroundService } from '@capawesome-team/capacitor-android-foreground-service';
import { Capacitor } from '@capacitor/core';

export function useKeepAlive() {
    const silentAudioRef = useRef<HTMLAudioElement | null>(null);
    const streamAudioRef = useRef<HTMLAudioElement | null>(null);

    /**
     * Start the silent audio loop (Layer 1), attach live stream (Layer 2),
     * and register Media Session/Foreground Service (Layer 3).
     * MUST be called from a user gesture handler (click) to satisfy autoplay policy.
     */
    const activate = useCallback(async (liveStream?: MediaStream) => {
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

        // Layer 3: Native Android Foreground Service (Capacitor)
        // If we are running inside the native Android APK wrapper, this starts
        // a formal foreground service that forces Android to keep the microphone alive
        // even when the screen is locked or the app is minimized.
        if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
            try {
                await ForegroundService.startForegroundService({
                    id: 112233,
                    title: 'AudioBox is Live',
                    body: 'Broadcasting in progress. Tap to return to studio.',
                    smallIcon: 'ic_stat_mic', // Built-in android mic icon fallback
                });
                console.log('[KeepAlive] Native Android Foreground Service started');
            } catch (err) {
                console.error('[KeepAlive] Failed to start native Foreground Service:', err);
            }
        }
        // Layer 3: Fallback Media Session API (Web only)
        // For browsers (Chrome Android), this gives a weaker but still helpful signal.
        else if ('mediaSession' in navigator) {
            try {
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: 'AudioBox — Broadcasting Live',
                    artist: 'AudioBox Studio',
                    album: 'Live Broadcast',
                });

                navigator.mediaSession.playbackState = 'playing';

                navigator.mediaSession.setActionHandler('pause', () => {
                    console.log('[KeepAlive] Media session pause requested — ignoring to keep broadcast alive');
                    navigator.mediaSession.playbackState = 'playing';
                });
                navigator.mediaSession.setActionHandler('play', () => {
                    console.log('[KeepAlive] Media session play requested');
                    navigator.mediaSession.playbackState = 'playing';
                });

                console.log('[KeepAlive] Media Session API registered (Web notification active)');
            } catch (err) {
                console.warn('[KeepAlive] Media Session API failed:', err);
            }
        }
    }, []);

    /**
     * Stop all keep-alive audio elements and clear native/web services.
     */
    const deactivate = useCallback(async () => {
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

        // Clear Native Foreground Service
        if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
            try {
                await ForegroundService.stopForegroundService();
                console.log('[KeepAlive] Native Android Foreground Service stopped');
            } catch (err) {
                console.error('[KeepAlive] Failed to stop native Foreground Service:', err);
            }
        }
        // Clear Web Media Session
        else if ('mediaSession' in navigator) {
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
