'use client';

import { Container, Title, Button, Text, Stack, Card, Badge, ThemeIcon, Loader, Center, Group } from '@mantine/core';
import { IconHeadphones, IconPlayerPlay } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ListenerPage() {
    const [activeStream, setActiveStream] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        const checkActiveStreams = async () => {
            try {
                const baseUrl = process.env.NEXT_PUBLIC_SIGNALING_URL || 'http://localhost:3001';
                const response = await fetch(`${baseUrl}/api/active-streams`);

                if (response.ok) {
                    const streams = await response.json();
                    // Get the first active stream (or null if none)
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
        // Poll every 5 seconds
        const interval = setInterval(checkActiveStreams, 5000);
        return () => clearInterval(interval);
    }, []);

    const handleStartListening = () => {
        if (activeStream) {
            router.push(`/listen/${activeStream.streamId}`);
        }
    };

    return (
        <Container size="lg" py="xl" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ marginBottom: '3rem' }}>
                <Title order={3} size={24} fw={900} style={{ letterSpacing: '-0.5px' }}>AudioBox</Title>
            </div>

            <Stack gap="xl">
                <Title order={1} size={48} fw={800} style={{ letterSpacing: '-1px' }}>
                    Listen everyone on the go
                </Title>

                <Text size="xl" c="dimmed">Live Now</Text>

                {loading ? (
                    <Center style={{ minHeight: 200 }}>
                        <Loader size="lg" />
                    </Center>
                ) : (
                    <Card padding="xl" radius="md" withBorder style={{ maxWidth: 500 }}>
                        <Group justify="space-between" mb="md">
                            <Badge
                                color={activeStream ? "green" : "gray"}
                                variant="dot"
                                size="lg"
                            >
                                {activeStream ? 'Live' : 'Offline'}
                            </Badge>
                            <ThemeIcon variant="light" color={activeStream ? "green" : "gray"} radius="xl">
                                <IconHeadphones size={16} />
                            </ThemeIcon>
                        </Group>

                        <Text fw={700} size="xl" mt="md">
                            {activeStream?.title || 'No Active Broadcast'}
                        </Text>
                        <Text size="md" c="dimmed" mt="xs" mb="xl">
                            {activeStream
                                ? (activeStream.description || 'Experience high-fidelity audio streaming directly from the browser.')
                                : 'No streams are currently live. Check back later!'
                            }
                        </Text>

                        <Button
                            fullWidth
                            color={activeStream ? "green" : "gray"}
                            radius="md"
                            size="lg"
                            leftSection={activeStream ? <IconPlayerPlay size={20} /> : null}
                            onClick={handleStartListening}
                            disabled={!activeStream}
                        >
                            {activeStream ? 'Start Listening' : 'No Stream Available'}
                        </Button>
                    </Card>
                )}
            </Stack>
        </Container>
    );
}
