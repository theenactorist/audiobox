import { NextResponse } from 'next/server';

export async function GET() {
    try {
        const signalingServer = process.env.NEXT_PUBLIC_SIGNALING_URL || 'http://localhost:3001';
        const response = await fetch(`${signalingServer}/api/history`);

        if (!response.ok) {
            throw new Error('Failed to fetch history');
        }

        const history = await response.json();
        return NextResponse.json(history);
    } catch (error) {
        console.error('Error fetching stream history:', error);
        return NextResponse.json([]);
    }
}
