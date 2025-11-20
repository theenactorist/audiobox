import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

const RTC_CONFIG = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
    ],
};

export function useBroadcast(stream: MediaStream | null, streamId: string, title?: string, description?: string) {
    const socketRef = useRef<Socket | null>(null);
    const peerConnections = useRef<{ [socketId: string]: RTCPeerConnection }>({});
    const [listenerCount, setListenerCount] = useState(0);

    useEffect(() => {
        if (!stream) return;

        const socketUrl = process.env.NEXT_PUBLIC_SIGNALING_URL || 'http://localhost:3001';
        socketRef.current = io(socketUrl);
        const socket = socketRef.current;

        socket.emit('start-stream', { streamId, title, description });

        socket.on('watcher', async (id) => {
            const pc = new RTCPeerConnection(RTC_CONFIG);
            peerConnections.current[id] = pc;

            // Increment listener count
            setListenerCount(prev => prev + 1);

            pc.oniceconnectionstatechange = () => {
                if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'closed') {
                    delete peerConnections.current[id];
                    setListenerCount(prev => Math.max(0, prev - 1));
                }
            };

            stream.getTracks().forEach(track => pc.addTrack(track, stream));

            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    socket.emit('candidate', id, event.candidate);
                }
            };

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit('offer', id, pc.localDescription);
        });

        socket.on('answer', (id, description) => {
            peerConnections.current[id]?.setRemoteDescription(description);
        });

        socket.on('candidate', (id, candidate) => {
            peerConnections.current[id]?.addIceCandidate(new RTCIceCandidate(candidate));
        });

        socket.on('disconnect', () => {
            // Handle socket disconnect
        });

        return () => {
            socket.disconnect();
            const connections = peerConnections.current;
            Object.values(connections).forEach(pc => pc.close());
            setListenerCount(0);
        };
    }, [stream, streamId, title, description]);

    return { listenerCount };
}
