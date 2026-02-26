import { useState, useEffect, useCallback } from 'react';

export function useAudioDevices() {
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    const [permissionGranted, setPermissionGranted] = useState(false);
    const [permissionDenied, setPermissionDenied] = useState(false);

    const enumerateAudioDevices = useCallback(async () => {
        try {
            const allDevices = await navigator.mediaDevices.enumerateDevices();
            const audioInputs = allDevices.filter(device => device.kind === 'audioinput');
            setDevices(audioInputs);
            return audioInputs;
        } catch (err) {
            console.error('Error enumerating devices:', err);
            return [];
        }
    }, []);

    /**
     * Request microphone permission.
     * MUST be called from a user gesture handler (click/tap) on iOS.
     * iOS silently blocks getUserMedia calls that don't originate from user interaction.
     */
    const requestPermission = useCallback(async () => {
        try {
            const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            // Stop immediately — we only needed the permission prompt
            tempStream.getTracks().forEach(track => track.stop());
            setPermissionGranted(true);
            setPermissionDenied(false);

            // Now enumerate with labels
            await enumerateAudioDevices();
        } catch (err) {
            console.warn('Microphone permission not granted:', err);
            setPermissionDenied(true);
            setPermissionGranted(false);
        }
    }, [enumerateAudioDevices]);

    // On mount, try to enumerate devices (may get devices without labels if no prior permission)
    // Also check if permission was already granted in a previous session
    useEffect(() => {
        const init = async () => {
            const inputs = await enumerateAudioDevices();

            // If we got devices with labels, permission was already granted
            if (inputs.length > 0 && inputs.some(d => d.label)) {
                setPermissionGranted(true);
            }
        };

        init();
        navigator.mediaDevices.addEventListener('devicechange', enumerateAudioDevices);

        return () => {
            navigator.mediaDevices.removeEventListener('devicechange', enumerateAudioDevices);
        };
    }, [enumerateAudioDevices]);

    return { devices, permissionGranted, permissionDenied, requestPermission };
}
