import { useState, useEffect, useCallback, useRef } from 'react';

export interface AudioStreamConfig {
    deviceId?: string;
    sampleRate?: number;
}

export function useAudioStream(config: AudioStreamConfig = {}) {
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [error, setError] = useState<Error | null>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const startStream = useCallback(async (deviceId?: string) => {
        try {
            // Stop existing stream
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }

            const constraints: MediaStreamConstraints = {
                audio: {
                    deviceId: deviceId ? { exact: deviceId } : undefined,
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    channelCount: 2,
                    sampleRate: config.sampleRate || 48000,
                },
                video: false,
            };

            const newStream = await navigator.mediaDevices.getUserMedia(constraints);
            streamRef.current = newStream;
            setStream(newStream);
            setError(null);
        } catch (err) {
            console.error('Error accessing microphone:', err);
            setError(err instanceof Error ? err : new Error('Unknown error'));
            setStream(null);
            streamRef.current = null;
        }
    }, [config.sampleRate]);

    const stopStream = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
            setStream(null);
        }
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
        };
    }, []);

    return { stream, error, startStream, stopStream };
}
