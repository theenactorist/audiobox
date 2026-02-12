import { useState, useEffect, useCallback, useRef } from 'react';

export interface AudioStreamConfig {
    deviceId?: string;
    sampleRate?: number;
}

export function useAudioStream(config: AudioStreamConfig = {}) {
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [error, setError] = useState<Error | null>(null);
    const [volume, setVolume] = useState(1); // 0-1 range
    const [isMuted, setIsMuted] = useState(false);

    const streamRef = useRef<MediaStream | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const gainNodeRef = useRef<GainNode | null>(null);
    const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const destinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);

    const startStream = useCallback(async (deviceId?: string) => {
        try {
            // Stop existing stream
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }

            const rawStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    deviceId: deviceId ? { exact: deviceId } : undefined,
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    channelCount: 2,
                    sampleRate: config.sampleRate || 48000,
                },
                video: false,
            });

            // Create Web Audio API nodes for volume control
            const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
            const audioContext = new AudioContext();
            const source = audioContext.createMediaStreamSource(rawStream);
            const gainNode = audioContext.createGain();
            const destination = audioContext.createMediaStreamDestination();

            // Set initial volume
            gainNode.gain.value = isMuted ? 0 : volume;

            // Connect: source -> gain -> destination
            source.connect(gainNode);
            gainNode.connect(destination);

            // Store refs
            audioContextRef.current = audioContext;
            sourceNodeRef.current = source;
            gainNodeRef.current = gainNode;
            destinationRef.current = destination;
            streamRef.current = rawStream;

            // Use the processed stream
            setStream(destination.stream);
            setError(null);
        } catch (err) {
            console.error('Error accessing microphone:', err);
            setError(err instanceof Error ? err : new Error('Unknown error'));
            setStream(null);
            streamRef.current = null;
        }
    }, [config.sampleRate, volume, isMuted]);

    const stopStream = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
            setStream(null);
        }

        // Clean up Web Audio API nodes
        if (sourceNodeRef.current) {
            sourceNodeRef.current.disconnect();
            sourceNodeRef.current = null;
        }
        if (gainNodeRef.current) {
            gainNodeRef.current.disconnect();
            gainNodeRef.current = null;
        }
        if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }
        destinationRef.current = null;
    }, []);

    const updateVolume = useCallback((newVolume: number) => {
        setVolume(newVolume);
        if (gainNodeRef.current && !isMuted) {
            gainNodeRef.current.gain.value = newVolume;
        }
    }, [isMuted]);

    const toggleMute = useCallback(() => {
        const newMuted = !isMuted;
        setIsMuted(newMuted);
        if (gainNodeRef.current) {
            gainNodeRef.current.gain.value = newMuted ? 0 : volume;
        }
    }, [isMuted, volume]);

    // Get audio track from a specific device (for seamless switching)
    const getAudioTrack = useCallback(async (deviceId: string): Promise<MediaStreamTrack | null> => {
        try {
            const constraints: MediaStreamConstraints = {
                audio: {
                    deviceId: { exact: deviceId },
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    channelCount: 2,
                    sampleRate: config.sampleRate || 48000,
                },
                video: false,
            };

            const newStream = await navigator.mediaDevices.getUserMedia(constraints);
            const audioTrack = newStream.getAudioTracks()[0];

            // Stop old track if exists
            if (streamRef.current) {
                streamRef.current.getAudioTracks().forEach(track => track.stop());
            }

            // Update stream ref
            streamRef.current = newStream;

            // Recreate Web Audio processing chain
            if (audioContextRef.current && sourceNodeRef.current && gainNodeRef.current && destinationRef.current) {
                // Disconnect old source
                sourceNodeRef.current.disconnect();

                // Create new source with new track
                const newSource = audioContextRef.current.createMediaStreamSource(newStream);
                newSource.connect(gainNodeRef.current);

                sourceNodeRef.current = newSource;

                // Update the output stream
                setStream(destinationRef.current.stream);
            }

            return audioTrack;
        } catch (err) {
            console.error('Error getting audio track:', err);
            return null;
        }
    }, [config.sampleRate]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
            if (sourceNodeRef.current) {
                sourceNodeRef.current.disconnect();
            }
            if (gainNodeRef.current) {
                gainNodeRef.current.disconnect();
            }
            if (audioContextRef.current) {
                audioContextRef.current.close();
            }
        };
    }, []);

    return { stream, error, startStream, stopStream, volume, isMuted, updateVolume, toggleMute, getAudioTrack };
}
