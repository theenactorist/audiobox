

import { useState, useEffect, useRef, useCallback } from 'react';
import { IconCheck, IconMicrophone, IconUsers, IconWifi, IconWifiOff } from '@tabler/icons-react';
import { useAudioStream } from '@/lib/audio/useAudioStream';
import { useAudioDevices } from '@/lib/audio/useAudioDevices';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';
import io, { Socket } from 'socket.io-client';
import { notifications } from '@mantine/notifications';
import { getServerUrl } from '@/lib/serverUrl';

// Styled Constants from audiobox-dashboard.jsx
const COLORS = {
    bg: "#111714",
    surface: "#1a2320",
    surfaceHover: "#1f2b27",
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
    amber: "#fbbf24",
    yellow: "#facc15",
};

const linkFont = "https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&family=JetBrains+Mono:wght@400;500&display=swap";

// Real Web Audio API visualizer using the 48 bars from the studio mock
const StudioVisualizer = ({ active, analyser }: { active: boolean, analyser: AnalyserNode | null }) => {
    const [bars, setBars] = useState<number[]>(Array(48).fill(0));
    const animationRef = useRef<number>();

    useEffect(() => {
        if (!active || !analyser) {
            setBars(Array(48).fill(0));
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
            return;
        }

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const update = () => {
            analyser.getByteFrequencyData(dataArray);

            const newBars = [];

            // We only care about the lower half of frequencies (approx 0-11kHz) for human voice/music
            // Use a logarithmic/exponential curve to map bins to bars, giving more detail to lower/mid frequencies
            const usefulBins = Math.floor(analyser.frequencyBinCount * 0.6);

            for (let i = 0; i < 48; i++) {
                // Logarithmic index mapping: i^2 / 48^2 * usefulBins
                // This stretches out the lower bins (bass/vocals) across more bars, 
                // and compresses the high frequency bins into fewer bars.
                const startRatio = Math.pow(i / 48, 2);
                const endRatio = Math.pow((i + 1) / 48, 2);

                const startIndex = Math.floor(startRatio * usefulBins);
                let endIndex = Math.floor(endRatio * usefulBins);
                if (endIndex <= startIndex) endIndex = startIndex + 1;

                let sum = 0;
                for (let j = startIndex; j < endIndex; j++) {
                    sum += dataArray[j] || 0;
                }
                const count = endIndex - startIndex;
                const avg = sum / count;

                // Make the UI much more sensitive/kinetic
                // Map the 0-255 byte value to a 0-1 percentage, then apply a curve
                const normalizedVal = avg / 255;
                const kineticVal = Math.pow(normalizedVal, 1.2); // slight exponential curve for snap

                // Scale to 8-100%
                let percent = 8 + (kineticVal * 90); // reduced from 120 to avoid flat-top clipping
                percent = Math.max(8, Math.min(100, percent));

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
        <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: "100%", padding: "12px 0" }}>
            {bars.map((h, i) => (
                <div
                    key={i}
                    style={{
                        flex: 1,
                        height: `${active ? h : 8}%`,
                        background: active
                            ? h > 75 ? `linear-gradient(to top, ${COLORS.green}, ${COLORS.yellow})` : `linear-gradient(to top, ${COLORS.green}, ${COLORS.greenDim})`
                            : COLORS.border,
                        borderRadius: 2,
                        transition: active ? "height 0.05s ease" : "height 0.5s ease",
                        opacity: active ? 1 : 0.4,
                    }}
                />
            ))}
        </div>
    );
};

// Formatted timer calculation
const LiveTimer = ({ startTimeStr }: { startTimeStr: Date | null }) => {
    const [elapsed, setElapsed] = useState(0);

    useEffect(() => {
        if (!startTimeStr) { setElapsed(0); return; }
        const start = startTimeStr.getTime();

        const interval = setInterval(() => {
            setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
        }, 1000);

        // Initial call
        setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));

        return () => clearInterval(interval);
    }, [startTimeStr]);

    const hrs = String(Math.floor(elapsed / 3600)).padStart(2, "0");
    const mins = String(Math.floor((elapsed % 3600) / 60)).padStart(2, "0");
    const secs = String(elapsed % 60).padStart(2, "0");
    return <span style={{ fontVariantNumeric: "tabular-nums" }}>{hrs}:{mins}:{secs}</span>;
}

