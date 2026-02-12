

import { useState, useEffect, useRef } from 'react';
import { Container, Title, TextInput, Textarea, Select, Button, Group, Stack, Card, Text, Badge, CopyButton, ActionIcon, Tooltip, Table, Grid, Slider, Modal, Indicator } from '@mantine/core';
import { IconCopy, IconCheck, IconMicrophone, IconUsers, IconClock, IconPlayerStop, IconLogout, IconVolume, IconVolumeOff, IconWifi, IconWifiOff } from '@tabler/icons-react';
import { useAudioStream } from '@/lib/audio/useAudioStream';
import { useAudioDevices } from '@/lib/audio/useAudioDevices';
import { AudioVisualizer } from '@/components/AudioVisualizer';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';
import io, { Socket } from 'socket.io-client';
import { notifications } from '@mantine/notifications';
import { getServerUrl } from '@/lib/serverUrl';

export default function StudioPage() {
    const { user, isLoading, logout } = useAuth();
    const router = useNavigate();
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
    const [isLive, setIsLive] = useState(false);
    const [streamId, setStreamId] = useState('demo'); // Default ID for MVP
    const [startTime, setStartTime] = useState<Date | null>(null);
    const [elapsedTime, setElapsedTime] = useState('00:00:00');
    const [historyData, setHistoryData] = useState<any[]>([]);
    const [listenerCount, setListenerCount] = useState(0);
    const [showEndConfirmation, setShowEndConfirmation] = useState(false);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [isConnected, setIsConnected] = useState(false);

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

    // Timer effect
    useEffect(() => {
        if (!isLive || !startTime) return;

        const interval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - startTime.getTime()) / 1000);
            const hours = Math.floor(elapsed / 3600);
            const minutes = Math.floor((elapsed % 3600) / 60);
            const seconds = elapsed % 60;
            setElapsedTime(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
        }, 1000);

        return () => clearInterval(interval);
    }, [isLive, startTime]);

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

            // If we are live, we MUST restart the MediaRecorder to send a new WebM header.
            // Otherwise, FFmpeg will crash with "Invalid data found" (EBML header missing).
            if (isLiveRef.current) {
                console.log('Socket reconnected while live. Restarting recorder to send fresh header...');

                // 1. Re-announce stream to server
                if (socketRef.current) {
                    socketRef.current.emit('start-stream', {
                        streamId: streamIdRef.current,
                        title: titleRef.current,
                        description: descriptionRef.current,
                        userId: user?.id
                    });
                }

                // 2. Stop current recorder safely. 
                // The main useEffect (line ~172) will see it's null and start a new one automatically.
                if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                    try {
                        mediaRecorderRef.current.stop();
                    } catch (e) {
                        console.warn('Safe stop of recorder failed:', e);
                    }
                    mediaRecorderRef.current = null;
                }
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

            mediaRecorder.start(100);
            mediaRecorderRef.current = mediaRecorder;
        }
    }, [isLive, stream]);

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
                userId: user?.id
            });

            // Save state to localStorage
            localStorage.setItem('streamState', JSON.stringify({
                streamId,
                title,
                description,
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

            mediaRecorder.start(1000); // Send chunk every 1 second (more stable than 100ms)
            mediaRecorderRef.current = mediaRecorder;

            setIsLive(true);
            setStartTime(new Date());
            setHasUnsavedChanges(false);
            console.log('Broadcast started with HLS');
            notifications.show({
                title: 'Live',
                message: 'You are now broadcasting live!',
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
            socketRef.current.emit('end-stream', { streamId });
        }

        // Clear localStorage
        localStorage.removeItem('streamState');

        setIsLive(false);
        setStartTime(null);
        setElapsedTime('00:00:00');
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
                    description
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

    // CONDITIONAL RETURNS AFTER ALL HOOKS
    if (!isMounted) {
        return null;
    }

    if (isLoading) {
        return (
            <Container size="lg" py="xl">
                <Text>Loading...</Text>
            </Container>
        );
    }

    return (
        <Container size="xl" py="xl">
            <Modal
                opened={showEndConfirmation}
                onClose={() => setShowEndConfirmation(false)}
                title="End Broadcast?"
                centered
            >
                <Stack>
                    <Text size="sm">
                        Are you sure you want to end the current broadcast? This action cannot be undone and all listeners will be disconnected.
                    </Text>
                    <Group justify="flex-end">
                        <Button variant="light" onClick={() => setShowEndConfirmation(false)}>Cancel</Button>
                        <Button color="red" onClick={handleStopStream}>End Broadcast</Button>
                    </Group>
                </Stack>
            </Modal>

            <Group justify="space-between" mb="xl">
                <div>
                    <Title order={2}>AudioBox</Title>
                    <Text c="dimmed" size="sm">Your personal broadcasting station</Text>
                </div>
                <Group>
                    <Tooltip label={isConnected ? "Connected to Server" : "Disconnected"}>
                        <Indicator color={isConnected ? "green" : "red"} position="middle-end" size={10} processing>
                            <Badge variant="light" pr={20}>
                                {isConnected ? "Online" : "Offline"}
                            </Badge>
                        </Indicator>
                    </Tooltip>
                    <Badge size="lg" variant="light">
                        {user?.email}
                    </Badge>
                    <ActionIcon variant="light" color="red" onClick={handleLogout}>
                        <IconLogout size={18} />
                    </ActionIcon>
                </Group>
            </Group>

            <Grid gutter="md">
                <Grid.Col span={{ base: 12, md: 8 }}>
                    <Stack gap="md">
                        {/* Stream Setup */}
                        <Card shadow="sm" padding="lg" radius="md" withBorder>
                            <Stack gap="md">
                                <Group justify="space-between">
                                    <Text fw={500} size="lg">Stream Setup</Text>
                                    {isLive && (
                                        <Badge color="red" variant="dot" size="lg">
                                            LIVE
                                        </Badge>
                                    )}
                                </Group>

                                <TextInput
                                    label="Stream Title"
                                    placeholder="My Awesome Stream"
                                    value={title}
                                    onChange={(e) => {
                                        setTitle(e.currentTarget.value);
                                        if (isLive) setHasUnsavedChanges(true);
                                    }}
                                />

                                <Textarea
                                    label="Description"
                                    placeholder="Tell your listeners what this stream is about..."
                                    value={description}
                                    onChange={(e) => {
                                        setDescription(e.currentTarget.value);
                                        if (isLive) setHasUnsavedChanges(true);
                                    }}
                                    minRows={3}
                                />

                                {isLive && hasUnsavedChanges && (
                                    <Button
                                        variant="light"
                                        color="blue"
                                        onClick={handleMetadataUpdate}
                                        fullWidth
                                    >
                                        Save Changes
                                    </Button>
                                )}

                                <Select
                                    label="Audio Input"
                                    placeholder="Select microphone"
                                    data={devices.map(d => ({ value: d.deviceId, label: d.label }))}
                                    value={selectedDevice}
                                    onChange={(value) => {
                                        setSelectedDevice(value);
                                        if (value) startStream(value);
                                    }}
                                />

                                {!isLive ? (
                                    <Button
                                        fullWidth
                                        size="lg"
                                        color="green"
                                        leftSection={<IconMicrophone size={20} />}
                                        onClick={handleStartBroadcast}
                                        disabled={!stream || !title.trim()}
                                    >
                                        Go Live
                                    </Button>
                                ) : (
                                    <Button
                                        fullWidth
                                        size="lg"
                                        color="red"
                                        leftSection={<IconPlayerStop size={20} />}
                                        onClick={() => setShowEndConfirmation(true)}
                                    >
                                        End Stream
                                    </Button>
                                )}
                            </Stack>
                        </Card>

                        {/* Live Monitor */}
                        {stream && (
                            <Card shadow="sm" padding="lg" radius="md" withBorder>
                                <Stack gap="md">
                                    <Text fw={500} size="lg">Live Monitor</Text>
                                    <AudioVisualizer stream={stream} isPlaying={!!stream} />

                                    <Group gap="xs" justify="space-between">
                                        <ActionIcon
                                            variant="light"
                                            onClick={toggleMute}
                                            size="lg"
                                        >
                                            {isMuted ? <IconVolumeOff size={20} /> : <IconVolume size={20} />}
                                        </ActionIcon>
                                        <div style={{ flex: 1 }}>
                                            <Slider
                                                value={volume}
                                                onChange={updateVolume}
                                                min={0}
                                                max={100}
                                                disabled={isMuted}
                                                color="green"
                                            />
                                        </div>
                                    </Group>
                                </Stack>
                            </Card>
                        )}
                    </Stack>
                </Grid.Col>

                <Grid.Col span={{ base: 12, md: 4 }}>
                    <Stack gap="md">
                        {/* Stats */}
                        {isLive && (
                            <Card shadow="sm" padding="lg" radius="md" withBorder>
                                <Stack gap="sm">
                                    <Text fw={500} size="lg">Stream Stats</Text>

                                    <Group gap="xs">
                                        <IconClock size={18} />
                                        <div>
                                            <Text size="xs" c="dimmed">Duration</Text>
                                            <Text fw={600}>{elapsedTime}</Text>
                                        </div>
                                    </Group>

                                    <Group gap="xs">
                                        <IconUsers size={18} />
                                        <div>
                                            <Text size="xs" c="dimmed">Listeners</Text>
                                            <Text fw={600}>{listenerCount}</Text>
                                        </div>
                                    </Group>
                                </Stack>
                            </Card>
                        )}

                        {/* Share Link */}
                        <Card shadow="sm" padding="lg" radius="md" withBorder>
                            <Stack gap="sm">
                                <Text fw={500} size="lg">Share Link</Text>
                                <Text size="sm" c="dimmed" truncate>
                                    {listenerUrl}
                                </Text>
                                <CopyButton value={listenerUrl} timeout={2000}>
                                    {({ copied, copy }) => (
                                        <Button
                                            fullWidth
                                            variant="light"
                                            leftSection={copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                                            onClick={copy}
                                        >
                                            {copied ? 'Copied!' : 'Copy Link'}
                                        </Button>
                                    )}
                                </CopyButton>
                            </Stack>
                        </Card>

                        {/* Stream History */}
                        <Card shadow="sm" padding="lg" radius="md" withBorder>
                            <Stack gap="sm">
                                <Text fw={500} size="lg">Your History</Text>
                                {historyData.length > 0 ? (
                                    <Table>
                                        <Table.Thead>
                                            <Table.Tr>
                                                <Table.Th>Date</Table.Th>
                                                <Table.Th>Title</Table.Th>
                                                <Table.Th>Duration</Table.Th>
                                                <Table.Th>Listeners</Table.Th>
                                            </Table.Tr>
                                        </Table.Thead>
                                        <Table.Tbody>
                                            {historyData.slice(0, 5).map((item) => (
                                                <Table.Tr key={item.streamId}>
                                                    <Table.Td>
                                                        <Text size="sm">
                                                            {new Date(item.startTime).toLocaleDateString()}
                                                        </Text>
                                                    </Table.Td>
                                                    <Table.Td>
                                                        <Text size="sm" truncate style={{ maxWidth: 100 }}>
                                                            {item.title}
                                                        </Text>
                                                    </Table.Td>
                                                    <Table.Td>
                                                        <Text size="sm">
                                                            {Math.floor(item.duration / 60)}m
                                                        </Text>
                                                    </Table.Td>
                                                    <Table.Td>
                                                        <Text size="sm">{item.peakListeners}</Text>
                                                    </Table.Td>
                                                </Table.Tr>
                                            ))}
                                        </Table.Tbody>
                                    </Table>
                                ) : (
                                    <Text size="sm" c="dimmed">No streams yet</Text>
                                )}
                            </Stack>
                        </Card>
                    </Stack>
                </Grid.Col>
            </Grid>
        </Container>
    );
}
