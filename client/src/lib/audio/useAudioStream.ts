import { useState, useEffect, useCallback, useRef } from 'react';

export interface AudioStreamConfig {
    deviceId?: string;
    sampleRate?: number;
}

export function useAudioStream(config: AudioStreamConfig = {}) {
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [error, setError] = useState<Error | null>(null);
    const [volume, setVolume] = useState(70); // 0-100 range, mapped to gain 0-1.0 (unity)
    const [isMuted, setIsMuted] = useState(false);

    const streamRef = useRef<MediaStream | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const gainNodeRef = useRef<GainNode | null>(null);
    const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const destinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
    const volumeRef = useRef(volume);
    const isMutedRef = useRef(isMuted);

    // Keep refs in sync with state
    useEffect(() => { volumeRef.current = volume; }, [volume]);
    useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

    const startStream = useCallback(async (deviceId?: string) => {
        try {
            // Stop existing stream
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }

            // Request MONO audio — most phone mics are mono.
            // Requesting stereo (channelCount: 2) on a mono mic creates a stereo stream
            // with audio only in the left channel, causing left-speaker-only playback.
            const rawStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    deviceId: deviceId ? { ideal: deviceId } : undefined,
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    channelCount: 1,
                    sampleRate: config.sampleRate || 48000,
                },
                video: false,
            });

            // Create Web Audio API nodes for volume control
            const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
            const audioContext = new AudioContext();
            const source = audioContext.createMediaStreamSource(rawStream);
            const gainNode = audioContext.createGain();

            // Create a mono-friendly destination
            // channelCount: 1 ensures the output is mono, which players will route to both speakers
            const destination = audioContext.createMediaStreamDestination();
            destination.channelCount = 1;

            // Set initial volume: map 0-100 slider to 0.0-1.0 gain (unity = no amplification)
            gainNode.gain.value = isMutedRef.current ? 0 : volumeRef.current / 100;

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
    }, [config.sampleRate]);

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
            gainNodeRef.current.gain.value = newVolume / 100;
        }
    }, [isMuted]);

    const toggleMute = useCallback(() => {
        const newMuted = !isMuted;
        setIsMuted(newMuted);
        if (gainNodeRef.current) {
            gainNodeRef.current.gain.value = newMuted ? 0 : volume / 100;
        }
    }, [isMuted, volume]);

    // Get audio track from a specific device (for seamless switching)
    const getAudioTrack = useCallback(async (deviceId: string): Promise<MediaStreamTrack | null> => {
        try {
            const constraints: MediaStreamConstraints = {
                audio: {
                    deviceId: { ideal: deviceId },
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    channelCount: 1,
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

    return { stream, error, startStream, stopStream, volume, isMuted, updateVolume, toggleMute, getAudioTrack, audioContext: audioContextRef.current };
}
