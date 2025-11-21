import { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
    stream: MediaStream | null;
    width?: number;
    height?: number;
}

export function AudioVisualizer({ stream, width = 600, height = 200 }: AudioVisualizerProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationRef = useRef<number | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

    useEffect(() => {
        if (!stream || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Initialize Audio Context
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioContextRef.current = audioContext;

        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256; // Smaller FFT size for wider bars
        analyserRef.current = analyser;

        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        sourceRef.current = source;

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
            if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
                audioContextRef.current.close();
            }
        };
    }, [stream, width, height]);

    return <canvas ref={canvasRef} width={width} height={height} style={{ borderRadius: '12px', width: '100%', height: 'auto', maxWidth: width, boxShadow: 'inset 0 0 20px rgba(0,0,0,0.5)' }} />;
}
