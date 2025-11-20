'use client';

import { useState } from 'react';
import { Container, Title, TextInput, Button, Paper, Stack, Text, Anchor } from '@mantine/core';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';

export default function LoginPage() {
    const [username, setUsername] = useState('');
    const { login } = useAuth();

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (username.trim()) {
            login(username);
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
                        <TextInput
                            label="Username"
                            placeholder="Your creator handle"
                            required
                            value={username}
                            onChange={(e) => setUsername(e.currentTarget.value)}
                        />
                        <TextInput
                            label="Password"
                            placeholder="Your password"
                            required
                            type="password"
                        />
                        <Button fullWidth mt="xl" type="submit">
                            Sign in
                        </Button>
                    </Stack>
                </form>
            </Paper>

            <Text c="dimmed" size="sm" ta="center" mt={5}>
                Don&apos;t have an account?{' '}
                <Anchor component={Link} href="/signup" size="sm">
                    Create account
                </Anchor>
            </Text>
        </Container>
    );
}
