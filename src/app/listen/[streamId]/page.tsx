'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Container, Title, Text, Slider, ActionIcon, Group, Card, Badge, Stack, Button } from '@mantine/core';
import { IconVolume, IconVolumeOff } from '@tabler/icons-react';
import { useListen } from '@/lib/webrtc/useListen';
import { AudioVisualizer } from '@/components/AudioVisualizer';

export default function ListenerPage() {
    const params = useParams();
    const streamId = params.streamId as string;
    const [volume, setVolume] = useState(80);
    const [muted, setMuted] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const wakeLockRef = useRef<any>(null);

    const { remoteStream, status } = useListen(streamId);
    const audioRef = useRef<HTMLVideoElement>(null);

    // Setup Media Session API for background playback
    useEffect(() => {
        if ('mediaSession' in navigator && isPlaying) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: `Stream ${streamId}`,
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
    }, [isPlaying, streamId]);

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

    return (
        <Container size="sm" py="xl" style={{ height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            {/* Use video element for iOS WebRTC compatibility, but hide it */}
            <video
                ref={audioRef as any}
                playsInline
                muted={false}
                style={{ display: 'none' }}
            />
            <Card withBorder padding="xl" radius="lg">
                <Stack gap="lg">
                    <Group justify="space-between">
                        <Badge color={status === 'connected' ? 'green' : status === 'connecting' ? 'yellow' : 'gray'} size="lg" variant="filled">
                            {status === 'connected' ? 'LIVE' : status === 'connecting' ? 'CONNECTING' : 'OFFLINE'}
                        </Badge>
                        <Text c="dimmed">Listener Count: -</Text>
                    </Group>

                    <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                        <Title order={2}>Stream {streamId}</Title>
                        <Text size="lg" c="dimmed" mt="sm">High quality music stream</Text>
                    </div>

                    {!isPlaying && status === 'connected' && (
                        <Button size="xl" color="green" fullWidth onClick={handlePlay} mb="lg" className="animate-pulse">
                            Start Listening
                        </Button>
                    )}

                    <Card bg="dark.8" radius="md" p="lg">
                        <Stack gap="md">
                            {/* Visualizer placeholder */}
                            <div style={{ height: '100px', background: '#1A1B1E', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px' }}>
                                {remoteStream && isPlaying ? (
                                    <AudioVisualizer stream={remoteStream} height={100} />
                                ) : (
                                    <Text c="dimmed">Audio Visualization</Text>
                                )}
                            </div>

                            <Group gap="md">
                                <ActionIcon
                                    variant="subtle"
                                    size="lg"
                                    onClick={() => setMuted(!muted)}
                                >
                                    {muted ? <IconVolumeOff /> : <IconVolume />}
                                </ActionIcon>
                                <Slider
                                    value={muted ? 0 : volume}
                                    onChange={setVolume}
                                    style={{ flex: 1 }}
                                    label={(val) => `${val}%`}
                                    color="blue"
                                />
                            </Group>
                        </Stack>
                    </Card>
                </Stack>
            </Card>
        </Container>
    );
}
