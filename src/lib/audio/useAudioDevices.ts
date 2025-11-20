import { useState, useEffect } from 'react';

export function useAudioDevices() {
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

    useEffect(() => {
        const getDevices = async () => {
            try {
                // Request permission first to get labels (optional, but good practice if not already granted)
                // However, we usually assume permission is requested by getUserMedia elsewhere.
                // If we call this before getUserMedia, labels might be empty.
                const allDevices = await navigator.mediaDevices.enumerateDevices();
                const audioInputs = allDevices.filter(device => device.kind === 'audioinput');
                setDevices(audioInputs);
            } catch (err) {
                console.error('Error enumerating devices:', err);
            }
        };

        getDevices();
        navigator.mediaDevices.addEventListener('devicechange', getDevices);

        return () => {
            navigator.mediaDevices.removeEventListener('devicechange', getDevices);
        };
    }, []);

    return devices;
}