// Vertical Fader from UX Mock
// Re-wired to consume 0-100 logic and call onVolumeChange
function VerticalFader({ isMuted, onMuteToggle, volume, onVolumeChange }: { isMuted: boolean, onMuteToggle: () => void, volume: number, onVolumeChange: (val: number) => void }) {
    const trackRef = useRef<HTMLDivElement>(null);
    const dragging = useRef(false);

    const DB_MARKS = [
        { label: "0 dB", pct: 0 },
        { label: "-6", pct: 20 },
        { label: "-12", pct: 40 },
        { label: "-24", pct: 65 },
        { label: "-36", pct: 80 },
        { label: "-∞", pct: 100 },
    ];

    const updateFromPointer = useCallback((e: React.PointerEvent) => {
        if (!trackRef.current) return;
        const rect = trackRef.current.getBoundingClientRect();
        const pct = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
        onVolumeChange(100 - pct); // invert so top is 100
    }, [onVolumeChange]);

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        updateFromPointer(e);
    }, [updateFromPointer]);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!dragging.current) return;
        updateFromPointer(e);
    }, [updateFromPointer]);

    const handlePointerUp = useCallback(() => { dragging.current = false; }, []);

    const faderPosition = 100 - volume;

    // Render left and right fake meters reacting to the volume drag
    const randomMeterHeight = isMuted ? 0 : Math.max(0, volume - 10 + Math.random() * 20);

    return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "stretch", gap: 8, height: 200 }}>
                {/* dB labels */}
                <div style={{ position: "relative", width: 28, height: "100%" }}>
                    {DB_MARKS.map((m) => (
                        <span key={m.label} style={{ position: "absolute", top: `${m.pct}%`, right: 0, transform: "translateY(-50%)", fontSize: 9, color: COLORS.textMuted, fontFamily: "'JetBrains Mono', monospace", whiteSpace: "nowrap" }}>{m.label}</span>
                    ))}
                </div>

                {/* Left meter */}
                <div style={{ width: 5, borderRadius: 3, background: COLORS.bg, border: `1px solid ${COLORS.border}`, position: "relative", overflow: "hidden" }}>
                    <div style={{
                        position: "absolute", bottom: 0, left: 0, right: 0,
                        height: isMuted ? "0%" : `${randomMeterHeight}%`,
                        background: volume > 85 ? `linear-gradient(to top, ${COLORS.green}, ${COLORS.yellow}, ${COLORS.red})` : volume > 60 ? `linear-gradient(to top, ${COLORS.green}, ${COLORS.yellow})` : COLORS.green,
                        borderRadius: 3, transition: "height 0.15s ease",
                    }} />
                </div>

                {/* Fader track */}
                <div ref={trackRef} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}
                    style={{ width: 28, position: "relative", cursor: "pointer", touchAction: "none", background: COLORS.bg, borderRadius: 6, border: `1px solid ${COLORS.border}` }}>
                    <div style={{ position: "absolute", left: "50%", top: 8, bottom: 8, width: 2, background: COLORS.border, transform: "translateX(-50%)", borderRadius: 1 }} />
                    {DB_MARKS.map((m) => (
                        <div key={m.label} style={{ position: "absolute", top: `${m.pct}%`, left: 4, right: 4, height: 1, background: COLORS.border, transform: "translateY(-50%)" }} />
                    ))}
                    <div style={{
                        position: "absolute", top: `${faderPosition}%`, left: 2, right: 2, height: 14, transform: "translateY(-50%)",
                        background: isMuted ? COLORS.textMuted : "linear-gradient(to bottom, #e8ede9, #b0c4b8)",
                        borderRadius: 3, boxShadow: "0 2px 6px rgba(0,0,0,0.4)", border: `1px solid ${isMuted ? COLORS.border : "rgba(255,255,255,0.2)"}`, cursor: "grab",
                    }}>
                        <div style={{ position: "absolute", top: "50%", left: 5, right: 5, transform: "translateY(-50%)", display: "flex", flexDirection: "column", gap: 2 }}>
                            <div style={{ height: 1, background: "rgba(0,0,0,0.25)", borderRadius: 1 }} />
                            <div style={{ height: 1, background: "rgba(0,0,0,0.25)", borderRadius: 1 }} />
                        </div>
                    </div>
                </div>

                {/* Right meter */}
                <div style={{ width: 5, borderRadius: 3, background: COLORS.bg, border: `1px solid ${COLORS.border}`, position: "relative", overflow: "hidden" }}>
                    <div style={{
                        position: "absolute", bottom: 0, left: 0, right: 0,
                        height: isMuted ? "0%" : `${randomMeterHeight}%`,
                        background: volume > 85 ? `linear-gradient(to top, ${COLORS.green}, ${COLORS.yellow}, ${COLORS.red})` : volume > 60 ? `linear-gradient(to top, ${COLORS.green}, ${COLORS.yellow})` : COLORS.green,
                        borderRadius: 3, transition: "height 0.15s ease",
                    }} />
                </div>
            </div>

            <div style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace", color: isMuted ? COLORS.red : COLORS.textSecondary, fontWeight: 500 }}>
                {isMuted ? "Muted" : `${Math.round(volume)}%`}
            </div>

            <button onClick={onMuteToggle} style={{
                width: 36, height: 36, borderRadius: 8,
                border: `1px solid ${isMuted ? COLORS.redBorder : COLORS.border}`,
                background: isMuted ? COLORS.redBg : "transparent",
                color: isMuted ? COLORS.red : COLORS.textSecondary,
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s ease",
            }}>
                {isMuted ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></svg>
                ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /></svg>
                )}
            </button>
        </div>
    );
}

