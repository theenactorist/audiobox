import { useState, useEffect } from 'react';

export function useAudioDevices() {
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

    useEffect(() => {
        const getDevices = async () => {
            try {
                // Request permission first to get device labels
                // Without this, device labels will be empty strings
                await navigator.mediaDevices.getUserMedia({ audio: true })
                    .then(stream => {
                        // Stop the stream immediately, we just needed permission
                        stream.getTracks().forEach(track => track.stop());
                    })
                    .catch(err => {
                        console.warn('Microphone permission denied:', err);
                    });

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
