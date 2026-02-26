import { useState, useEffect, useCallback } from 'react';

export function useAudioDevices() {
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

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

    useEffect(() => {
        const init = async () => {
            // First attempt: enumerate without permission (may get empty labels)
            let inputs = await enumerateAudioDevices();

            // If we got devices but all labels are empty, we need to request permission first
            // On iOS Chrome, getUserMedia triggers the browser permission dialog
            const hasEmptyLabels = inputs.length > 0 && inputs.every(d => !d.label);
            if (inputs.length === 0 || hasEmptyLabels) {
                try {
                    const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    // Stop immediately — we only needed the permission prompt
                    tempStream.getTracks().forEach(track => track.stop());

                    // Re-enumerate now that we have permission — labels should be populated
                    await enumerateAudioDevices();
                } catch (err) {
                    // Permission denied or not available
                    console.warn('Microphone permission not granted:', err);
                }
            }
        };

        init();
        navigator.mediaDevices.addEventListener('devicechange', enumerateAudioDevices);

        return () => {
            navigator.mediaDevices.removeEventListener('devicechange', enumerateAudioDevices);
        };
    }, [enumerateAudioDevices]);

    return devices;
}
