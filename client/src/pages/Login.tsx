
import { useState } from 'react';
import { PasswordInput, Button, Container, Title, Paper, Text, Stack, Alert, Group } from '@mantine/core';
import { useAuth } from '@/context/AuthContext';
import { IconAlertCircle, IconArrowLeft, IconHeadphones } from '@tabler/icons-react';
import { Link } from 'react-router-dom';

const ADMIN_EMAIL = 'livestream.thenew@gmail.com';

export default function LoginPage() {
    const { login } = useAuth();
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await login(password);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Container size={420} my={40} style={{ margin: '40px auto' }}>
            <Group justify="space-between" mb="xl">
                <Button component={Link} to="/" variant="subtle" leftSection={<IconArrowLeft size={16} />}>
                    Back to Home
                </Button>
                <Button component={Link} to="/listen" variant="light" rightSection={<IconHeadphones size={16} />}>
                    Listen
                </Button>
            </Group>

            <Title ta="center">Admin Login</Title>
            <Text c="dimmed" size="sm" ta="center" mt={5}>
                Sign in to the broadcasting studio
            </Text>

            <Paper withBorder shadow="md" p={30} mt={30} radius="md">
                <form onSubmit={handleLogin}>
                    <Stack>
                        {error && <Alert color="red" icon={<IconAlertCircle size={16} />}>{error}</Alert>}

                        <Text size="sm" fw={500} c="dimmed">Account</Text>
                        <Text size="md" fw={600}>{ADMIN_EMAIL}</Text>

                        <PasswordInput
                            label="Password"
                            placeholder="Enter your password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.currentTarget.value)}
                            name="password"
                            id="password"
                            autoComplete="current-password"
                        />

                        <Button fullWidth mt="xl" type="submit" loading={loading}>
                            Sign in
                        </Button>
                    </Stack>
                </form>
            </Paper>
        </Container>
    );
}

