'use client';

import { useState } from 'react';
import { TextInput, PasswordInput, Button, Container, Title, Paper, Text, Anchor, Stack, Alert, Select } from '@mantine/core';
import { useAuth } from '@/context/AuthContext';
import { IconAlertCircle } from '@tabler/icons-react';
import Link from 'next/link';

const SECURITY_QUESTIONS = [
    'What was the name of your first pet?',
    'In what city were you born?',
    'What is your mother\'s maiden name?',
    'What was the make of your first car?',
    'What is the name of your favorite teacher?'
];

export default function RegisterPage() {
    const { register } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [securityQuestion, setSecurityQuestion] = useState<string | null>(null);
    const [securityAnswer, setSecurityAnswer] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        if (!securityQuestion) {
            setError('Please select a security question');
            return;
        }

        setLoading(true);
        try {
            await register(email, password, securityQuestion, securityAnswer);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

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
                <form onSubmit={handleRegister}>
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

                        <Select
                            label="Security Question"
                            placeholder="Select a question for account recovery"
                            data={SECURITY_QUESTIONS}
                            value={securityQuestion}
                            onChange={setSecurityQuestion}
                            required
                        />

                        <TextInput
                            label="Security Answer"
                            placeholder="Your answer"
                            required
                            value={securityAnswer}
                            onChange={(e) => setSecurityAnswer(e.currentTarget.value)}
                        />

                        <Button fullWidth mt="xl" type="submit" loading={loading}>
                            Register
                        </Button>
                    </Stack>
                </form>
            </Paper>
        </Container>
    );
}
