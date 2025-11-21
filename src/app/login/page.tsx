'use client';

import { useState } from 'react';
import { TextInput, PasswordInput, Button, Container, Title, Paper, Text, Anchor, Stack, Alert, Group } from '@mantine/core';
import { useAuth } from '@/context/AuthContext';
import { IconAlertCircle } from '@tabler/icons-react';
import Link from 'next/link';

export default function LoginPage() {
    const { login, recover, getSecurityQuestion } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    // Recovery State
    const [isRecovering, setIsRecovering] = useState(false);
    const [securityQuestion, setSecurityQuestion] = useState('');
    const [securityAnswer, setSecurityAnswer] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [recoveryStep, setRecoveryStep] = useState<'email' | 'answer'>('email');
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

    const handleInitiateRecovery = async () => {
        setError('');
        setLoading(true);
        try {
            const question = await getSecurityQuestion(email);
            setSecurityQuestion(question);
            setRecoveryStep('answer');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleCompleteRecovery = async () => {
        setError('');
        setLoading(true);
        try {
            await recover(email, securityAnswer, newPassword);
            setRecoverySuccess(true);
            setTimeout(() => {
                setIsRecovering(false);
                setRecoverySuccess(false);
                setRecoveryStep('email');
                setPassword('');
            }, 2000);
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
                        <Alert color="green" title="Success">
                            Password reset successfully! Redirecting to login...
                        </Alert>
                    ) : (
                        <Stack>
                            {error && <Alert color="red" icon={<IconAlertCircle size={16} />}>{error}</Alert>}

                            {recoveryStep === 'email' ? (
                                <>
                                    <TextInput
                                        label="Enter your email"
                                        placeholder="you@example.com"
                                        required
                                        value={email}
                                        onChange={(e) => setEmail(e.currentTarget.value)}
                                    />
                                    <Button fullWidth onClick={handleInitiateRecovery} loading={loading}>
                                        Next
                                    </Button>
                                </>
                            ) : (
                                <>
                                    <Text size="sm" fw={500}>Security Question:</Text>
                                    <Text size="sm" mb="xs">{securityQuestion}</Text>

                                    <TextInput
                                        label="Answer"
                                        placeholder="Your answer"
                                        required
                                        value={securityAnswer}
                                        onChange={(e) => setSecurityAnswer(e.currentTarget.value)}
                                    />

                                    <PasswordInput
                                        label="New Password"
                                        placeholder="New secure password"
                                        required
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.currentTarget.value)}
                                    />

                                    <Button fullWidth onClick={handleCompleteRecovery} loading={loading}>
                                        Reset Password
                                    </Button>
                                </>
                            )}

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
