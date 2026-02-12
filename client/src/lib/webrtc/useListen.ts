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
    const candidateBuffer = useRef<RTCIceCandidateInit[]>([]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setStatus('connecting');
        const socketUrl = import.meta.env.VITE_SIGNALING_URL || 'http://localhost:3001';
        socketRef.current = io(socketUrl);
        const socket = socketRef.current;

        socket.emit('join-stream', streamId);

        // Receive stream metadata
        socket.on('stream-metadata', (metadata) => {
            setStreamMetadata(metadata);
        });

        // Receive live metadata updates
        socket.on('metadata-updated', (metadata) => {
            setStreamMetadata(prev => ({
                ...prev,
                title: metadata.title,
                description: metadata.description,
                startTime: prev?.startTime || new Date().toISOString()
            }));
        });

        // Handle stream not found
        socket.on('stream-not-found', () => {
            setStatus('not-found');
        });

        socket.on('offer', async (_id, description) => {
            const pc = new RTCPeerConnection(RTC_CONFIG);
            peerConnection.current = pc;

            pc.ontrack = (event) => {
                setRemoteStream(event.streams[0]);
                setStatus('connected');
            };

            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    socket.emit('candidate', event.candidate);
                }
            };

            await pc.setRemoteDescription(description);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit('answer', pc.localDescription);

            // Process buffered candidates
            while (candidateBuffer.current.length > 0) {
                const candidate = candidateBuffer.current.shift();
                if (candidate) {
                    pc.addIceCandidate(new RTCIceCandidate(candidate));
                }
            }
        });

        socket.on('candidate', (_id, candidate) => {
            if (peerConnection.current && peerConnection.current.remoteDescription) {
                peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
            } else {
                candidateBuffer.current.push(candidate);
            }
        });

        socket.on('stream-ended', () => {
            setRemoteStream(null);
            setStatus('disconnected');
            peerConnection.current?.close();
            peerConnection.current = null;
            candidateBuffer.current = [];
        });

        return () => {
            socket.disconnect();
            peerConnection.current?.close();
            peerConnection.current = null;
            candidateBuffer.current = [];
        };
    }, [streamId]);

    return { remoteStream, status, streamMetadata };
}
