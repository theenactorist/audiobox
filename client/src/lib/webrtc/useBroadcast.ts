import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { getServerUrl } from '../serverUrl';

const RTC_CONFIG = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
    ],
};

export function useBroadcast(stream: MediaStream | null, streamId: string, title?: string, description?: string, userId?: string) {
    const socketRef = useRef<Socket | null>(null);
    const peerConnections = useRef<{ [socketId: string]: RTCPeerConnection }>({});
    const [listenerCount, setListenerCount] = useState(0);

    // Memoized function to update metadata without restarting stream
    const updateMetadata = useCallback((newTitle: string, newDescription: string) => {
        if (socketRef.current) {
            socketRef.current.emit('update-metadata', { streamId, title: newTitle, description: newDescription });
        }
    }, [streamId]);

    // Memoized function to replace audio track (for mic switching)
    const replaceAudioTrack = useCallback(async (newTrack: MediaStreamTrack) => {
        const connections = peerConnections.current;
        for (const pc of Object.values(connections)) {
            const senders = pc.getSenders();
            const audioSender = senders.find(sender => sender.track?.kind === 'audio');
            if (audioSender) {
                await audioSender.replaceTrack(newTrack);
            }
        }
    }, []);

    // Memoized function to end stream and save history
    const endStream = useCallback(() => {
        if (socketRef.current) {
            socketRef.current.emit('end-stream', { streamId });
            socketRef.current.disconnect();
            const connections = peerConnections.current;
            Object.values(connections).forEach(pc => pc.close());
            peerConnections.current = {};
            setListenerCount(0);
        }
    }, [streamId]);

    useEffect(() => {
        if (!stream) return;

        const socketUrl = getServerUrl();
        socketRef.current = io(socketUrl);
        const socket = socketRef.current;

        socket.emit('start-stream', { streamId, title, description, userId });

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
    }, [stream, streamId]); // Removed title, description, userId from dependencies

    return { listenerCount, updateMetadata, replaceAudioTrack, endStream };
}
