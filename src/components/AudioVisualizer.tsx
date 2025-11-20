import { useEffect, useRef, memo } from 'react';

interface AudioVisualizerProps {
    stream: MediaStream | null;
    width?: number;
    height?: number;
}

function AudioVisualizerComponent({ stream, width = 600, height = 150 }: AudioVisualizerProps) {
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
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioContextRef.current = audioContext;

        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        analyserRef.current = analyser;

        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        sourceRef.current = source;

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const draw = () => {
            animationRef.current = requestAnimationFrame(draw);

            analyser.getByteTimeDomainData(dataArray);

            // Clear canvas
            ctx.fillStyle = '#1A1B1E'; // Dark background (Mantine dark[7])
            ctx.fillRect(0, 0, width, height);

            ctx.lineWidth = 2;
            ctx.strokeStyle = '#339AF0'; // Mantine Blue 5
            ctx.beginPath();

            const sliceWidth = width * 1.0 / bufferLength;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
                const v = dataArray[i] / 128.0;
                const y = v * height / 2;

                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }

                x += sliceWidth;
            }

            ctx.lineTo(canvas.width, canvas.height / 2);
            ctx.stroke();
        };

        draw();

        return () => {
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
            if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
                audioContextRef.current.close();
            }
        };
    }, [stream, width, height]);

    return <canvas ref={canvasRef} width={width} height={height} style={{ borderRadius: '8px', width: '100%', height: 'auto', maxWidth: width }} />;
}

export const AudioVisualizer = memo(AudioVisualizerComponent);
