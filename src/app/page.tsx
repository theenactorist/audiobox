import { Container, Title, Button, Group, Text, Stack } from '@mantine/core';
import Link from 'next/link';
import Image from 'next/image';

export default function Home() {
  return (
    <Container size="lg" py="xl" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Logo Area */}
      <Group justify="space-between" mb={60}>
        <Title order={3} size={24} fw={900} style={{ letterSpacing: '-0.5px' }}>AudioBox</Title>
        <Group>
          <Link href="/login">
            <Button variant="subtle" color="gray">Login</Button>
          </Link>
        </Group>
      </Group>

      <Stack gap="xl" align="center" style={{ flex: 1, justifyContent: 'center' }}>
        <Stack gap="md" align="center" style={{ maxWidth: 800 }}>
          <Title order={1} size={64} fw={800} ta="center" style={{ lineHeight: 1.1, letterSpacing: '-1px' }}>
            Deliver the next audio livestream experience for listeners
          </Title>
          <Text size="xl" ta="center" c="dimmed" style={{ maxWidth: 600 }}>
            Audio livestream made simple.
          </Text>
        </Stack>

        <Group justify="center" gap="md" mt="lg">
          <Link href="/login">
            <Button size="xl" radius="md" color="green" h={54} px={32} fz="lg">
              Start Audio Livestream
            </Button>
          </Link>
          <Link href="/listen">
            <Button size="xl" radius="md" variant="default" h={54} px={32} fz="lg">
              Listen
            </Button>
          </Link>
        </Group>

        <div style={{
          position: 'relative',
          width: '100%',
          maxWidth: 1000,
          aspectRatio: '21/9',
          marginTop: '3rem',
          borderRadius: '24px',
          overflow: 'hidden',
          boxShadow: '0 24px 48px -12px rgba(0, 0, 0, 0.2)'
        }}>
          <Image
            src="/hero-african.png"
            alt="Diverse community listening to audio"
            fill
            style={{ objectFit: 'cover' }}
            priority
          />
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.2) 100%)'
          }} />
        </div>
      </Stack>
    </Container>
  );
}