function ConfirmModal({ onConfirm, onCancel }: { onConfirm: () => void, onCancel: () => void }) {
    return (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }} onClick={onCancel}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: COLORS.surface, border: `1px solid ${COLORS.redBorder}`, borderRadius: 16, padding: 32, maxWidth: 400, width: "90%", textAlign: "center" }}>
                <div style={{ width: 48, height: 48, borderRadius: "50%", background: COLORS.redBg, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={COLORS.red} strokeWidth="2"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
                </div>
                <h3 style={{ color: COLORS.text, fontSize: 18, fontWeight: 600, margin: "0 0 8px", fontFamily: "'DM Sans', sans-serif" }}>End this broadcast?</h3>
                <p style={{ color: COLORS.textSecondary, fontSize: 14, margin: "0 0 24px", lineHeight: 1.5, fontFamily: "'DM Sans', sans-serif" }}>All active listeners will be disconnected immediately.</p>
                <div style={{ display: "flex", gap: 12 }}>
                    <button onClick={onCancel} style={{ flex: 1, padding: "12px 20px", borderRadius: 10, border: `1px solid ${COLORS.border}`, background: "transparent", color: COLORS.textSecondary, fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Keep streaming</button>
                    <button onClick={onConfirm} style={{ flex: 1, padding: "12px 20px", borderRadius: 10, border: `1px solid ${COLORS.redBorder}`, background: COLORS.redBg, color: COLORS.red, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>End stream</button>
                </div>
            </div>
        </div>
    );
}

export default function StudioPage() {
    const { user, isLoading, logout } = useAuth();
    const router = useNavigate();
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
    const [isLive, setIsLive] = useState(false);
    const [streamId, setStreamId] = useState('demo'); // Default ID for MVP
    const [startTime, setStartTime] = useState<Date | null>(null);
    const [historyData, setHistoryData] = useState<any[]>([]);
    const [listenerCount, setListenerCount] = useState(0);
    const [showEndConfirmation, setShowEndConfirmation] = useState(false);
    const [isPublic, setIsPublic] = useState(true);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [isMonitoring, setIsMonitoring] = useState(false); // Browser B: monitoring only, no audio pipeline

    const [isMounted, setIsMounted] = useState(false);

    // Refs for accessing state in callbacks/effects without stale closures
    const isLiveRef = useRef(isLive);
    const streamIdRef = useRef(streamId);
    const titleRef = useRef(title);
    const descriptionRef = useRef(description);

    // Update refs when state changes
    useEffect(() => { isLiveRef.current = isLive; }, [isLive]);
    useEffect(() => { streamIdRef.current = streamId; }, [streamId]);
    useEffect(() => { titleRef.current = title; }, [title]);
    useEffect(() => { descriptionRef.current = description; }, [description]);

    // ALL HOOKS MUST BE CALLED BEFORE ANY CONDITIONAL RETURNS
    const devices = useAudioDevices();
    const { stream, startStream, volume, isMuted, updateVolume, toggleMute } = useAudioStream();

    // Prevent hydration mismatch by only rendering after mount
    useEffect(() => {
        setIsMounted(true);
    }, []);

    // HLS Broadcasting refs
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const socketRef = useRef<Socket | null>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wakeLockRef = useRef<any>(null);

    useEffect(() => {
        if (!isLoading && !user) {
            router('/login');
        }
    }, [user, isLoading, router]);

    // Fetch stream history
    useEffect(() => {
        const fetchHistory = async () => {
            try {
                const baseUrl = getServerUrl();
                const response = await fetch(`${baseUrl}/api/history?userId=${user?.id}`);
                const data = await response.json();
                setHistoryData(data);
            } catch (err) {
                console.error('Failed to fetch history:', err);
            }
        };

        if (user) {
            fetchHistory();
            const interval = setInterval(fetchHistory, 30000);
            return () => clearInterval(interval);
        }
    }, [user]);

    // Check for existing active streams on mount (multi-device support)
    useEffect(() => {
        if (!user) return;

        const checkActiveStream = async () => {
            try {
                const baseUrl = getServerUrl();
                const response = await fetch(`${baseUrl}/api/active-streams`);
                const streams = await response.json();

                // Find a stream belonging to this user
                const myStream = streams.find((s: any) => s.userId === user.id);

                if (myStream && !isLive) {
                    console.log('Found active stream from another device:', myStream.streamId);
                    setStreamId(myStream.streamId);
                    setTitle(myStream.title || '');
                    setDescription(myStream.description || '');
                    setStartTime(new Date(myStream.startTime));
                    setListenerCount(myStream.listenerCount || 0);
                    setIsLive(true);
                    setIsMonitoring(true); // This device is monitoring only

                    // Join the stream room for real-time updates
                    if (socketRef.current) {
                        socketRef.current.emit('join-stream', { streamId: myStream.streamId });
                    }

                    notifications.show({
                        title: 'Active Stream Detected',
                        message: 'You have a live stream running on another device. Monitoring mode enabled.',
                        color: 'blue',
                    });
                }
            } catch (err) {
                console.error('Failed to check active streams:', err);
            }
        };

        // Slight delay to let socket connect first
        const timeout = setTimeout(checkActiveStream, 1000);
        return () => clearTimeout(timeout);
    }, [user]);

    // Initialize Socket.IO connection
    useEffect(() => {
        const baseUrl = getServerUrl();
        const socket = io(baseUrl);
        socketRef.current = socket;

        socket.on('connect', () => {
            console.log('Connected to signaling server');
            setIsConnected(true);
            notifications.show({
                title: 'Connected',
                message: 'Successfully connected to the broadcasting server',
                color: 'green',
                icon: <IconWifi size={16} />,
            });

            // Check for persisted stream state on connect
            // Check for persisted stream state on connect
            const savedState = localStorage.getItem('streamState');
            if (savedState) {
                try {
                    const parsedState = JSON.parse(savedState);
                    const { streamId: savedStreamId, title: savedTitle, description: savedDescription, startTime: savedStartTime } = parsedState;

                    // Only resume if it's recent (e.g., within last hour) - optional check
                    // For now, we trust the user wants to resume if state exists

                    console.log('Found saved stream state, attempting to resume...');
                    setStreamId(savedStreamId); // Set streamId from saved state
                    setTitle(savedTitle);
                    setDescription(savedDescription);
                    setStartTime(new Date(savedStartTime));
                    setIsLive(true);

                    // Emit start-stream to resume server-side session
                    if (socketRef.current) {
                        socketRef.current.emit('start-stream', {
                            streamId: savedStreamId,
                            title: savedTitle,
                            description: savedDescription,
                            isPublic: parsedState.isPublic !== undefined ? parsedState.isPublic : true,
                            userId: user?.id
                        });
                    }

                    notifications.show({
                        title: 'Session Resumed',
                        message: 'Your previous broadcast session has been restored',
                        color: 'blue',
                    });
                } catch (e) {
                    console.error('Failed to parse saved stream state:', e);
                    localStorage.removeItem('streamState'); // Clear corrupted state
                }

                // Re-acquire audio stream if needed
                if (!stream && selectedDevice) {
                    startStream(selectedDevice);
                } else if (!stream) {
                    // Try to get default device
                    navigator.mediaDevices.getUserMedia({ audio: true }).then(() => {
                        // We need to use the hook's startStream to ensure state is updated correctly
                        // But since we can't call hook functions inside this callback easily without deps,
                        // we rely on the fact that startStream will be called when selectedDevice is set
                        // or we manually trigger it if we have the device ID.
                        // Better approach: Just set isLive=true and let the effect below handle recorder restart
                    }).catch(e => console.error("Failed to recover stream", e));
                }
            }
        });

        socket.on('disconnect', () => {
            console.log('Disconnected from signaling server');
            setIsConnected(false);
            notifications.show({
                title: 'Disconnected',
                message: 'Lost connection to the broadcasting server',
                color: 'red',
                icon: <IconWifiOff size={16} />,
                autoClose: false,
            });
        });

        socket.on('connect', () => {
            console.log('Socket connected:', socket.id);

            // If we are live, re-announce the stream. Do NOT restart the recorder yet.
            // Wait for the server to tell us if FFmpeg is still alive ('continue-stream') 
            // or if it crashed and needs a fresh header ('restart-stream').
            if (isLiveRef.current) {
                console.log('Socket reconnected while live. Re-announcing stream to server...');

                if (socketRef.current) {
                    socketRef.current.emit('start-stream', {
                        streamId: streamIdRef.current,
                        title: titleRef.current,
                        description: descriptionRef.current,
                        isPublic: isPublic,
                        userId: user?.id
                    });
                }
            }
        });

        socket.on('continue-stream', () => {
            console.log('Server acknowledged stream continuation. FFmpeg is still alive, keeping existing recorder.');
            // No action needed, MediaRecorder is already continuously piping chunks.
        });

        socket.on('restart-stream', () => {
            console.warn('Server requested stream restart (FFmpeg process was lost). Restarting recorder to send fresh header...');
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                try {
                    mediaRecorderRef.current.stop();
                } catch (e) {
                    console.warn('Safe stop of recorder failed:', e);
                }
                mediaRecorderRef.current = null;
            }
        });

        socket.on('watcher', (watcherId: string) => {
            console.log('New listener joined:', watcherId);
            setListenerCount((prev) => prev + 1);
            notifications.show({
                title: 'New Listener',
                message: 'Someone joined your broadcast!',
                color: 'teal',
                icon: <IconUsers size={16} />,
            });
        });

        socket.on('listener-left', (listenerId: string) => {
            console.log('Listener left:', listenerId);
            setListenerCount((prev) => Math.max(0, prev - 1));
        });

        // Listen for stream-ended (if another device ends the stream)
        socket.on('stream-ended', () => {
            if (isLiveRef.current) {
                console.log('Stream ended by another device');
                setIsLive(false);
                setIsMonitoring(false);
                setStartTime(null);
                setListenerCount(0);
                localStorage.removeItem('streamState');
                notifications.show({
                    title: 'Stream Ended',
                    message: 'The broadcast was ended from another device',
                    color: 'blue',
                });
            }
        });

        // Periodically sync listener count for monitoring devices
        socket.on('listener-count', (data: { streamId: string, count: number }) => {
            setListenerCount(data.count);
        });

        return () => {
            socket.disconnect();
        };
    }, [user]); // Added user dependency to ensure we have userId for resumption

    // Auto-resume recorder when stream becomes available and we are live
    useEffect(() => {
        if (isLive && stream && socketRef.current && !mediaRecorderRef.current) {
            console.log('Resuming MediaRecorder...');
            const mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus',
            });

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0 && socketRef.current) {
                    event.data.arrayBuffer().then((buffer) => {
                        socketRef.current!.emit('audio-chunk', {
                            streamId,
                            chunk: buffer
                        });
                    });
                }
            };

            mediaRecorder.start(4000); // 4-second chunks align perfectly with FFmpeg's 4-second HLS segments
            mediaRecorderRef.current = mediaRecorder;
        }
    }, [isLive, stream]);

    // Request wake lock to prevent device from sleeping while broadcasting
    useEffect(() => {
        const requestWakeLock = async () => {
            try {
                if ('wakeLock' in navigator && isLive && !isMonitoring) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
                    console.log('Wake lock activated');
                }
            } catch (err) {
                console.log('Wake lock error:', err);
            }
        };

        if (isLive && !isMonitoring) {
            requestWakeLock();
        }

        return () => {
            if (wakeLockRef.current) {
                wakeLockRef.current.release().then(() => {
                    console.log('Wake lock released');
                    wakeLockRef.current = null;
                });
            }
        };
    }, [isLive, isMonitoring]);

    const handleStartBroadcast = async () => {
        if (!stream || !socketRef.current) {
            console.error('No audio stream or socket connection');
            notifications.show({
                title: 'Error',
                message: 'Cannot start broadcast: No audio stream or server connection',
                color: 'red',
            });
            return;
        }

        try {
            // Start the stream and emit metadata to server
            socketRef.current.emit('start-stream', {
                streamId,
                title: title || 'Untitled Stream',
                description: description || '',
                isPublic: isPublic,
                userId: user?.id
            });

            // Save state to localStorage
            localStorage.setItem('streamState', JSON.stringify({
                streamId,
                title,
                description,
                isPublic,
                startTime: new Date().toISOString()
            }));

            // Create MediaRecorder to capture audio chunks
            const mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus',
            });

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0 && socketRef.current) {
                    // Convert Blob to ArrayBuffer and send to server
                    event.data.arrayBuffer().then((buffer) => {
                        socketRef.current!.emit('audio-chunk', {
                            streamId,
                            chunk: buffer
                        });
                    });
                }
            };

            mediaRecorder.onerror = (error) => {
                console.error('MediaRecorder error:', error);
                notifications.show({
                    title: 'Recording Error',
                    message: 'An error occurred with the audio recorder',
                    color: 'red',
                });
            };

            mediaRecorder.start(4000); // 4-second chunks align perfectly with FFmpeg's 4-second HLS segments
            mediaRecorderRef.current = mediaRecorder;

            setIsLive(true);
            setStartTime(new Date());
            setHasUnsavedChanges(false);
            console.log('Broadcast started with HLS');
            notifications.show({
                title: 'Live',
                message: 'Your broadcast is live — listeners can tune in now.',
                color: 'red',
                icon: <IconMicrophone size={16} />,
            });
        } catch (err) {
            console.error('Failed to start broadcast:', err);
            notifications.show({
                title: 'Error',
                message: 'Failed to start broadcast',
                color: 'red',
            });
        }
    };

    // Keep stream alive when tab is backgrounded
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.hidden) {
                console.log('Tab hidden - keeping stream alive');
                // Ensure socket is still connected
                if (socketRef.current?.connected === false) {
                    console.log('Socket disconnected, attempting reconnect...');
                    socketRef.current.connect();
                }
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, []);

    const handleStopStream = async () => {
        if (mediaRecorderRef.current) {
            mediaRecorderRef.current.stop();
            mediaRecorderRef.current = null;
        }

        if (socketRef.current) {
            socketRef.current.emit('end-stream', { streamId, userId: user?.id });
        }

        // Clear localStorage
        localStorage.removeItem('streamState');

        setIsMonitoring(false);
        setStartTime(null);
        setListenerCount(0);
        setShowEndConfirmation(false);
        setHasUnsavedChanges(false);
        console.log('Broadcast stopped');
        notifications.show({
            title: 'Broadcast Ended',
            message: 'Your stream has ended successfully',
            color: 'blue',
        });
    };

    const handleLogout = async () => {
        await logout();
        router('/login');
    };

    const listenerUrl = typeof window !== 'undefined'
        ? `${window.location.protocol}//${window.location.host}/listen`
        : '';


    const handleMetadataUpdate = () => {
        if (isLive && socketRef.current) {
            socketRef.current.emit('update-metadata', {
                streamId,
                title,
                description
            });

            // Update localStorage with new metadata
            const savedState = localStorage.getItem('streamState');
            if (savedState) {
                const state = JSON.parse(savedState);
                localStorage.setItem('streamState', JSON.stringify({
                    ...state,
                    title,
                    description,
                    isPublic
                }));
            }

            setHasUnsavedChanges(false);
            notifications.show({
                title: 'Updated',
                message: 'Stream info updated successfully',
                color: 'green',
            });
        }
    };

    // Handle stream change while live (e.g. microphone switch)
    useEffect(() => {
        if (isLive && stream && mediaRecorderRef.current && mediaRecorderRef.current.stream.id !== stream.id) {
            console.log('Stream changed, restarting recorder...');

            // Stop old recorder
            mediaRecorderRef.current.stop();

            // Start new recorder with new stream
            const mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus',
            });

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0 && socketRef.current) {
                    event.data.arrayBuffer().then((buffer) => {
                        socketRef.current!.emit('audio-chunk', {
                            streamId,
                            chunk: buffer
                        });
                    });
                }
            };

            mediaRecorder.start(100);
            mediaRecorderRef.current = mediaRecorder;
        }
    }, [stream, isLive]);

    // Setup Web Audio API Analyser for Visualizer when live
    const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
    useEffect(() => {
        if (!stream || isMonitoring) {
            setAnalyser(null);
            return;
        }

        try {
            const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
            const audioCtx = new AudioContext();
            const source = audioCtx.createMediaStreamSource(stream);
            const newAnalyser = audioCtx.createAnalyser();
            newAnalyser.fftSize = 256;
            source.connect(newAnalyser);
            setAnalyser(newAnalyser);

            return () => {
                try {
                    newAnalyser.disconnect();
                    source.disconnect();
                    audioCtx.close();
                } catch (e) {
                    console.error("Cleanup error", e);
                }
            };
        } catch (e) {
            console.error("Visualizer context error", e);
        }
    }, [stream, isMonitoring]);

    // Handle copying the listener URL
    const handleCopyListenerLink = async () => {
        try {
            await navigator.clipboard.writeText(listenerUrl);
            notifications.show({
                title: 'Copied',
                message: 'Listener link copied to clipboard',
                color: 'green',
                icon: <IconCheck size={16} />,
            });
        } catch (err) {
            console.error('Failed to copy', err);
        }
    };

    if (!isMounted) return null;

    if (isLoading) {
        return (
            <div style={{ minHeight: "100vh", background: COLORS.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ width: 40, height: 40, border: `3px solid ${COLORS.greenDim}`, borderTopColor: COLORS.green, borderRadius: "50%", animation: "spin 1s linear infinite" }} />
                <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

    return (
        <>
            <link href={linkFont} rel="stylesheet" />
            <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>

            {showEndConfirmation && <ConfirmModal onConfirm={handleStopStream} onCancel={() => setShowEndConfirmation(false)} />}

            <div style={{ minHeight: "100vh", background: COLORS.bg, color: COLORS.text, fontFamily: "'DM Sans', sans-serif" }}>

                {/* Header */}
                <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 32px", borderBottom: `1px solid ${COLORS.border}`, flexWrap: "wrap", gap: 16 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>AudioBox</h1>
                        <span style={{ fontSize: 13, color: COLORS.textMuted }}>Your personal broadcasting station</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                        <div style={{
                            display: "flex", alignItems: "center", gap: 8, padding: "6px 14px",
                            background: isConnected ? COLORS.greenBg : COLORS.redBg, borderRadius: 20, fontSize: 12, fontWeight: 600,
                            color: isConnected ? COLORS.green : COLORS.red, textTransform: "uppercase", letterSpacing: "0.05em"
                        }}>
                            <div style={{ width: 7, height: 7, borderRadius: "50%", background: isConnected ? COLORS.green : COLORS.red, boxShadow: `0 0 6px ${isConnected ? COLORS.green : COLORS.red}` }} />
                            {isConnected ? "Online" : "Offline"}
                        </div>
                        <span style={{ fontSize: 13, color: COLORS.textSecondary, fontFamily: "'JetBrains Mono', monospace" }}>
                            {user?.email || 'Guest'}
                        </span>
                        <button
                            onClick={handleLogout}
                            style={{ background: "transparent", border: "none", color: COLORS.textMuted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 4, borderRadius: 6, transition: "background 0.2s" }}
                            onMouseOver={(e) => e.currentTarget.style.background = COLORS.redBg}
                            onMouseOut={(e) => e.currentTarget.style.background = "transparent"}
                            title="Log Out"
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={COLORS.red} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                        </button>
                    </div>
                </header>

                {/* Live status bar */}
                {isLive && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 32px", background: "rgba(248,113,113,0.06)", borderBottom: `1px solid ${COLORS.redBorder}`, flexWrap: "wrap", gap: 16 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 12px", background: COLORS.redBg, borderRadius: 6, border: `1px solid ${COLORS.redBorder}` }}>
                                <div style={{ width: 8, height: 8, borderRadius: "50%", background: COLORS.red, animation: "pulse 1.5s ease-in-out infinite" }} />
                                <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.red, textTransform: "uppercase", letterSpacing: "0.08em" }}>Live</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={COLORS.textSecondary} strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                                <span style={{ fontSize: 22, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", color: COLORS.text }}>
                                    <LiveTimer startTimeStr={startTime} />
                                </span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, color: COLORS.textSecondary, fontSize: 14 }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                                <span style={{ fontWeight: 500 }}>{listenerCount} listener{listenerCount !== 1 ? "s" : ""}</span>
                            </div>

                            {!isMonitoring && (
                                <div style={{ display: "flex", alignItems: "center", gap: 6, color: isConnected ? COLORS.green : COLORS.red, fontSize: 13 }}>
                                    {isConnected ? (
                                        <>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                                            <span style={{ fontWeight: 500 }}>Signal strong</span>
                                        </>
                                    ) : (
                                        <>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="1" y1="1" x2="23" y2="23" /><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" /><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" /><path d="M10.71 5.05A16 16 0 0 1 22.58 9" /><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" /><path d="M8.53 16.11a6 6 0 0 1 6.95 0" /><line x1="12" y1="20" x2="12.01" y2="20" /></svg>
                                            <span style={{ fontWeight: 500 }}>Signal lost</span>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                        <button onClick={() => setShowEndConfirmation(true)} style={{ padding: "8px 20px", borderRadius: 8, border: `1px solid ${COLORS.redBorder}`, background: COLORS.redBg, color: COLORS.red, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
                            End stream
                        </button>
                    </div>
                )}

                {/* Main grid */}
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(320px, 380px)", gap: 24, padding: "32px 24px", maxWidth: 1280, margin: "0 auto", alignItems: "start" }}>

                    {/* LEFT COLUMN */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 24, minWidth: 0 }}>

                        {/* Stream Setup */}
                        <div style={{ background: COLORS.surface, borderRadius: 16, border: `1px solid ${COLORS.border}`, padding: 28 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 16, justifyContent: "space-between", marginBottom: 24 }}>
                                <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Stream setup</h2>
                                {isLive && hasUnsavedChanges ? (
                                    <button
                                        onClick={handleMetadataUpdate}
                                        style={{ fontSize: 12, background: COLORS.greenBg, border: `1px solid ${COLORS.greenBorder}`, color: COLORS.green, padding: "4px 12px", borderRadius: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
                                    >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                        Save changes
                                    </button>
                                ) : isLive ? (
                                    <span style={{ fontSize: 12, color: COLORS.textMuted, display: "flex", alignItems: "center", gap: 6 }}>
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                        Changes auto-save
                                    </span>
                                ) : null}
                            </div>

                            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                                <div>
                                    <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: COLORS.textSecondary, marginBottom: 8 }}>Stream title</label>
                                    <input
                                        type="text"
                                        value={title}
                                        onChange={(e) => {
                                            setTitle(e.target.value);
                                            if (isLive) setHasUnsavedChanges(true);
                                        }}
                                        placeholder="Episode title"
                                        style={{ width: "100%", padding: "12px 16px", borderRadius: 10, border: `1px solid ${COLORS.border}`, background: COLORS.bg, color: COLORS.text, fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box" }}
                                    />
                                </div>

                                <div>
                                    <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: COLORS.textSecondary, marginBottom: 8 }}>Description</label>
                                    <textarea
                                        value={description}
                                        onChange={(e) => {
                                            setDescription(e.target.value);
                                            if (isLive) setHasUnsavedChanges(true);
                                        }}
                                        placeholder="What's this episode about?"
                                        rows={3}
                                        style={{ width: "100%", padding: "12px 16px", borderRadius: 10, border: `1px solid ${COLORS.border}`, background: COLORS.bg, color: COLORS.text, fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: "none", resize: "vertical", lineHeight: 1.6, boxSizing: "border-box" }}
                                    />
                                </div>

                                {isMonitoring && isLive && (
                                    <div style={{ background: "rgba(59, 130, 246, 0.1)", border: "1px solid rgba(59, 130, 246, 0.2)", padding: 16, borderRadius: 10, marginTop: 8 }}>
                                        <div style={{ fontSize: 14, fontWeight: 600, color: "#60a5fa", display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 11a9 9 0 0 1 9 9"></path><path d="M4 4a16 16 0 0 1 16 16"></path><circle cx="5" cy="19" r="1"></circle></svg>
                                            Monitoring Mode
                                        </div>
                                        <div style={{ fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.5 }}>
                                            This stream is broadcasting from another device. You can monitor stats and end the stream from here.
                                        </div>
                                    </div>
                                )}

                                {!isMonitoring && (
                                    <div>
                                        <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: COLORS.textSecondary, marginBottom: 8 }}>Audio input</label>
                                        <div style={{ position: "relative" }}>
                                            <select
                                                value={selectedDevice || ''}
                                                onChange={(e) => {
                                                    setSelectedDevice(e.target.value);
                                                    if (e.target.value) startStream(e.target.value);
                                                }}
                                                style={{
                                                    width: "100%", padding: "12px 16px", borderRadius: 10, border: `1px solid ${COLORS.border}`,
                                                    background: COLORS.bg, color: COLORS.text, fontSize: 14, fontFamily: "'DM Sans', sans-serif",
                                                    outline: "none", appearance: "none", boxSizing: "border-box", cursor: "pointer"
                                                }}
                                            >
                                                <option value="" disabled>Select microphone</option>
                                                {devices.map(d => (
                                                    <option key={d.deviceId} value={d.deviceId}>{d.label || 'Unknown device'}</option>
                                                ))}
                                            </select>
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={COLORS.textSecondary} strokeWidth="2" style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
                                                <polyline points="6 9 12 15 18 9" />
                                            </svg>
                                        </div>
                                    </div>
                                )}

                                {!isMonitoring && (
                                    <div>
                                        <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "14px 16px" }}>
                                            <div>
                                                <div style={{ fontSize: 13, fontWeight: 500, color: COLORS.text, marginBottom: 2 }}>Public Broadcast</div>
                                                <div style={{ fontSize: 12, color: COLORS.textMuted }}>{isPublic ? "Visible to everyone on the Listen page" : "Unlisted test stream (Hidden from Listen page)"}</div>
                                            </div>
                                            <div style={{ position: "relative", width: 44, height: 24, borderRadius: 12, background: isPublic ? COLORS.green : COLORS.border, transition: "background 0.2s" }}>
                                                <input
                                                    type="checkbox"
                                                    checked={isPublic}
                                                    onChange={(e) => {
                                                        setIsPublic(e.target.checked);
                                                        if (isLive) setHasUnsavedChanges(true);
                                                    }}
                                                    style={{ opacity: 0, width: "100%", height: "100%", position: "absolute", cursor: "pointer", zIndex: 2 }}
                                                />
                                                <div style={{ position: "absolute", top: 2, left: isPublic ? 22 : 2, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.2s cubic-bezier(0.4, 0, 0.2, 1)", boxShadow: "0 2px 4px rgba(0,0,0,0.2)" }} />
                                            </div>
                                        </label>
                                    </div>
                                )}
                            </div>

                            {!isLive ? (
                                !isMonitoring && (
                                    <button
                                        onClick={handleStartBroadcast}
                                        disabled={!stream || !title.trim()}
                                        style={{
                                            width: "100%", marginTop: 28, padding: "16px", borderRadius: 12, border: "none",
                                            background: stream && title.trim() ? `linear-gradient(135deg, ${COLORS.green}, #2bb37e)` : COLORS.border,
                                            color: stream && title.trim() ? "#0a1a12" : COLORS.textMuted,
                                            fontSize: 15, fontWeight: 700, cursor: stream && title.trim() ? "pointer" : "not-allowed",
                                            fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                                            transition: "all 0.2s ease"
                                        }}
                                    >
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
                                        Go live
                                    </button>
                                )
                            ) : (
                                <button
                                    onClick={() => setShowEndConfirmation(true)}
                                    style={{
                                        width: "100%", marginTop: 28, padding: "16px", borderRadius: 12, border: `1px solid ${COLORS.redBorder}`,
                                        background: COLORS.bg, color: COLORS.red, fontSize: 15, fontWeight: 700, cursor: "pointer",
                                        fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                                        transition: "background 0.2s"
                                    }}
                                    onMouseOver={(e) => e.currentTarget.style.background = COLORS.redBg}
                                    onMouseOut={(e) => e.currentTarget.style.background = COLORS.bg}
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
                                    End stream
                                </button>
                            )}
                        </div>

                        {/* Past Broadcasts */}
                        <div style={{ background: COLORS.surface, borderRadius: 16, border: `1px solid ${COLORS.border}`, padding: 24 }}>
                            <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 20px" }}>Past broadcasts</h2>

                            {historyData.length > 0 ? (
                                <div style={{ display: "flex", flexDirection: "column" }}>
                                    {historyData.slice(0, 10).map((item, i) => (
                                        <div key={item.streamId} style={{ padding: "14px 0", borderBottom: i < historyData.slice(0, 10).length - 1 ? `1px solid ${COLORS.border}` : "none" }}>
                                            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontSize: 14, fontWeight: 500, color: COLORS.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.4 }}>
                                                        {item.title}
                                                    </div>
                                                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, fontSize: 13, color: COLORS.textMuted, flexWrap: "wrap" }}>
                                                        <span>{new Date(item.startTime).toLocaleDateString()}</span>
                                                        <span style={{ opacity: 0.4 }}>·</span>
                                                        <span>{new Date(item.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – {item.endTime ? new Date(item.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Ongoing'}</span>
                                                        <span style={{ opacity: 0.4 }}>·</span>
                                                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                                                            {item.peakListeners || 0} listener{item.peakListeners !== 1 ? "s" : ""}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div style={{ fontSize: 13, fontWeight: 500, color: COLORS.textSecondary, fontFamily: "'JetBrains Mono', monospace", whiteSpace: "nowrap", paddingTop: 2 }}>
                                                    {Math.floor(item.duration / 60)}m
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div style={{ fontSize: 14, color: COLORS.textMuted, padding: "20px 0", textAlign: "center" }}>
                                    No past broadcasts yet.
                                </div>
                            )}
                        </div>
                    </div>

                    {/* RIGHT COLUMN */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

                        {/* Listener Link */}
                        <div style={{ background: COLORS.surface, borderRadius: 16, border: `1px solid ${COLORS.border}`, padding: 20 }}>
                            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <label style={{ fontSize: 12, fontWeight: 600, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 6 }}>Listener link</label>
                                    <div style={{ fontSize: 13, color: COLORS.textSecondary, fontFamily: "'JetBrains Mono', monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                        {listenerUrl.replace(/^https?:\/\//, '')}
                                    </div>
                                </div>
                                <button
                                    onClick={handleCopyListenerLink}
                                    style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${COLORS.border}`, background: "transparent", color: COLORS.green, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", flexShrink: 0 }}
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                                    Copy
                                </button>
                            </div>
                        </div>

                        {/* Audio Monitor */}
                        <div style={{ background: COLORS.surface, borderRadius: 16, border: `1px solid ${isLive ? COLORS.borderLight : COLORS.border}`, padding: 24 }}>
                            <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 16px" }}>Audio monitor</h2>
                            {!stream && !isMonitoring && <p style={{ fontSize: 13, color: COLORS.textMuted, margin: "0 0 12px", lineHeight: 1.5 }}>Select an audio input to test your levels before going live.</p>}
                            {isMonitoring && <p style={{ fontSize: 13, color: COLORS.textMuted, margin: "0 0 12px", lineHeight: 1.5 }}>Audio monitoring is disabled while in passive monitoring mode.</p>}

                            {!isMonitoring && (
                                <div style={{ display: "flex", gap: 16, alignItems: "stretch" }}>
                                    {/* Waveform */}
                                    <div style={{ flex: 1, background: COLORS.bg, borderRadius: 12, padding: "8px 12px", border: `1px solid ${COLORS.border}`, display: "flex", flexDirection: "column", justifyContent: "flex-end", minHeight: 280 }}>
                                        <StudioVisualizer active={!!stream} analyser={analyser} />
                                    </div>

                                    {/* Vertical fader */}
                                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", background: COLORS.bg, borderRadius: 12, padding: "16px 12px", border: `1px solid ${COLORS.border}` }}>
                                        <div style={{ fontSize: 10, fontWeight: 600, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 16 }}>Vol</div>
                                        <VerticalFader isMuted={isMuted} onMuteToggle={toggleMute} volume={volume} onVolumeChange={updateVolume} />
                                    </div>
                                </div>
                            )}
                        </div>

                    </div>
                </div>
            </div>
        </>
    );
}
