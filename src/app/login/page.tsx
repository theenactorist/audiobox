'use client';

import { useState } from 'react';
import { TextInput, PasswordInput, Button, Container, Title, Paper, Text, Anchor, Stack, Alert, Group } from '@mantine/core';
import { useAuth } from '@/context/AuthContext';
import { IconAlertCircle } from '@tabler/icons-react';
import Link from 'next/link';

export default function LoginPage() {
    const { login, recover } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    // Recovery State
    const [isRecovering, setIsRecovering] = useState(false);
    const [recoverySuccess, setRecoverySuccess] = useState(false);

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

    const handleRecovery = async () => {
        setError('');
        setLoading(true);
        try {
            await recover(email);
            setRecoverySuccess(true);
            setTimeout(() => {
                setIsRecovering(false);
                setRecoverySuccess(false);
            }, 5000);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (isRecovering) {
        return (
            <Container size={420} my={40}>
                <Title ta="center">Reset Password</Title>
                <Paper withBorder shadow="md" p={30} mt={30} radius="md">
                    {recoverySuccess ? (
                        <Alert color="green" title="Check your email">
                            Password reset link has been sent to your email address.
                        </Alert>
                    ) : (
                        <Stack>
                            {error && <Alert color="red" icon={<IconAlertCircle size={16} />}>{error}</Alert>}

                            <TextInput
                                label="Enter your email"
                                placeholder="you@example.com"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.currentTarget.value)}
                            />
                            <Button fullWidth onClick={handleRecovery} loading={loading}>
                                Send Reset Link
                            </Button>

                            <Anchor component="button" type="button" c="dimmed" size="xs" onClick={() => setIsRecovering(false)}>
                                Back to Login
                            </Anchor>
                        </Stack>
                    )}
                </Paper>
            </Container>
        );
    }

    return (
        <Container size={420} my={40}>
            <Title ta="center">Welcome back!</Title>
            <Text c="dimmed" size="sm" ta="center" mt={5}>
                Do not have an account yet?{' '}
                <Anchor component={Link} href="/register" size="sm">
                    Create account
                </Anchor>
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

                        <Group justify="space-between" mt="xs">
                            <Anchor component="button" type="button" size="xs" onClick={() => setIsRecovering(true)}>
                                Forgot password?
                            </Anchor>
                        </Group>

                        <Button fullWidth mt="xl" type="submit" loading={loading}>
                            Sign in
                        </Button>
                    </Stack>
                </form>
            </Paper>
        </Container>
    );
}
