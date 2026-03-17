/**
 * Unit & Regression Tests for Audio Quality Fixes
 * 
 * Tests the server-side changes:
 * 1. FFmpeg configuration includes audioFrequency(48000)
 * 2. Device info extraction from start-stream events
 * 3. Device info stored in broadcasters and included in active-streams API
 * 4. Device info logged in stream-ended summary
 */

const fs = require('fs');
const path = require('path');

// Read server.js source for static analysis tests
const serverSource = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf-8');

describe('FFmpeg Configuration', () => {
    test('should include audioFrequency(48000) for sample rate normalization', () => {
        expect(serverSource).toContain('.audioFrequency(48000)');
    });

    test('should use AAC codec', () => {
        expect(serverSource).toContain(".audioCodec('aac')");
    });

    test('should set bitrate to 128k', () => {
        expect(serverSource).toContain(".audioBitrate('128k')");
    });

    test('should use 4-second HLS segments', () => {
        expect(serverSource).toContain("'-hls_time 4'");
    });

    test('should keep 10 segments in playlist', () => {
        expect(serverSource).toContain("'-hls_list_size 10'");
    });

    test('should delete old segments', () => {
        expect(serverSource).toContain('delete_segments');
    });

    test('should use webm input format', () => {
        expect(serverSource).toContain(".inputFormat('webm')");
    });

    // Regression: ensure -async 1 is still present (needed for timestamp correction)
    test('should include -async 1 input option', () => {
        expect(serverSource).toContain("'-async 1'");
    });

    // Regression: ensure we don't have conflicting aresample filter
    // (having both -async 1 and aresample=async=1 would cause double-compensation)
    test('should NOT have aresample filter (conflicts with -async 1)', () => {
        expect(serverSource).not.toContain('aresample');
    });
});

describe('Device Info Logging', () => {
    test('should extract deviceInfo from start-stream event data', () => {
        expect(serverSource).toContain('deviceInfo } = data');
    });

    test('should fall back to socket handshake user-agent', () => {
        expect(serverSource).toContain("socket.handshake?.headers?.['user-agent']");
    });

    test('should store hostDevice in broadcasters object', () => {
        expect(serverSource).toContain('hostDevice: hostDevice');
    });

    test('should log platform in stream-started message', () => {
        expect(serverSource).toContain('[Platform: ${hostDevice.platform}]');
    });

    test('should log screen size in stream-started message', () => {
        expect(serverSource).toContain('[Screen: ${hostDevice.screen}]');
    });

    test('should log user-agent (truncated) in stream-started message', () => {
        expect(serverSource).toContain('hostDevice.userAgent.substring(0, 80)');
    });

    test('should include hostPlatform in active-streams API response', () => {
        expect(serverSource).toContain('hostPlatform:');
    });

    test('should log device label in stream-ended summary', () => {
        expect(serverSource).toContain('Host: ${deviceLabel}');
    });

    // Regression: old client without deviceInfo should not crash
    test('should handle missing deviceInfo gracefully (old client fallback)', () => {
        expect(serverSource).toContain("platform: 'unknown (old client)'");
    });

    // Regression: should still log stream resumptions with device info
    test('should include platform in stream resumption log', () => {
        expect(serverSource).toContain('[${hostDevice.platform}]');
    });
});

describe('Stream Lifecycle', () => {
    // Regression: lazy FFmpeg init should still be documented
    test('should use lazy FFmpeg initialization (not during start-stream)', () => {
        expect(serverSource).toContain('FFmpeg will start on first chunk');
    });

    // Regression: grace period should still be 25 seconds
    test('should maintain 25-second grace period for listeners', () => {
        expect(serverSource).toContain('GRACE_PERIOD_MS = 25000');
    });

    // Regression: broadcaster authorization check should prevent duplicate echoes
    test('should prevent unauthorized sockets from sending audio chunks', () => {
        expect(serverSource).toContain('broadcasters[streamId].socketId !== socket.id');
    });

    // Regression: stale FFmpeg should be killed on stream resumption
    test('should kill stale FFmpeg on stream resumption', () => {
        expect(serverSource).toContain('Killing stale FFmpeg');
    });

    // Regression: pending chunks should be cleared on resumption
    test('should clear pending chunks on stream resumption', () => {
        expect(serverSource).toContain('pendingChunks[streamId] = []');
    });
});
