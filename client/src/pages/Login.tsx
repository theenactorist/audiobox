
import { useState } from 'react';
import { TextInput, PasswordInput, Button, Container, Title, Paper, Text, Anchor, Stack, Alert, Group } from '@mantine/core';
import { useAuth } from '@/context/AuthContext';
import { IconAlertCircle, IconArrowLeft, IconHeadphones } from '@tabler/icons-react';
import { Link } from 'react-router-dom';

export default function LoginPage() {
    const { login } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await login(email, password);
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

            <Title ta="center">Welcome back!</Title>
            <Text c="dimmed" size="sm" ta="center" mt={5}>
                Sign in to your account
            </Text>

            <Paper withBorder shadow="md" p={30} mt={30} radius="md">
                <form onSubmit={handleLogin}>
                    <Stack>
                        {error && <Alert color="red" icon={<IconAlertCircle size={16} />}>{error}</Alert>}

                        <TextInput
                            label="Email"
                            placeholder="you@example.com"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.currentTarget.value)}
                            type="email"
                            name="email"
                            id="email"
                            autoComplete="email"
                        />
                        <PasswordInput
                            label="Password"
                            placeholder="Your password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.currentTarget.value)}
                            name="password"
                            id="password"
                            autoComplete="current-password"
                        />

                        <Text c="dimmed" size="xs" mt="xs">
                            Don't have an account?{' '}
                            <Anchor component={Link} to="/register" size="xs">
                                Create one
                            </Anchor>
                        </Text>

                        <Button fullWidth mt="xl" type="submit" loading={loading}>
                            Sign in
                        </Button>
                    </Stack>
                </form>
            </Paper>
        </Container>
    );
}

