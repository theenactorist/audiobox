
import { useState, useEffect, useRef } from 'react';
import { CopyButton } from '@mantine/core';
import { IconAlertCircle, IconCheck, IconCopy, IconShare, IconVolume, IconVolumeOff } from '@tabler/icons-react';

import Hls from 'hls.js';
import io, { Socket } from 'socket.io-client';
import { getServerUrl } from '@/lib/serverUrl';

interface WakeLockSentinel {
    release: () => Promise<void>;
}

interface LastPublicBroadcast {
    title: string;
    startTime: string; // ISO string
}

export default function ListenerPage() {
    const [activeStream, setActiveStream] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [volume, setVolume] = useState(70);
    const [muted, setMuted] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [showInstallBanner, setShowInstallBanner] = useState(false);
    const [lastPublicBroadcast, setLastPublicBroadcast] = useState<LastPublicBroadcast | null>(null);
    const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
    const wakeLockRef = useRef<WakeLockSentinel | null>(null);

    const audioRef = useRef<HTMLAudioElement>(null);
    const hlsRef = useRef<Hls | null>(null);
    const socketRef = useRef<Socket | null>(null);
    const joinedStreamRef = useRef<string | null>(null); // Track which stream we've joined

    const currentUrl = typeof window !== 'undefined' ? window.location.href : '';

    // Poll for active streams AND listen for socket events
    useEffect(() => {
        const baseUrl = getServerUrl();

        // Initialize socket for real-time updates
        const socket = io(baseUrl);
        socketRef.current = socket;

        socket.on('connect', () => {
            console.log('Listener connected to signaling server');
            // Re-join stream if we were in one before reconnect
            if (joinedStreamRef.current) {
                socket.emit('join-stream', joinedStreamRef.current);
            }
        });

        socket.on('stream-ended', () => {
            console.log('Stream ended event received');
            joinedStreamRef.current = null; // Clear joined stream
            setActiveStream(null);
            setIsPlaying(false);
        });

        socket.on('metadata-updated', (data: any) => {
            console.log('Metadata updated:', data);
            setActiveStream((prev: any) => prev ? { ...prev, ...data } : null);
        });

        const checkActiveStreams = async () => {
            try {
                const response = await fetch(`${baseUrl}/api/active-streams`);

                if (response.ok) {
                    const streams = await response.json();
                    if (streams.length > 0) {
                        const stream = streams[0];

                        // Only update activeStream if it's a different stream to prevent HLS reload
                        setActiveStream((prev: any) => {
                            if (prev && prev.streamId === stream.streamId) {
                                return prev; // Return same object reference to skip effects
                            }
                            return stream;
                        });

                        // Only join if we haven't joined this stream yet
                        if (joinedStreamRef.current !== stream.streamId) {
                            // Leave previous stream if we were in a different one
                            if (joinedStreamRef.current) {
                                socket.emit('leave-stream', joinedStreamRef.current);
                            }
                            socket.emit('join-stream', stream.streamId);
                            joinedStreamRef.current = stream.streamId;
                            console.log(`Joined stream: ${stream.streamId}`);
                        }
                    } else {
                        // No active streams, leave if we were in one
                        if (joinedStreamRef.current) {
                            socket.emit('leave-stream', joinedStreamRef.current);
                            joinedStreamRef.current = null;
                        }
                        setActiveStream(null);

                        // Fetch last public broadcast for offline state
                        fetch(`${baseUrl}/api/latest-public-broadcast`)
                            .then(res => res.json())
                            .then(data => {
                                if (data.hasBroadcast) {
                                    setLastPublicBroadcast({
                                        title: data.title,
                                        startTime: data.startTime
                                    });
                                }
                            })
                            .catch(err => console.error('Failed to fetch last public broadcast:', err));
                    }
                } else {
                    setActiveStream(null);
                }
            } catch (err) {
                console.error('Failed to check active streams:', err);
                setActiveStream(null);
            } finally {
                setLoading(false);
            }
        };

        checkActiveStreams();
        const interval = setInterval(checkActiveStreams, 5000);

        return () => {
            clearInterval(interval);
            // Leave stream when component unmounts
            if (joinedStreamRef.current) {
                socket.emit('leave-stream', joinedStreamRef.current);
            }
            socket.disconnect();
        };
    }, []);

    // Detect install banner
    useEffect(() => {
        const isAndroid = /android/i.test(navigator.userAgent);
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
        const wasDismissed = localStorage.getItem('installBannerDismissed');

        if (isAndroid && !isStandalone && !wasDismissed) {
            setShowInstallBanner(true);
        }
    }, []);

    // Setup Audio Context for Visualizer
    useEffect(() => {
        if (isPlaying && audioRef.current && !analyser) {
            try {
                if (!audioContextRef.current) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
                    audioContextRef.current = new AudioContextClass();
                }

                const ctx = audioContextRef.current;

                // Resume context if suspended (browser policy)
                if (ctx.state === 'suspended') {
                    ctx.resume();
                }

                if (!sourceRef.current) {
                    const source = ctx.createMediaElementSource(audioRef.current);
                    const newAnalyser = ctx.createAnalyser();
                    newAnalyser.fftSize = 256;

                    source.connect(newAnalyser);
                    newAnalyser.connect(ctx.destination);

                    sourceRef.current = source;
                    setAnalyser(newAnalyser);
                }
            } catch (err) {
                console.warn('Audio visualization setup failed (likely CORS):', err);
            }
        }
    }, [isPlaying]);

    // Setup HLS player
    useEffect(() => {
        if (!activeStream || !audioRef.current) {
            if (hlsRef.current) {
                hlsRef.current.destroy();
                hlsRef.current = null;
            }
            return;
        }

        const baseUrl = getServerUrl();
        const hlsUrl = `${baseUrl}${activeStream.hlsUrl}`;

        console.log('Loading HLS stream:', hlsUrl);

        if (Hls.isSupported()) {
            const hls = new Hls({
                debug: false,
                enableWorker: true,
                lowLatencyMode: false, // Turn off strict low latency to prevent stalling
                backBufferLength: 90,
                maxBufferLength: 60, // Increase buffer tolerance
                liveSyncDurationCount: 4, // Wait for at least 4 segments (16s) to sync, prevents starvation
                liveMaxLatencyDurationCount: 15,
                manifestLoadingTimeOut: 10000,
                manifestLoadingMaxRetry: 10,
                levelLoadingTimeOut: 10000,
                levelLoadingMaxRetry: 10,
                fragLoadingTimeOut: 10000,
                fragLoadingMaxRetry: 10,
            });

            hls.loadSource(hlsUrl);
            hls.attachMedia(audioRef.current);

            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                console.log('Manifest parsed, ready to play');
                // Removed autoplay to require user interaction
                // audioRef.current?.play().catch(e => console.log('Autoplay prevented:', e));
            });

            hls.on(Hls.Events.ERROR, (data) => {
                if ((data as any).fatal) {
                    switch ((data as any).type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            console.log('Network error, trying to recover...');
                            hls.startLoad();
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            console.log('Media error, trying to recover...');
                            hls.recoverMediaError();
                            break;
                        default:
                            console.error('Fatal HLS error, destroying:', data);
                            hls.destroy();
                            break;
                    }
                }
            });

            hlsRef.current = hls;
        } else if (audioRef.current.canPlayType('application/vnd.apple.mpegurl')) {
            // Native HLS support (Safari/iOS)
            audioRef.current.src = hlsUrl;
        }

        return () => {
            if (hlsRef.current) {
                hlsRef.current.destroy();
                hlsRef.current = null;
            }
        };
    }, [activeStream]);

    // Media Session API
    useEffect(() => {
        if ('mediaSession' in navigator && isPlaying && activeStream) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: activeStream.title || 'AudioBox Stream',
                artist: 'AudioBox Stream',
                album: 'Live Broadcast',
                artwork: [
                    { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
                    { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
                ]
            });

            navigator.mediaSession.setActionHandler('play', () => {
                handlePlay();
            });

            navigator.mediaSession.setActionHandler('pause', () => {
                audioRef.current?.pause();
                setIsPlaying(false);
            });

            navigator.mediaSession.setActionHandler('stop', () => {
                audioRef.current?.pause();
                setIsPlaying(false);
            });
        }
    }, [isPlaying, activeStream]);

    // Wake lock
    useEffect(() => {
        const requestWakeLock = async () => {
            try {
                if ('wakeLock' in navigator && isPlaying) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
                    console.log('Wake lock activated');
                }
            } catch (err) {
                console.log('Wake lock error:', err);
            }
        };

        if (isPlaying) {
            requestWakeLock();
        }

        return () => {
            if (wakeLockRef.current) {
                wakeLockRef.current.release();
                wakeLockRef.current = null;
            }
        };
    }, [isPlaying]);

    // Volume control
    useEffect(() => {
        if (audioRef.current) {
            // Map 0-100 UI value to 0-0.20 actual volume (so 20% is the new 100%)
            audioRef.current.volume = muted ? 0 : (volume / 100) * 0.20;
        }
    }, [volume, muted]);

    const handlePlay = async () => {
        if (audioRef.current) {
            try {
                await audioRef.current.play();
                setIsPlaying(true);
            } catch (e) {
                console.error("Play failed", e);
            }
        }
    };

    const handleShare = async () => {
        if (navigator.share) {
            try {
                await navigator.share({
                    title: activeStream?.title || 'AudioBox Stream',
                    text: activeStream?.description || 'Listen to this live AudioBox stream',
                    url: currentUrl,
                });
            } catch (err) {
                console.log('Share failed:', err);
            }
        }
    };

    const dismissInstallBanner = () => {
        setShowInstallBanner(false);
        localStorage.setItem('installBannerDismissed', 'true');
    };

    // Visualizer configuration
    const COLORS = {
        bg: "#111714",
        surface: "#1a2320",
        border: "#2a3632",
        borderLight: "#344440",
        text: "#e8ede9",
        textSecondary: "#8a9e94",
        textMuted: "#5a6e64",
        green: "#34d399",
        greenDim: "#1a6b4d",
        greenBg: "rgba(52, 211, 153, 0.08)",
        greenBorder: "rgba(52, 211, 153, 0.2)",
        red: "#f87171",
        redBg: "rgba(248, 113, 113, 0.1)",
        redBorder: "rgba(248, 113, 113, 0.25)",
    };

    const linkFont = "https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&family=JetBrains+Mono:wght@400;500&display=swap";

    // Show loading state
    if (loading) {
        return (
            <>
                <link href={linkFont} rel="stylesheet" />
                <div style={{ minHeight: "100vh", background: COLORS.bg, color: COLORS.text, fontFamily: "'DM Sans', sans-serif", display: "flex", flexDirection: "column" }}>
                    <header style={{ padding: "20px 32px", borderBottom: `1px solid ${COLORS.border}` }}>
                        <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em" }}>AudioBox</span>
                    </header>
                    <main style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <div style={{ width: 40, height: 40, border: `3px solid ${COLORS.greenDim}`, borderTopColor: COLORS.green, borderRadius: "50%", animation: "spin 1s linear infinite" }} />
                        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
                    </main>
                </div>
            </>
        );
    }

    // Show offline state when no active stream
    if (!activeStream) {
        return (
            <>
                <link href={linkFont} rel="stylesheet" />
                <div style={{ minHeight: "100vh", background: COLORS.bg, color: COLORS.text, fontFamily: "'DM Sans', sans-serif", display: "flex", flexDirection: "column" }}>
                    <header style={{ padding: "20px 32px", borderBottom: `1px solid ${COLORS.border}` }}>
                        <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em" }}>AudioBox</span>
                    </header>
                    <main style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 24px" }}>
                        <div style={{ maxWidth: 520, width: "100%" }}>
                            {/* Offline badge */}
                            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
                                <div style={{
                                    display: "flex", alignItems: "center", gap: 8,
                                    padding: "5px 14px", background: "rgba(90,110,100,0.12)",
                                    border: `1px solid ${COLORS.border}`, borderRadius: 20,
                                }}>
                                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: COLORS.textMuted }} />
                                    <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Offline</span>
                                </div>
                            </div>

                            {/* Offline card */}
                            <div style={{
                                background: COLORS.surface, borderRadius: 20,
                                border: `1px solid ${COLORS.border}`, padding: "48px 32px",
                                textAlign: "center",
                            }}>
                                {/* Icon */}
                                <div style={{
                                    width: 72, height: 72, borderRadius: "50%",
                                    background: COLORS.bg, border: `1px solid ${COLORS.border}`,
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    margin: "0 auto 24px",
                                }}>
                                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={COLORS.textMuted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3" />
                                    </svg>
                                </div>

                                <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 10px", letterSpacing: "-0.01em" }}>
                                    No active broadcast
                                </h1>
                                <p style={{ fontSize: 15, color: COLORS.textSecondary, margin: "0 0 32px", lineHeight: 1.6 }}>
                                    There's nothing streaming right now. Please check back later.
                                </p>

                                {/* Last broadcast info */}
                                {lastPublicBroadcast && (
                                    <div style={{
                                        background: COLORS.bg, borderRadius: 12, padding: 18,
                                        border: `1px solid ${COLORS.border}`, textAlign: "left",
                                        marginBottom: 28,
                                    }}>
                                        <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
                                            Last public broadcast
                                        </div>
                                        <div style={{ fontSize: 14, fontWeight: 500, color: COLORS.text, lineHeight: 1.4, marginBottom: 6 }}>
                                            {lastPublicBroadcast.title}
                                        </div>
                                        <div style={{ fontSize: 13, color: COLORS.textMuted, marginBottom: 14 }}>
                                            {new Date(lastPublicBroadcast.startTime).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                                        </div>
                                        <a
                                            href="https://open.spotify.com/show/2Gv6dKj6o7zhOFrRosR4VH?si=3bfb72f34a214292"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{
                                                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                                                padding: "10px 16px", borderRadius: 8,
                                                background: "#1DB954", color: "#000", textDecoration: "none",
                                                fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
                                            }}
                                        >
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                                            </svg>
                                            Listen again on Spotify
                                        </a>
                                    </div>
                                )}
                            </div>
                        </div>
                    </main>
                </div>
            </>
        );
    }

    // Real Web Audio API visualizer using the 32 bars from the mock
    const MiniVisualizer = ({ active, muted, analyser }: { active: boolean, muted: boolean, analyser: AnalyserNode | null }) => {
        const [bars, setBars] = useState<number[]>(Array(32).fill(0));
        const animationRef = useRef<number>();

        useEffect(() => {
            if (!active || !analyser) {
                setBars(Array(32).fill(0));
                if (animationRef.current) cancelAnimationFrame(animationRef.current);
                return;
            }

            const dataArray = new Uint8Array(analyser.frequencyBinCount);

            const update = () => {
                analyser.getByteFrequencyData(dataArray);

                const newBars = [];

                // Logarithmic frequency mapping focusing on the lower 60% of bins (vocal range)
                const usefulBins = Math.floor(analyser.frequencyBinCount * 0.6);

                for (let i = 0; i < 32; i++) {
                    // Stretches low frequencies across more bars, compresses highs
                    const startRatio = Math.pow(i / 32, 2);
                    const endRatio = Math.pow((i + 1) / 32, 2);

                    const startIndex = Math.floor(startRatio * usefulBins);
                    let endIndex = Math.floor(endRatio * usefulBins);
                    if (endIndex <= startIndex) endIndex = startIndex + 1;

                    let sum = 0;
                    for (let j = startIndex; j < endIndex; j++) {
                        sum += dataArray[j] || 0;
                    }
                    const count = endIndex - startIndex;
                    const avg = sum / count;

                    // Apply slight exponential curve for more "snap"
                    const normalizedVal = avg / 255;
                    const kineticVal = Math.pow(normalizedVal, 1.2);

                    // Scale 12-100% with extra amplification to push peak heights
                    let percent = 12 + (kineticVal * 90);
                    percent = Math.max(12, Math.min(100, percent));

                    newBars.push(percent);
                }

                setBars(newBars);
                animationRef.current = requestAnimationFrame(update);
            };

            update();
            return () => {
                if (animationRef.current) cancelAnimationFrame(animationRef.current);
            };
        }, [active, analyser]);

        return (
            <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 48 }}>
                {bars.map((h, i) => (
                    <div
                        key={i}
                        style={{
                            flex: 1,
                            height: `${active ? h : 12}%`,
                            background: active
                                ? `linear-gradient(to top, ${COLORS.green}, ${COLORS.greenDim})`
                                : COLORS.border,
                            borderRadius: 1.5,
                            transition: "height 0.05s ease",
                            opacity: active ? (muted ? 0.25 : 0.8) : 0.3,
                        }}
                    />
                ))}
            </div>
        );
    };

    // Formatted timer calculation
    const ListenTimer = ({ startTimeStr }: { startTimeStr: string | undefined }) => {
        const [elapsed, setElapsed] = useState(0);

        useEffect(() => {
            if (!startTimeStr) return;
            const start = new Date(startTimeStr).getTime();

            const interval = setInterval(() => {
                setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
            }, 1000);

            // Initial call
            setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));

            return () => clearInterval(interval);
        }, [startTimeStr]);

        const mins = String(Math.floor(elapsed / 60)).padStart(2, "0");
        const secs = String(elapsed % 60).padStart(2, "0");
        return <span style={{ fontVariantNumeric: "tabular-nums" }}>{mins}:{secs}</span>;
    };


    const handleShareMock = async () => {
        if ('share' in navigator) {
            handleShare();
        } else {
            // Fallback for desktop browsers that don't support native share
            try {
                await (navigator as any).clipboard.writeText(currentUrl);
                alert("Link copied to clipboard!");
            } catch (err) {
                console.error("Failed to copy link", err);
            }
        }
    };


    // Main Listen UI
    return (
        <>
            <link href={linkFont} rel="stylesheet" />
            <style>{`
                @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
                input[type="range"] { -webkit-appearance: none; appearance: none; height: 4px; border-radius: 2px; outline: none; cursor: pointer; }
                input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 14px; height: 14px; border-radius: 50%; background: ${COLORS.text}; border: 2px solid ${COLORS.surface}; cursor: pointer; box-shadow: 0 1px 4px rgba(0,0,0,0.3); }
                input[type="range"]::-moz-range-thumb { width: 14px; height: 14px; border-radius: 50%; background: ${COLORS.text}; border: 2px solid ${COLORS.surface}; cursor: pointer; box-shadow: 0 1px 4px rgba(0,0,0,0.3); }
            `}</style>

            <audio ref={audioRef} playsInline style={{ display: 'none' }} />

            <div style={{
                minHeight: "100vh",
                background: COLORS.bg,
                color: COLORS.text,
                fontFamily: "'DM Sans', sans-serif",
                display: "flex",
                flexDirection: "column",
            }}>

                {/* Header */}
                <header style={{ padding: "20px 32px", borderBottom: `1px solid ${COLORS.border}` }}>
                    <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em" }}>AudioBox</span>
                </header>

                {showInstallBanner && (
                    <div style={{ background: COLORS.surface, borderBottom: `1px solid ${COLORS.border}`, padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <IconAlertCircle size={20} color={COLORS.green} />
                            <span style={{ fontSize: 14, color: COLORS.textSecondary }}>Install this app for background audio playback when your screen is off.</span>
                        </div>
                        <button onClick={dismissInstallBanner} style={{ background: "transparent", border: "none", color: COLORS.textMuted, cursor: "pointer", fontSize: 18 }}>&times;</button>
                    </div>
                )}

                {/* Main */}
                <main style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 24px" }}>
                    <div style={{ maxWidth: 520, width: "100%" }}>

                        {/* Live indicator + listener count */}
                        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
                            <div style={{
                                display: "flex", alignItems: "center", gap: 8, padding: "5px 14px",
                                background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 20,
                            }}>
                                <div style={{ width: 8, height: 8, borderRadius: "50%", background: COLORS.red, animation: "pulse 1.5s ease-in-out infinite" }} />
                                <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.red, textTransform: "uppercase", letterSpacing: "0.08em" }}>Live now</span>
                            </div>
                        </div>

                        {/* Stream card */}
                        <div style={{
                            background: COLORS.surface, borderRadius: 20,
                            border: `1px solid ${isPlaying ? COLORS.greenBorder : COLORS.border}`,
                            padding: 32, transition: "border-color 0.3s ease",
                        }}>
                            <h1 style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.35, margin: "0 0 12px", letterSpacing: "-0.01em" }}>{activeStream.title || 'Live Broadcast'}</h1>

                            <div style={{ marginBottom: 28 }}>
                                <p style={{
                                    fontSize: 14, lineHeight: 1.65, color: COLORS.textSecondary, margin: 0,
                                    display: "-webkit-box", WebkitLineClamp: showInstallBanner ? "unset" : 2, // reusing this state for simplicity of porting
                                    WebkitBoxOrient: "vertical", overflow: showInstallBanner ? "visible" : "hidden",
                                }}>
                                    {activeStream.description || 'Welcome to the live stream.'}
                                </p>
                                <button
                                    onClick={() => setShowInstallBanner(!showInstallBanner)}
                                    style={{ background: "none", border: "none", color: COLORS.green, fontSize: 13, fontWeight: 500, cursor: "pointer", padding: "4px 0 0", fontFamily: "'DM Sans', sans-serif" }}
                                >
                                    {showInstallBanner ? "Show less" : "Read more"}
                                </button>
                            </div>

                            {isPlaying && (
                                <div style={{ marginBottom: 24 }}>
                                    {/* Visualizer */}
                                    <div style={{ background: COLORS.bg, borderRadius: 12, padding: "12px 16px", border: `1px solid ${COLORS.border}` }}>
                                        <MiniVisualizer active={isPlaying} muted={muted} analyser={analyser} />
                                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
                                            <span style={{ fontSize: 12, color: muted ? COLORS.textMuted : COLORS.green, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
                                                <div style={{
                                                    width: 6, height: 6, borderRadius: "50%",
                                                    background: muted ? COLORS.textMuted : COLORS.green,
                                                    boxShadow: muted ? "none" : `0 0 6px ${COLORS.green}`,
                                                }} />
                                                {muted ? "Muted" : "Listening"}
                                            </span>
                                            <span style={{ fontSize: 12, color: COLORS.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>
                                                <ListenTimer startTimeStr={activeStream.startTime} />
                                            </span>
                                        </div>
                                    </div>

                                    {/* Volume control */}
                                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, padding: "10px 14px", background: COLORS.bg, borderRadius: 10, border: `1px solid ${COLORS.border}` }}>
                                        <button
                                            onClick={() => setMuted(!muted)}
                                            style={{
                                                width: 32, height: 32, borderRadius: 8,
                                                border: `1px solid ${muted ? COLORS.redBorder : COLORS.border}`,
                                                background: muted ? COLORS.redBg : "transparent",
                                                color: muted ? COLORS.red : COLORS.textSecondary,
                                                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                                                flexShrink: 0, transition: "all 0.15s ease",
                                            }}
                                        >
                                            {muted ? <IconVolumeOff size={16} /> : <IconVolume size={16} />}
                                        </button>

                                        <input
                                            type="range"
                                            min="0"
                                            max="100"
                                            value={muted ? 0 : volume}
                                            onChange={(e) => {
                                                const val = Number(e.target.value);
                                                setVolume(val);
                                                if (val > 0 && muted) setMuted(false);
                                                if (val === 0) setMuted(true);
                                            }}
                                            style={{ flex: 1, background: `linear-gradient(to right, ${muted ? COLORS.textMuted : COLORS.green} ${muted ? 0 : volume}%, ${COLORS.border} ${muted ? 0 : volume}%)` }}
                                        />

                                        <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace", color: muted ? COLORS.red : COLORS.textSecondary, fontWeight: 500, minWidth: 38, textAlign: "right", flexShrink: 0 }}>
                                            {muted ? "0%" : `${volume}%`}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {!isPlaying ? (
                                <button
                                    onClick={handlePlay}
                                    style={{
                                        width: "100%", padding: "18px", borderRadius: 14, border: "none",
                                        background: `linear-gradient(135deg, ${COLORS.green}, #2bb37e)`,
                                        color: "#0a1a12", fontSize: 16, fontWeight: 700, cursor: "pointer",
                                        fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                                    }}
                                >
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                                    Start listening
                                </button>
                            ) : (
                                <button
                                    onClick={() => {
                                        setIsPlaying(false);
                                        audioRef.current?.pause();
                                    }}
                                    style={{
                                        width: "100%", padding: "18px", borderRadius: 14, border: `1px solid ${COLORS.border}`,
                                        background: COLORS.bg, color: COLORS.text, fontSize: 16, fontWeight: 600, cursor: "pointer",
                                        fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                                    }}
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                    Disconnect
                                </button>
                            )}

                            {/* Share actions */}
                            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                                <CopyButton value={currentUrl} timeout={2000}>
                                    {({ copied, copy }) => (
                                        <button
                                            onClick={copy}
                                            style={{
                                                flex: 1, padding: "12px", borderRadius: 10, border: `1px solid ${COLORS.border}`, background: "transparent",
                                                color: copied ? COLORS.green : COLORS.textSecondary, fontSize: 13, fontWeight: 500, cursor: "pointer",
                                                fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, transition: "color 0.2s ease",
                                            }}
                                        >
                                            {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                                            {copied ? 'Copied' : 'Copy link'}
                                        </button>
                                    )}
                                </CopyButton>
                                <button
                                    onClick={handleShareMock}
                                    style={{
                                        flex: 1, padding: "12px", borderRadius: 10, border: `1px solid ${COLORS.border}`, background: "transparent",
                                        color: COLORS.textSecondary, fontSize: 13, fontWeight: 500, cursor: "pointer",
                                        fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                                    }}
                                >
                                    <IconShare size={14} />
                                    Share
                                </button>
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </>
    );
}
