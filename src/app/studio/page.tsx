'use client';

import { useState, useEffect } from 'react';
import { Container, Title, TextInput, Textarea, Select, Button, Group, Stack, Card, Text, Badge, CopyButton, ActionIcon, Tooltip, Table, Grid } from '@mantine/core';
import { IconCopy, IconCheck, IconMicrophone, IconUsers, IconClock, IconPlayerStop } from '@tabler/icons-react';
import { useAudioStream } from '@/lib/audio/useAudioStream';
import { useAudioDevices } from '@/lib/audio/useAudioDevices';
import { AudioVisualizer } from '@/components/AudioVisualizer';
import { useBroadcast } from '@/lib/webrtc/useBroadcast';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';

export default function StudioPage() {
    const { user } = useAuth();
    const router = useRouter();
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
    const [isLive, setIsLive] = useState(false);
    const [streamId, setStreamId] = useState('demo'); // Default ID for MVP
    const [startTime, setStartTime] = useState<Date | null>(null);
    const [elapsedTime, setElapsedTime] = useState('00:00:00');

    useEffect(() => {
        if (!user) {
            router.push('/login');
        }
    }, [user, router]);

    const devices = useAudioDevices();
    const { stream, error, startStream, stopStream } = useAudioStream();
    const { listenerCount } = useBroadcast(isLive ? stream : null, streamId);

    if (!user) return null;

    // Request permission on mount to get device labels
    useEffect(() => {
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => {
                stream.getTracks().forEach(t => t.stop());
                navigator.mediaDevices.dispatchEvent(new Event('devicechange'));
            })
            .catch(err => console.error('Permission denied:', err));
    }, []);

    // Auto-select first device
    useEffect(() => {
        if (devices.length > 0 && !selectedDevice) {
            setSelectedDevice(devices[0].deviceId);
        }
    }, [devices, selectedDevice]);

    // Start monitoring when device changes
    useEffect(() => {
        if (selectedDevice) {
            startStream(selectedDevice);
        }
    }, [selectedDevice, startStream]);

    // Timer logic
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isLive && startTime) {
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
    }, [isLive, startTime]);

    const handleGoLive = () => {
        if (!title) setTitle('Untitled Stream');
        setIsLive(true);
        setStartTime(new Date());
    };

    const handleStopStream = () => {
        setIsLive(false);
        setStartTime(null);
        setElapsedTime('00:00:00');
    };

    const deviceOptions = devices.map(d => ({ value: d.deviceId, label: d.label || `Device ${d.deviceId.slice(0, 5)}...` }));
    const listenLink = typeof window !== 'undefined' ? `${window.location.origin}/listen/${streamId}` : '';

    // Mock History Data
    const historyData = [
        { id: 1, title: 'Morning Jazz Session', date: '2023-10-24', duration: '01:30:00', listeners: 45 },
        { id: 2, title: 'Tech Talk Daily', date: '2023-10-23', duration: '00:45:00', listeners: 120 },
        { id: 3, title: 'Late Night Lo-Fi', date: '2023-10-22', duration: '02:15:00', listeners: 89 },
    ];

    return (
        <Container size="lg" py="xl">
            <Group justify="space-between" mb="xl">
                <Title order={1}>Creator Studio</Title>
                {isLive && (
                    <Group>
                        <Badge color="red" size="xl" variant="filled" leftSection={<span style={{ width: 8, height: 8, borderRadius: '50%', background: 'white', display: 'inline-block', marginRight: 4, animation: 'pulse 2s infinite' }}></span>}>LIVE</Badge>
                        <Badge size="xl" variant="light" leftSection={<IconClock size={16} />}>{elapsedTime}</Badge>
                        <Badge size="xl" variant="light" color="blue" leftSection={<IconUsers size={16} />}>{listenerCount || 0} Listeners</Badge>
                    </Group>
                )}
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
                                    <AudioVisualizer stream={stream} height={200} />
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
                                    onChange={setSelectedDevice}
                                    placeholder="Select microphone"
                                    allowDeselect={false}
                                    leftSection={<IconMicrophone size={16} />}
                                />

                                {!isLive && (
                                    <Button color="green" size="lg" onClick={handleGoLive} disabled={!stream} fullWidth mt="md">
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
                                    {historyData.map((row) => (
                                        <Table.Tr key={row.id}>
                                            <Table.Td>{row.title}</Table.Td>
                                            <Table.Td>{row.date}</Table.Td>
                                            <Table.Td>{row.duration}</Table.Td>
                                            <Table.Td>{row.listeners}</Table.Td>
                                        </Table.Tr>
                                    ))}
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
