'use client';

import { Container, Title, Button, Text, Stack, Card, Badge, ThemeIcon, Loader, Center, Group } from '@mantine/core';
import { IconHeadphones, IconPlayerPlay } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ListenerPage() {
    const [isLive, setIsLive] = useState(false);
    const [streamMetadata, setStreamMetadata] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        // Check if demo stream is live by trying to connect to the signaling server
        const checkLiveStatus = async () => {
            try {
                const baseUrl = process.env.NEXT_PUBLIC_SIGNALING_URL || 'http://localhost:3001';
                const response = await fetch(`${baseUrl}/api/stream-status/demo`);

                if (response.ok) {
                    const data = await response.json();
                    setIsLive(data.isLive);
                    setStreamMetadata(data.metadata);
                } else {
                    setIsLive(false);
                }
            } catch (err) {
                console.error('Failed to check stream status:', err);
                setIsLive(false);
            } finally {
                setLoading(false);
            }
        };

        checkLiveStatus();
        // Poll every 5 seconds
        const interval = setInterval(checkLiveStatus, 5000);
        return () => clearInterval(interval);
    }, []);

    const handleStartListening = () => {
        if (isLive) {
            router.push('/listen/demo');
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
                                color={isLive ? "green" : "gray"}
                                variant="dot"
                                size="lg"
                            >
                                {isLive ? 'Live' : 'Offline'}
                            </Badge>
                            <ThemeIcon variant="light" color={isLive ? "green" : "gray"} radius="xl">
                                <IconHeadphones size={16} />
                            </ThemeIcon>
                        </Group>

                        <Text fw={700} size="xl" mt="md">
                            {streamMetadata?.title || 'Demo Broadcast'}
                        </Text>
                        <Text size="md" c="dimmed" mt="xs" mb="xl">
                            {isLive
                                ? (streamMetadata?.description || 'Experience high-fidelity audio streaming directly from the browser.')
                                : 'The stream is currently offline. Check back later!'
                            }
                        </Text>

                        <Button
                            fullWidth
                            color={isLive ? "green" : "gray"}
                            radius="md"
                            size="lg"
                            leftSection={isLive ? <IconPlayerPlay size={20} /> : null}
                            onClick={handleStartListening}
                            disabled={!isLive}
                        >
                            {isLive ? 'Start Listening' : 'Stream Offline'}
                        </Button>
                    </Card>
                )}
            </Stack>
        </Container>
    );
}
