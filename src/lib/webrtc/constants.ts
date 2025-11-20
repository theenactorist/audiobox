export const RTC_CONFIG: RTCConfiguration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
    ],
};

export const AUDIO_CONFIG = {
    sampleRate: 48000,
    channelCount: 2,
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
} as const;
