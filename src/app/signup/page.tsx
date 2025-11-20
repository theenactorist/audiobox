'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Container, Title, Text, Paper } from '@mantine/core';

export default function SignupPage() {
    const router = useRouter();

    useEffect(() => {
        // Redirect to login after 2 seconds
        const timer = setTimeout(() => {
            router.push('/login');
        }, 2000);

        return () => clearTimeout(timer);
    }, [router]);

    return (
        <Container size={420} my={40} style={{ height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <Title ta="center" mb="xl">
                Private Platform
            </Title>

            <Paper withBorder shadow="md" p={30} mt={30} radius="md">
                <Text ta="center" c="dimmed">
                    This is a private broadcasting platform. Signup is not available.
                </Text>
                <Text ta="center" c="dimmed" mt="md" size="sm">
                    Redirecting to login...
                </Text>
            </Paper>
        </Container>
    );
}
