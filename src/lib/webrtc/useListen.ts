import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

const RTC_CONFIG = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
    ],
};

export function useListen(streamId: string) {
    const socketRef = useRef<Socket | null>(null);
    const peerConnection = useRef<RTCPeerConnection | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'not-found'>('disconnected');
    const [streamMetadata, setStreamMetadata] = useState<{ title: string; description: string; startTime: string } | null>(null);

    useEffect(() => {
        setStatus('connecting');
        const socketUrl = process.env.NEXT_PUBLIC_SIGNALING_URL || 'http://localhost:3001';
        socketRef.current = io(socketUrl);
        const socket = socketRef.current;

        socket.emit('join-stream', streamId);

        // Receive stream metadata
        socket.on('stream-metadata', (metadata) => {
            setStreamMetadata(metadata);
        });

        // Handle stream not found
        socket.on('stream-not-found', () => {
            setStatus('not-found');
        });

        socket.on('offer', async (id, description) => {
            const pc = new RTCPeerConnection(RTC_CONFIG);
            peerConnection.current = pc;

            pc.ontrack = (event) => {
                setRemoteStream(event.streams[0]);
                setStatus('connected');
            };

            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    socket.emit('candidate', id, event.candidate);
                }
            };

            await pc.setRemoteDescription(description);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit('answer', id, pc.localDescription);
        });

        socket.on('candidate', (id, candidate) => {
            peerConnection.current?.addIceCandidate(new RTCIceCandidate(candidate));
        });

        socket.on('stream-ended', () => {
            setRemoteStream(null);
            setStatus('disconnected');
            peerConnection.current?.close();
        });

        return () => {
            socket.disconnect();
            peerConnection.current?.close();
        };
    }, [streamId]);

    return { remoteStream, status, streamMetadata };
}
