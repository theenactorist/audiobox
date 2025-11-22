'use client';

import { useState, useEffect } from 'react';
import { Container, Title, TextInput, Textarea, Select, Button, Group, Stack, Card, Text, Badge, CopyButton, ActionIcon, Tooltip, Table, Grid, Avatar, Slider } from '@mantine/core';
import { IconCopy, IconCheck, IconMicrophone, IconUsers, IconClock, IconPlayerStop, IconLogout, IconVolume, IconVolumeOff } from '@tabler/icons-react';
import { useAudioStream } from '@/lib/audio/useAudioStream';
import { useAudioDevices } from '@/lib/audio/useAudioDevices';
import { AudioVisualizer } from '@/components/AudioVisualizer';
import { useBroadcast } from '@/lib/webrtc/useBroadcast';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';

export default function StudioPage() {
    const { user, isLoading, logout } = useAuth();
    const router = useRouter();
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
    const [isLive, setIsLive] = useState(false);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [streamId] = useState('demo'); // Default ID for MVP
    const [startTime, setStartTime] = useState<Date | null>(null);
    const [elapsedTime, setElapsedTime] = useState('00:00:00');
    const [historyData, setHistoryData] = useState<any[]>([]);

    const devices = useAudioDevices();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { stream, startStream, volume, isMuted, updateVolume, toggleMute, getAudioTrack } = useAudioStream();
    const { listenerCount, updateMetadata, replaceAudioTrack, endStream } = useBroadcast(isLive ? stream : null, streamId, title, description, user?.id);

    useEffect(() => {
        if (!isLoading && !user) {
            router.push('/login');
        }
    }, [user, isLoading, router]);

    // Fetch stream history
    useEffect(() => {
        const fetchHistory = async () => {
            try {
                const baseUrl = process.env.NEXT_PUBLIC_SIGNALING_URL || 'http://localhost:3001';
                const response = await fetch(`${baseUrl}/api/history?userId=${user?.id}`);
                const data = await response.json();
                setHistoryData(data);
            } catch (err) {
                console.error('Failed to fetch history:', err);
            }
        };

        if (user) {
            fetchHistory();
            // Refresh every 30 seconds
            const interval = setInterval(fetchHistory, 30000);
            return () => clearInterval(interval);
        }
    }, [user]);

    // Request permission on mount to get device labels
    useEffect(() => {
        if (user) {
            navigator.mediaDevices.getUserMedia({ audio: true })
                .then(stream => {
                    stream.getTracks().forEach(t => t.stop());
                    navigator.mediaDevices.dispatchEvent(new Event('devicechange'));
                })
                .catch(err => console.error('Permission denied:', err));
        }
    }, [user]);

    // Auto-select first device
    useEffect(() => {
        if (user && devices.length > 0 && !selectedDevice) {
            setSelectedDevice(devices[0].deviceId);
        }
    }, [user, devices, selectedDevice]);

    // Start monitoring when device is first selected (NOT on every change)
    useEffect(() => {
        if (user && selectedDevice && !stream) {
            startStream(selectedDevice);
        }
    }, [user, selectedDevice, stream, startStream]);

    // Timer logic
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (user && isLive && startTime) {
            interval = setInterval(() => {
                const now = new Date();
                const diff = now.getTime() - startTime.getTime();
                const hours = Math.floor(diff / 3600000);
                const minutes = Math.floor((diff % 3600000) / 60000);
                const seconds = Math.floor((diff % 60000) / 1000);
                setElapsedTime(
                    `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
                );
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [user, isLive, startTime]);

    const handleGoLive = () => {
        if (!title) setTitle('Untitled Stream');
        setIsLive(true);
        setStartTime(new Date());
    };

    const handleStopStream = () => {
        // End stream and save history
        if (endStream) {
            endStream();
        }
        setIsLive(false);
        setStartTime(null);
        setElapsedTime('00:00:00');
        // Refresh history after stopping
        setTimeout(async () => {
            try {
                const baseUrl = process.env.NEXT_PUBLIC_SIGNALING_URL || 'http://localhost:3001';
                const response = await fetch(`${baseUrl}/api/history?userId=${user?.id}`);
                const data = await response.json();
                setHistoryData(data);
            } catch (err) {
                console.error('Failed to refresh history:', err);
            }
        }, 2000);
    };

    // Handle metadata save
    const handleSaveMetadata = () => {
        console.log('Save metadata clicked', { isLive, updateMetadata, title, description });
        if (isLive && updateMetadata) {
            updateMetadata(title, description);
            console.log('Metadata update emitted');
            alert('Stream metadata updated! Listeners will see changes on refresh.');
        } else {
            console.warn('Cannot save metadata:', { isLive, updateMetadata });
        }
    };

    // Handle device change during live broadcast
    const handleDeviceChange = async (deviceId: string | null) => {
        if (!deviceId) return;

        setSelectedDevice(deviceId);

        // If live, seamlessly switch the audio track
        if (isLive && replaceAudioTrack && getAudioTrack) {
            const newTrack = await getAudioTrack(deviceId);
            if (newTrack) {
                await replaceAudioTrack(newTrack);
            }
        } else if (!isLive) {
            // If not live, just restart the stream preview
            startStream(deviceId);
        }
    };

    if (!user) return null;

    const deviceOptions = devices.map(d => ({ value: d.deviceId, label: d.label || `Device ${d.deviceId.slice(0, 5)}...` }));
    const listenLink = typeof window !== 'undefined' ? `${window.location.origin}/listen` : '';

    // Format duration from seconds
    const formatDuration = (seconds: number) => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const formatDate = (isoString: string) => {
        return new Date(isoString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    };

    return (
        <Container size="lg" py="xl">
            <Group justify="space-between" mb="xl">
                <Title order={1}>AudioBox Studio</Title>
                <Group>
                    {isLive && (
                        <Group>
                            <Badge color="red" size="xl" variant="filled" leftSection={<span style={{ width: 8, height: 8, borderRadius: '50%', background: 'white', display: 'inline-block', marginRight: 4, animation: 'pulse 2s infinite' }}></span>}>LIVE</Badge>
                            <Badge size="xl" variant="light" leftSection={<IconClock size={16} />}>{elapsedTime}</Badge>
                            <Badge size="xl" variant="light" color="blue" leftSection={<IconUsers size={16} />}>{listenerCount || 0} Listeners</Badge>
                        </Group>
                    )}
                    <Group gap="sm">
                        <Avatar color="blue" radius="xl">
                            {user?.email?.charAt(0).toUpperCase()}
                        </Avatar>
                        <Text size="sm" fw={500}>{user?.email}</Text>
                        <Tooltip label="Logout">
                            <ActionIcon color="red" variant="subtle" onClick={logout}>
                                <IconLogout size={20} />
                            </ActionIcon>
                        </Tooltip>
                    </Group>
                </Group>
            </Group>

            <Grid gutter="lg">
                <Grid.Col span={{ base: 12, md: 8 }}>
                    <Stack gap="lg">
                        {/* Main Control Card */}
                        <Card withBorder padding="lg" radius="md">
                            <Stack gap="md">
                                <Group justify="space-between" align="center">
                                    <Title order={3}>{isLive ? 'Live Monitor' : 'Stream Setup'}</Title>
                                    {isLive && (
                                        <Button color="red" leftSection={<IconPlayerStop size={20} />} onClick={handleStopStream}>
                                            End Stream
                                        </Button>
                                    )}
                                </Group>

                                {/* Visualizer */}
                                <div style={{ background: '#1A1B1E', borderRadius: '8px', overflow: 'hidden', padding: '1rem' }}>
                                    <AudioVisualizer stream={stream} isPlaying={!!stream} height={200} />
                                </div>

                                {/* Controls */}
                                <Grid>
                                    <Grid.Col span={isLive ? 6 : 12}>
                                        <TextInput
                                            label="Stream Title"
                                            placeholder="My Awesome Radio Show"
                                            value={title}
                                            onChange={(e) => setTitle(e.currentTarget.value)}
                                        />
                                    </Grid.Col>
                                    {isLive && (
                                        <Grid.Col span={6}>
                                            <TextInput label="Listener Link" value={listenLink} readOnly rightSection={
                                                <CopyButton value={listenLink} timeout={2000}>
                                                    {({ copied, copy }) => (
                                                        <Tooltip label={copied ? 'Copied' : 'Copy'} withArrow position="right">
                                                            <ActionIcon color={copied ? 'teal' : 'gray'} variant="subtle" onClick={copy}>
                                                                {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                                                            </ActionIcon>
                                                        </Tooltip>
                                                    )}
                                                </CopyButton>
                                            } />
                                        </Grid.Col>
                                    )}
                                </Grid>

                                <Textarea
                                    label="Description"
                                    placeholder="What are you broadcasting?"
                                    value={description}
                                    onChange={(e) => setDescription(e.currentTarget.value)}
                                    minRows={3}
                                />

                                <Select
                                    label="Audio input (microphone)"
                                    data={deviceOptions}
                                    value={selectedDevice}
                                    onChange={handleDeviceChange}
                                    placeholder="Select microphone"
                                    allowDeselect={false}
                                    leftSection={<IconMicrophone size={16} />}
                                />

                                {/* Save Metadata Button */}
                                {isLive && (
                                    <Button variant="light" onClick={handleSaveMetadata} fullWidth>
                                        Save Changes
                                    </Button>
                                )}

                                {/* Volume Controls */}
                                <Stack gap="xs">
                                    <Group justify="space-between">
                                        <Text size="sm" fw={500}>Volume Control</Text>
                                        <Tooltip label={isMuted ? "Unmute" : "Mute"}>
                                            <ActionIcon
                                                color={isMuted ? "red" : "blue"}
                                                variant={isMuted ? "filled" : "light"}
                                                onClick={toggleMute}
                                                size="lg"
                                            >
                                                {isMuted ? <IconVolumeOff size={20} /> : <IconVolume size={20} />}
                                            </ActionIcon>
                                        </Tooltip>
                                    </Group>
                                    <Slider
                                        value={isMuted ? 0 : volume * 100}
                                        onChange={(val) => updateVolume(val / 100)}
                                        marks={[
                                            { value: 0, label: '0%' },
                                            { value: 50, label: '50%' },
                                            { value: 100, label: '100%' },
                                        ]}
                                        disabled={isMuted}
                                    />
                                </Stack>

                                {!isLive && (
                                    <Button fullWidth leftSection={<IconMicrophone />} size="lg" onClick={handleGoLive}>
                                        Go Live
                                    </Button>
                                )}
                            </Stack>
                        </Card>

                        {/* History Table */}
                        <Card withBorder padding="lg" radius="md">
                            <Title order={3} mb="md">Previous Broadcasts</Title>
                            <Table>
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>Title</Table.Th>
                                        <Table.Th>Date</Table.Th>
                                        <Table.Th>Duration</Table.Th>
                                        <Table.Th>Peak Listeners</Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {historyData.length > 0 ? (
                                        historyData.map((row, index) => (
                                            <Table.Tr key={index}>
                                                <Table.Td>{row.title}</Table.Td>
                                                <Table.Td>{formatDate(row.startTime)}</Table.Td>
                                                <Table.Td>{formatDuration(row.duration)}</Table.Td>
                                                <Table.Td>{row.peakListeners}</Table.Td>
                                            </Table.Tr>
                                        ))
                                    ) : (
                                        <Table.Tr>
                                            <Table.Td colSpan={4} style={{ textAlign: 'center' }}>
                                                <Text c="dimmed">No previous broadcasts yet</Text>
                                            </Table.Td>
                                        </Table.Tr>
                                    )}
                                </Table.Tbody>
                            </Table>
                        </Card>
                    </Stack>
                </Grid.Col>

                <Grid.Col span={{ base: 12, md: 4 }}>
                    {/* Sidebar Stats / Info */}
                    <Stack gap="lg">
                        <Card withBorder padding="lg" radius="md">
                            <Title order={4} mb="md">Stream Health</Title>
                            <Stack gap="xs">
                                <Group justify="space-between">
                                    <Text size="sm" c="dimmed">Status</Text>
                                    <Badge color={isLive ? 'green' : 'gray'}>{isLive ? 'Excellent' : 'Standby'}</Badge>
                                </Group>
                                <Group justify="space-between">
                                    <Text size="sm" c="dimmed">Bitrate</Text>
                                    <Text size="sm">128 kbps</Text>
                                </Group>
                                <Group justify="space-between">
                                    <Text size="sm" c="dimmed">Sample Rate</Text>
                                    <Text size="sm">48 kHz</Text>
                                </Group>
                            </Stack>
                        </Card>

                        <Card withBorder padding="lg" radius="md">
                            <Title order={4} mb="md">Quick Tips</Title>
                            <Text size="sm" c="dimmed">
                                • Use headphones to monitor your audio.<br />
                                • Keep your microphone gain consistent.<br />
                                • Share your link on social media to get more listeners.
                            </Text>
                        </Card>
                    </Stack>
                </Grid.Col>
            </Grid>
        </Container>
    );
}
