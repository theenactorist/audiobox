import { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
    stream: MediaStream | null;
    isPlaying?: boolean;
    width?: number;
    height?: number;
}

export function AudioVisualizer({ stream, isPlaying = false, width = 600, height = 200 }: AudioVisualizerProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationRef = useRef<number | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

    // Resume AudioContext when playing state changes
    useEffect(() => {
        if (isPlaying && audioContextRef.current?.state === 'suspended') {
            audioContextRef.current.resume().then(() => {
                console.log('AudioContext resumed');
            }).catch(err => console.error('Failed to resume AudioContext:', err));
        }
    }, [isPlaying]);

    useEffect(() => {
        if (!stream || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Initialize Audio Context
        if (!audioContextRef.current) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            audioContextRef.current = audioContext;
        }

        const audioContext = audioContextRef.current;

        // Create analyser if not exists
        if (!analyserRef.current) {
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            analyserRef.current = analyser;
        }
        const analyser = analyserRef.current!;

        // Connect stream
        try {
            if (sourceRef.current) {
                sourceRef.current.disconnect();
            }
            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);
            sourceRef.current = source;
        } catch (err) {
            console.error('Error connecting stream to analyser:', err);
            return;
        }

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const draw = () => {
            animationRef.current = requestAnimationFrame(draw);

            analyser.getByteFrequencyData(dataArray);

            // Clear canvas
            ctx.fillStyle = '#1A1B1E'; // Dark background
            ctx.fillRect(0, 0, width, height);

            const barWidth = (width / bufferLength) * 2.5;
            let barHeight;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
                barHeight = dataArray[i] / 255 * height; // Scale to canvas height

                // Create gradient
                const gradient = ctx.createLinearGradient(0, height, 0, height - barHeight);
                gradient.addColorStop(0, '#0FA76A'); // Primary Green
                gradient.addColorStop(1, '#40C057'); // Lighter Green

                ctx.fillStyle = gradient;

                // Draw rounded bars
                ctx.beginPath();
                ctx.roundRect(x, height - barHeight, barWidth, barHeight, 4);
                ctx.fill();

                x += barWidth + 1;
            }
        };

        draw();

        return () => {
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
            // Don't close context on unmount to avoid recreation issues, just suspend or disconnect
            // But for now, let's keep it simple. If we close it, we need to recreate it.
            // The previous code closed it. Let's stick to that but be careful.
            if (sourceRef.current) {
                sourceRef.current.disconnect();
            }
        };
    }, [stream, width, height]);

    return <canvas ref={canvasRef} width={width} height={height} style={{ borderRadius: '12px', width: '100%', height: 'auto', maxWidth: width, boxShadow: 'inset 0 0 20px rgba(0,0,0,0.5)' }} />;
}
