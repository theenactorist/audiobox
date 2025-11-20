import { Container, Title, Button, Group, Text } from '@mantine/core';
import Link from 'next/link';

export default function Home() {
  return (
    <Container size="md" py="xl" style={{ height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <Title order={1} ta="center" mb="md" size={48}>High-Fidelity Audio Stream</Title>
      <Text ta="center" size="xl" c="dimmed" mb="xl">
        Broadcast high-quality audio directly from your browser. No software required.
      </Text>

      <Group justify="center" gap="lg">
        <Link href="/studio">
          <Button size="xl" variant="filled" color="blue">
            Start Broadcasting
          </Button>
        </Link>
        <Link href="/listen/demo">
          <Button size="xl" variant="outline">
            Listen to Stream
          </Button>
        </Link>
      </Group>
    </Container>
  );
}
