'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
    TextInput,
    PasswordInput,
    Paper,
    Title,
    Text,
    Container,
    Button,
    Alert,
    Anchor,
    Stack
} from '@mantine/core';
import { IconCheck, IconMail, IconAlertCircle } from '@tabler/icons-react';
import Link from 'next/link';

export default function Register() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [registrationComplete, setRegistrationComplete] = useState(false);
    const { register } = useAuth();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        setLoading(true);

        try {
            await register(email, password);
            setRegistrationComplete(true);
        } catch (err: any) {
            setError(err.message || 'Registration failed');
        } finally {
            setLoading(false);
        }
    };

    if (registrationComplete) {
        return (
            <Container size={420} my={40}>
                <Paper withBorder shadow="md" p={30} mt={30} radius="md">
                    <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                        <div style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 64,
                            height: 64,
                            borderRadius: '50%',
                            backgroundColor: '#0FA76A20',
                            marginBottom: '1rem'
                        }}>
                            <IconMail size={32} style={{ color: '#0FA76A' }} />
                        </div>
                        <Title order={2} ta="center" mb="sm">Check your email</Title>
                        <Text c="dimmed" size="sm" ta="center">
                            We've sent a verification link to <strong>{email}</strong>
                        </Text>
                    </div>

                    <Alert icon={<IconCheck size={16} />} color="green" variant="light">
                        Please check your inbox and click the verification link to activate your account.
                    </Alert>

                    <Text c="dimmed" size="xs" ta="center" mt="lg">
                        Didn't receive the email? Check your spam folder or contact support.
                    </Text>
                </Paper>
            </Container>
        );
    }

    return (
        <Container size={420} my={40}>
            <Title ta="center">Create Account</Title>
            <Text c="dimmed" size="sm" ta="center" mt={5}>
                Already have an account?{' '}
                <Anchor component={Link} href="/login" size="sm">
                    Login
                </Anchor>
            </Text>

            <Paper withBorder shadow="md" p={30} mt={30} radius="md">
                <form onSubmit={handleSubmit}>
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
                            autoComplete="new-password"
                        />
                        <PasswordInput
                            label="Confirm Password"
                            placeholder="Confirm your password"
                            required
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.currentTarget.value)}
                            name="confirm-password"
                            id="confirm-password"
                            autoComplete="new-password"
                        />

                        <Button fullWidth mt="xl" type="submit" loading={loading} color="green">
                            Create Account
                        </Button>
                    </Stack>
                </form>
            </Paper>
        </Container>
    );
}
