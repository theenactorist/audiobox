import { Container, Title, Button, Group, Text, Stack } from '@mantine/core';
import Link from 'next/link';

export default function SetupPage() {
    return (
        <Container size="lg" py="xl" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <Stack gap="xl" align="center">
                <Title order={3} size={24} fw={900} style={{ letterSpacing: '-0.5px' }}>AudioBox</Title>

                <Stack gap="md" align="center" style={{ maxWidth: 800 }}>
                    <Title order={1} size={64} fw={800} ta="center" style={{ lineHeight: 1.1, letterSpacing: '-1px' }}>
                        Delivery professional quality sound for listeners
                    </Title>
                    <Text size="xl" ta="center" c="dimmed" style={{ maxWidth: 600 }}>
                        Audio livestream made simple.
                    </Text>
                </Stack>

                <Group justify="center" gap="md" mt="lg">
                    <Link href="/register">
                        <Button size="xl" radius="md" color="green" h={54} px={32} fz="lg">
                            Create Account
                        </Button>
                    </Link>
                    <Link href="/login">
                        <Button size="xl" radius="md" variant="default" h={54} px={32} fz="lg">
                            Login
                        </Button>
                    </Link>
                </Group>
            </Stack>
        </Container>
    );
}
