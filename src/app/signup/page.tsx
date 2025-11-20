'use client';

import { useState } from 'react';
import { Container, Title, TextInput, Button, Paper, Stack, Text, Anchor } from '@mantine/core';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';

export default function SignupPage() {
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
                Create an account
            </Title>

            <Paper withBorder shadow="md" p={30} mt={30} radius="md">
                <form onSubmit={handleSubmit}>
                    <Stack>
                        <TextInput
                            label="Username"
                            placeholder="Choose a handle"
                            required
                            value={username}
                            onChange={(e) => setUsername(e.currentTarget.value)}
                        />
                        <TextInput
                            label="Email"
                            placeholder="you@example.com"
                            required
                            type="email"
                        />
                        <TextInput
                            label="Password"
                            placeholder="Choose a password"
                            required
                            type="password"
                        />
                        <Button fullWidth mt="xl" type="submit">
                            Sign up
                        </Button>
                    </Stack>
                </form>
            </Paper>

            <Text c="dimmed" size="sm" ta="center" mt={5}>
                Already have an account?{' '}
                <Anchor component={Link} href="/login" size="sm">
                    Login
                </Anchor>
            </Text>
        </Container>
    );
}
