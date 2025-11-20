'use client';

import { useState } from 'react';
import { Container, Title, TextInput, Button, Paper, Stack, Text, Anchor } from '@mantine/core';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';

export default function LoginPage() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });

            const data = await response.json();

            if (!response.ok) {
                setError(data.error || 'Invalid credentials');
                setLoading(false);
                return;
            }

            login(data.user.username);
        } catch (err) {
            setError('Login failed. Please try again.');
            setLoading(false);
        }
    };

    return (
        <Container size={420} my={40} style={{ height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <Title ta="center" mb="xl">
                Welcome back!
            </Title>

            <Paper withBorder shadow="md" p={30} mt={30} radius="md">
                <form onSubmit={handleSubmit}>
                    <Stack>
                        {error && <Text c="red" size="sm">{error}</Text>}
                        <TextInput
                            label="Username"
                            placeholder="Your username"
                            required
                            value={username}
                            onChange={(e) => setUsername(e.currentTarget.value)}
                            disabled={loading}
                        />
                        <TextInput
                            label="Password"
                            placeholder="Your password"
                            required
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.currentTarget.value)}
                            disabled={loading}
                        />
                        <Button fullWidth mt="xl" type="submit" loading={loading}>
                            Sign in
                        </Button>
                    </Stack>
                </form>
            </Paper>

            <Text c="dimmed" size="sm" ta="center" mt={5}>
                This is a private broadcasting platform.
            </Text>
        </Container>
    );
}
