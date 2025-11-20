'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Container, Title, Text, Slider, ActionIcon, Group, Card, Badge, Stack, Button, CopyButton, Tooltip, Alert } from '@mantine/core';
import { IconVolume, IconVolumeOff, IconCopy, IconCheck, IconShare, IconAlertCircle } from '@tabler/icons-react';
import { useListen } from '@/lib/webrtc/useListen';
import { AudioVisualizer } from '@/components/AudioVisualizer';

export default function ListenerPage() {
    const params = useParams();
    const streamId = params.streamId as string;
    const [volume, setVolume] = useState(80);
    const [muted, setMuted] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const wakeLockRef = useRef<any>(null);

    const { remoteStream, status, streamMetadata } = useListen(streamId);
    const audioRef = useRef<HTMLVideoElement>(null);

    const currentUrl = typeof window !== 'undefined' ? window.location.href : '';

    // Setup Media Session API for background playback
    useEffect(() => {
        if ('mediaSession' in navigator && isPlaying && streamMetadata) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: streamMetadata.title || `Stream ${streamId}`,
                artist: 'High-Fidelity Audio Stream',
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
    }, [isPlaying, streamId, streamMetadata]);

    // Request wake lock to prevent screen sleep
    useEffect(() => {
        const requestWakeLock = async () => {
            try {
                if ('wakeLock' in navigator && isPlaying) {
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

    useEffect(() => {
        if (audioRef.current && remoteStream) {
            audioRef.current.srcObject = remoteStream;
            // Try to play automatically
            audioRef.current.play()
                .then(() => setIsPlaying(true))
                .catch(e => {
                    console.log("Autoplay blocked, waiting for interaction", e);
                    setIsPlaying(false);
                });
        }
    }, [remoteStream]);

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
                    title: streamMetadata?.title || `Stream ${streamId}`,
                    text: streamMetadata?.description || 'Listen to this live audio stream',
                    url: currentUrl,
                });
            } catch (err) {
                console.log('Share failed:', err);
            }
        }
    };

    const getStatusBadge = () => {
        if (status === 'not-found') return { color: 'gray', text: 'OFFLINE' };
        if (status === 'connected') return { color: 'green', text: 'LIVE' };
        if (status === 'connecting') return { color: 'yellow', text: 'CONNECTING' };
        return { color: 'gray', text: 'OFFLINE' };
    };

    const statusBadge = getStatusBadge();

    return (
        <Container size="sm" py="xl" style={{ height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            {/* Use video element for iOS WebRTC compatibility, but hide it */}
            <video
                ref={audioRef}
                playsInline
                muted={false}
                style={{ display: 'none' }}
            />
            <Card withBorder padding="xl" radius="lg">
                <Stack gap="lg">
                    <Group justify="space-between">
                        <Badge color={statusBadge.color} size="lg" variant="filled">
                            {statusBadge.text}
                        </Badge>
                    </Group>

                    {/* Stream Not Found / Offline Message */}
                    {status === 'not-found' && (
                        <Alert icon={<IconAlertCircle size={20} />} title="Stream Not Available" color="gray">
                            This audio livestream hasn't started yet. Please check back later or contact the broadcaster.
                        </Alert>
                    )}

                    {/* Stream Metadata */}
                    <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                        <Title order={2}>
                            {streamMetadata?.title || `Stream ${streamId}`}
                        </Title>
                        {streamMetadata?.description && (
                            <Text size="lg" c="dimmed" mt="sm">
                                {streamMetadata.description}
                            </Text>
                        )}
                        {!streamMetadata && status !== 'not-found' && (
                            <Text size="lg" c="dimmed" mt="sm">
                                Waiting for stream information...
                            </Text>
                        )}
                    </div>

                    {/* Share Buttons */}
                    {status === 'connected' && (
                        <Group justify="center" gap="sm">
                            <CopyButton value={currentUrl} timeout={2000}>
                                {({ copied, copy }) => (
                                    <Button
                                        variant="light"
                                        leftSection={copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                                        onClick={copy}
                                        color={copied ? 'teal' : 'blue'}
                                    >
                                        {copied ? 'Copied!' : 'Copy Link'}
                                    </Button>
                                )}
                            </CopyButton>

                            {'share' in navigator && (
                                <Button
                                    variant="light"
                                    leftSection={<IconShare size={16} />}
                                    onClick={handleShare}
                                    color="violet"
                                >
                                    Share
                                </Button>
                            )}
                        </Group>
                    )}

                    {/* Play Button */}
                    {!isPlaying && status === 'connected' && (
                        <Button size="xl" color="green" fullWidth onClick={handlePlay} className="animate-pulse">
                            Start Listening
                        </Button>
                    )}

                    {/* Audio Controls */}
                    <Card bg="dark.8" radius="md" p="lg">
                        <Stack gap="md">
                            {/* Visualizer */}
                            <div style={{ height: '100px', background: '#1A1B1E', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px' }}>
                                {remoteStream && isPlaying ? (
                                    <AudioVisualizer stream={remoteStream} height={100} />
                                ) : (
                                    <Text c="dimmed">Audio Visualization</Text>
                                )}
                            </div>

                            {/* Volume Controls */}
                            <Group gap="md">
                                <ActionIcon
                                    variant="subtle"
                                    size="lg"
                                    onClick={() => setMuted(!muted)}
                                    disabled={!isPlaying}
                                >
                                    {muted ? <IconVolumeOff /> : <IconVolume />}
                                </ActionIcon>
                                <Slider
                                    value={muted ? 0 : volume}
                                    onChange={setVolume}
                                    style={{ flex: 1 }}
                                    label={(val) => `${val}%`}
                                    color="blue"
                                    disabled={!isPlaying}
                                />
                            </Group>
                        </Stack>
                    </Card>
                </Stack>
            </Card>
        </Container>
    );
}
