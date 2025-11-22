export class AudioController {
    private audioContext: AudioContext | null = null;
    private gainNode: GainNode | null = null;
    private sourceNode: MediaStreamAudioSourceNode | null = null;
    private analyserNode: AnalyserNode | null = null;
    private stream: MediaStream | null = null;
    private audioElement: HTMLAudioElement | null = null;

    constructor() {
        // Initialize on user interaction if possible, or lazily
    }

    public async initialize(stream: MediaStream, audioElement?: HTMLAudioElement, isAndroid: boolean = false) {
        if (this.audioContext?.state === 'running' && this.stream === stream) {
            return;
        }

        this.cleanup();
        this.stream = stream;
        this.audioElement = audioElement || null;

        // Create AudioContext
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        this.audioContext = new AudioContextClass();

        // Create GainNode for volume control (iOS fix)
        this.gainNode = this.audioContext.createGain();
        this.gainNode.gain.value = 1.0; // Default volume

        // Create AnalyserNode for visualizer
        this.analyserNode = this.audioContext.createAnalyser();
        this.analyserNode.fftSize = 256;

        // Create SourceNode
        this.sourceNode = this.audioContext.createMediaStreamSource(stream);

        // Connect graph
        this.sourceNode.connect(this.gainNode);
        this.gainNode.connect(this.analyserNode);

        // ANDROID FIX: Do NOT connect to destination on Android.
        // We will rely on the UNMUTED <audio> element for playback.
        // Connecting to destination would cause an echo.
        if (!isAndroid) {
            this.analyserNode.connect(this.audioContext.destination);
        }

        // If an audio element is provided, we can also mute it to prevent double audio
        // BUT for Android background audio, we might actually WANT the audio element to play
        // and NOT connect to destination? 
        // Actually, the plan is: Source -> AudioContext -> Destination.
        // The audio element is just a container for the stream to keep it alive?
        // Standard practice for WebRTC background audio:
        // 1. Attach stream to <audio autoplay>
        // 2. Ensure AudioContext is running (for visualizer/volume)
        // If we connect to destination AND play in <audio>, we get echo.
        // So we should MUTE the <audio> element but keep it playing?
        // Or just use AudioContext for playback?
        // Using AudioContext for playback is better for volume control (GainNode).

        if (this.audioElement) {
            this.audioElement.srcObject = stream;
            this.audioElement.play().catch(e => console.error('Audio element play failed', e));

            // ANDROID FIX: Unmute on Android to keep background service alive.
            // iOS/Desktop: Mute and use Web Audio API.
            this.audioElement.muted = !isAndroid;
        }

        // Resume context if suspended (browser policy)
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
    }

    public setVolume(value: number) {
        if (this.gainNode) {
            // value is 0-100, gain is 0-1
            this.gainNode.gain.value = Math.max(0, Math.min(1, value / 100));
        }
    }

    public getAnalyser(): AnalyserNode | null {
        return this.analyserNode;
    }

    public async resume() {
        if (this.audioContext?.state === 'suspended') {
            await this.audioContext.resume();
        }
    }

    public cleanup() {
        if (this.sourceNode) {
            this.sourceNode.disconnect();
            this.sourceNode = null;
        }
        if (this.gainNode) {
            this.gainNode.disconnect();
            this.gainNode = null;
        }
        if (this.analyserNode) {
            this.analyserNode.disconnect();
            this.analyserNode = null;
        }
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
        if (this.audioElement) {
            this.audioElement.srcObject = null;
            this.audioElement = null;
        }
        this.stream = null;
    }
}
