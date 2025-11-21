'use client';

import { useState, useEffect, useRef } from 'react';
import { Container, Title, Text, Slider, ActionIcon, Group, Card, Badge, Stack, Button, CopyButton, Alert, Loader, Center, ThemeIcon } from '@mantine/core';
import { IconVolume, IconVolumeOff, IconCopy, IconCheck, IconShare, IconAlertCircle, IconX, IconHeadphones } from '@tabler/icons-react';
import { useListen } from '@/lib/webrtc/useListen';
import { AudioVisualizer } from '@/components/AudioVisualizer';

interface WakeLockSentinel {
    release: () => Promise<void>;
}

export default function ListenerPage() {
    const [activeStream, setActiveStream] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [volume, setVolume] = useState(80);
    const [muted, setMuted] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [showInstallBanner, setShowInstallBanner] = useState(false);
    const wakeLockRef = useRef<WakeLockSentinel | null>(null);

    const { remoteStream, status, streamMetadata } = useListen(activeStream?.streamId || '');
    const audioRef = useRef<HTMLVideoElement>(null);

    const currentUrl = typeof window !== 'undefined' ? window.location.href : '';

    // Poll for active streams
    useEffect(() => {
        const checkActiveStreams = async () => {
            try {
                const baseUrl = process.env.NEXT_PUBLIC_SIGNALING_URL || 'http://localhost:3001';
                const response = await fetch(`${baseUrl}/api/active-streams`);

                if (response.ok) {
                    const streams = await response.json();
                    setActiveStream(streams.length > 0 ? streams[0] : null);
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
        return () => clearInterval(interval);
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

    // Media Session API
    useEffect(() => {
        if ('mediaSession' in navigator && isPlaying && (streamMetadata || activeStream)) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: streamMetadata?.title || activeStream?.title || 'AudioBox Stream',
                artist: 'AudioBox Stream',
                album: 'Live Broadcast',
                artwork: [
                    { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
                    { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
                ]
            });

            navigator.mediaSession.setActionHandler('play', () => {
                audioRef.current?.play();
            });

            navigator.mediaSession.setActionHandler('pause', () => {
                audioRef.current?.pause();
            });

            navigator.mediaSession.setActionHandler('stop', () => {
                audioRef.current?.pause();
                setIsPlaying(false);
            });
        }
    }, [isPlaying, streamMetadata, activeStream]);

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

    // Setup audio stream
    useEffect(() => {
        if (audioRef.current && remoteStream) {
            audioRef.current.srcObject = remoteStream;
        }
    }, [remoteStream]);

    // Volume control
    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = muted ? 0 : volume / 100;
        }
    }, [volume, muted]);

    const handlePlay = () => {
        if (audioRef.current) {
            audioRef.current.play()
                .then(() => setIsPlaying(true))
                .catch(e => console.error("Play failed", e));
        }
    };

    const handleShare = async () => {
        if (navigator.share) {
            try {
                await navigator.share({
                    title: streamMetadata?.title || activeStream?.title || 'AudioBox Stream',
                    text: streamMetadata?.description || activeStream?.description || 'Listen to this live AudioBox stream',
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

    const getStatusBadge = () => {
        if (!activeStream) return { color: 'gray', text: 'OFFLINE' };
        if (status === 'connected' && isPlaying) return { color: 'green', text: 'LIVE' };
        if (status === 'connecting') return { color: 'yellow', text: 'CONNECTING' };
        if (status === 'connected') return { color: 'green', text: 'CONNECTED' };
        return { color: 'gray', text: 'OFFLINE' };
    };

    const statusBadge = getStatusBadge();

    // Show loading state
    if (loading) {
        return (
            <Container size="lg" py="xl" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
                <div style={{ marginBottom: '3rem' }}>
                    <Title order={3} size={24} fw={900} style={{ letterSpacing: '-0.5px' }}>AudioBox</Title>
                </div>
                <Center style={{ minHeight: 400 }}>
                    <Loader size="lg" />
                </Center>
            </Container>
        );
    }

    // Show offline state when no active stream
    if (!activeStream) {
        return (
            <Container size="lg" py="xl" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
                <div style={{ marginBottom: '3rem' }}>
                    <Title order={3} size={24} fw={900} style={{ letterSpacing: '-0.5px' }}>AudioBox</Title>
                </div>

                <Stack gap="xl">
                    <Title order={1} size={48} fw={800} style={{ letterSpacing: '-1px' }}>
                        Stay connected anywhere, anytime
                    </Title>

                    <Text size="xl" c="dimmed">Live Now</Text>

                    <Card padding="xl" radius="md" withBorder style={{ maxWidth: 500 }}>
                        <Group justify="space-between" mb="md">
                            <Badge color="gray" variant="dot" size="lg">
                                Offline
                            </Badge>
                            <ThemeIcon variant="light" color="gray" radius="xl">
                                <IconHeadphones size={16} />
                            </ThemeIcon>
                        </Group>

                        <Text fw={700} size="xl" mt="md">
                            No Active Broadcast
                        </Text>
                        <Text size="md" c="dimmed" mt="xs" mb="xl">
                            No streams are currently live. Check back later!
                        </Text>

                        <Button
                            fullWidth
                            color="gray"
                            radius="md"
                            size="lg"
                            disabled
                        >
                            No Stream Available
                        </Button>
                    </Card>
                </Stack>
            </Container>
        );
    }

    // Show player when stream is active
    return (
        <Container size="sm" py="xl" style={{ height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <video
                ref={audioRef}
                playsInline
                muted={false}
                style={{ display: 'none' }}
            />

            {showInstallBanner && (
                <Alert
                    icon={<IconAlertCircle size={16} />}
                    title="Install AudioBox"
                    color="blue"
                    withCloseButton
                    onClose={dismissInstallBanner}
                    mb="md"
                    styles={{ closeButton: { color: 'inherit' } }}
                >
                    Install this app for background audio playback even when your screen is off.
                </Alert>
            )}

            <Stack gap="lg">
                <Group justify="space-between" align="center">
                    <div>
                        <Title order={3} size={24} fw={900} style={{ letterSpacing: '-0.5px' }}>AudioBox</Title>
                        <Text size="xs" c="dimmed" mt={4}>Stay connected anywhere, anytime</Text>
                    </div>
                    <Badge color={statusBadge.color} variant="dot" size="lg">
                        {statusBadge.text}
                    </Badge>
                </Group>

                <Card shadow="sm" padding="xl" radius="md" withBorder>
                    <Stack gap="md">
                        <div>
                            <Text fw={700} size="xl">
                                {streamMetadata?.title || activeStream?.title || 'Live Stream'}
                            </Text>
                            <Text size="sm" c="dimmed" mt={4}>
                                {streamMetadata?.description || activeStream?.description || 'Experience high-fidelity audio streaming'}
                            </Text>
                        </div>

                        {remoteStream && <AudioVisualizer stream={remoteStream} />}

                        {!isPlaying ? (
                            <Button
                                fullWidth
                                size="lg"
                                color="green"
                                onClick={handlePlay}
                                disabled={status !== 'connected'}
                            >
                                {status === 'connecting' ? 'Connecting...' : 'Start Listening'}
                            </Button>
                        ) : (
                            <Group grow>
                                <Stack gap="xs">
                                    <Group gap="xs" justify="space-between">
                                        <ActionIcon
                                            variant="light"
                                            onClick={() => setMuted(!muted)}
                                            size="lg"
                                        >
                                            {muted ? <IconVolumeOff size={20} /> : <IconVolume size={20} />}
                                        </ActionIcon>
                                        <div style={{ flex: 1 }}>
                                            <Slider
                                                value={volume}
                                                onChange={setVolume}
                                                min={0}
                                                max={100}
                                                disabled={muted}
                                                color="green"
                                            />
                                        </div>
                                    </Group>
                                </Stack>
                            </Group>
                        )}

                        <Group grow mt="sm">
                            <CopyButton value={currentUrl} timeout={2000}>
                                {({ copied, copy }) => (
                                    <Button
                                        variant="light"
                                        leftSection={copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                                        onClick={copy}
                                    >
                                        {copied ? 'Copied!' : 'Copy Link'}
                                    </Button>
                                )}
                            </CopyButton>
                            {navigator.share && (
                                <Button
                                    variant="light"
                                    leftSection={<IconShare size={16} />}
                                    onClick={handleShare}
                                >
                                    Share
                                </Button>
                            )}
                        </Group>
                    </Stack>
                </Card>
            </Stack>
        </Container>
    );
}
