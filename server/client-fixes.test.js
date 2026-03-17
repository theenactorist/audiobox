/**
 * Unit & Regression Tests for Client-Side Audio Fixes
 * 
 * Tests:
 * 1. HLS.js configuration values (liveSyncDurationCount, maxBufferLength)
 * 2. Play timeout logic (8-second Promise.race)
 * 3. Regression checks for existing behavior
 * 
 * Uses Node.js built-in assert + static analysis of Listen.tsx source
 */

const fs = require('fs');
const path = require('path');

const listenSource = fs.readFileSync(
    path.join(__dirname, '..', 'client', 'src', 'pages', 'Listen.tsx'),
    'utf-8'
);

const studioSource = fs.readFileSync(
    path.join(__dirname, '..', 'client', 'src', 'pages', 'Studio.tsx'),
    'utf-8'
);

describe('Listen.tsx - HLS.js Configuration', () => {
    test('liveSyncDurationCount should be 3 (12s buffer from live edge)', () => {
        expect(listenSource).toContain('liveSyncDurationCount: 3');
    });

    // Regression: ensure we didn't accidentally set it too high (>5 would add too much latency)
    test('liveSyncDurationCount should NOT be higher than 5', () => {
        const match = listenSource.match(/liveSyncDurationCount:\s*(\d+)/);
        expect(match).not.toBeNull();
        expect(parseInt(match[1])).toBeLessThanOrEqual(5);
    });

    test('maxBufferLength should be 30 (reduced from 60)', () => {
        expect(listenSource).toContain('maxBufferLength: 30');
    });

    // Regression: ensure we didn't set it too low (<10 would cause constant buffering)
    test('maxBufferLength should NOT be lower than 10', () => {
        const match = listenSource.match(/maxBufferLength:\s*(\d+)/);
        expect(match).not.toBeNull();
        expect(parseInt(match[1])).toBeGreaterThanOrEqual(10);
    });

    // Regression: backBufferLength should remain at 90
    test('backBufferLength should remain at 90', () => {
        expect(listenSource).toContain('backBufferLength: 90');
    });

    // Regression: liveMaxLatencyDurationCount should remain at 10
    test('liveMaxLatencyDurationCount should remain at 10', () => {
        expect(listenSource).toContain('liveMaxLatencyDurationCount: 10');
    });

    // Regression: aggressive manifest retries should still be in place
    test('manifestLoadingMaxRetry should be 30', () => {
        expect(listenSource).toContain('manifestLoadingMaxRetry: 30');
    });

    // Regression: HLS.js error recovery should still handle NETWORK_ERROR
    test('should recover from NETWORK_ERROR by calling startLoad()', () => {
        expect(listenSource).toContain('hls.startLoad()');
    });

    // Regression: HLS.js error recovery should still handle MEDIA_ERROR
    test('should recover from MEDIA_ERROR by calling recoverMediaError()', () => {
        expect(listenSource).toContain('hls.recoverMediaError()');
    });
});

describe('Listen.tsx - Play Timeout', () => {
    test('should use Promise.race for play timeout', () => {
        expect(listenSource).toContain('Promise.race');
    });

    test('should use 8-second timeout', () => {
        // Check for the timeout value
        const match = listenSource.match(/playWithTimeout\((\d+)\)/);
        expect(match).not.toBeNull();
        expect(parseInt(match[1])).toBe(8000);
    });

    test('should reject with PLAY_TIMEOUT error on timeout', () => {
        expect(listenSource).toContain("'PLAY_TIMEOUT'");
    });

    test('should pause audio on timeout to clean up', () => {
        expect(listenSource).toContain('audioRef.current?.pause()');
    });

    test('should reset playLoading state on timeout', () => {
        // After timeout, setPlayLoading(false) should be called
        expect(listenSource).toContain('setPlayLoading(false)');
    });

    test('should show user feedback on timeout', () => {
        expect(listenSource).toContain('stream seems to be buffering');
    });

    test('should re-throw non-timeout errors to outer catch block', () => {
        expect(listenSource).toContain('throw playError');
    });

    // Regression: iOS synchronous play() unlock should still happen before the timeout
    test('should still have synchronous play() call before await (iOS unlock)', () => {
        // The fire-and-forget play().catch(() => {}) must come BEFORE our timeout logic
        const syncPlayIndex = listenSource.indexOf("audioRef.current.play().catch(() => { })");
        const timeoutIndex = listenSource.indexOf('playWithTimeout');
        expect(syncPlayIndex).toBeGreaterThan(-1);
        expect(timeoutIndex).toBeGreaterThan(-1);
        expect(syncPlayIndex).toBeLessThan(timeoutIndex);
    });

    // Regression: initWebAudio should still be called synchronously before play
    test('should call initWebAudio() before play', () => {
        const initIndex = listenSource.indexOf('initWebAudio()');
        const playIndex = listenSource.indexOf('playWithTimeout');
        expect(initIndex).toBeGreaterThan(-1);
        expect(playIndex).toBeGreaterThan(-1);
        expect(initIndex).toBeLessThan(playIndex);
    });

    // Regression: fallback retry should still exist in the outer catch
    test('should still have fallback retry in outer catch block', () => {
        expect(listenSource).toContain('Fallback play failed');
    });
});

describe('Listen.tsx - Play Timeout Logic Unit Test', () => {
    // Test the actual Promise.race timeout behavior
    test('playWithTimeout should resolve if play resolves within timeout', async () => {
        const playWithTimeout = (timeoutMs) => {
            const playPromise = new Promise((resolve) => setTimeout(resolve, 50)); // resolves in 50ms
            return Promise.race([
                playPromise,
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('PLAY_TIMEOUT')), timeoutMs)
                )
            ]);
        };
        await expect(playWithTimeout(1000)).resolves.toBeUndefined();
    });

    test('playWithTimeout should reject with PLAY_TIMEOUT if play takes too long', async () => {
        const playWithTimeout = (timeoutMs) => {
            const playPromise = new Promise((resolve) => setTimeout(resolve, 5000)); // takes 5s
            return Promise.race([
                playPromise,
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('PLAY_TIMEOUT')), timeoutMs)
                )
            ]);
        };
        await expect(playWithTimeout(100)).rejects.toThrow('PLAY_TIMEOUT');
    });

    test('playWithTimeout should propagate play errors (not swallow them)', async () => {
        const playWithTimeout = (timeoutMs) => {
            const playPromise = Promise.reject(new Error('NotAllowedError'));
            return Promise.race([
                playPromise,
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('PLAY_TIMEOUT')), timeoutMs)
                )
            ]);
        };
        await expect(playWithTimeout(1000)).rejects.toThrow('NotAllowedError');
    });
});

describe('Studio.tsx - Device Info', () => {
    test('should have getDeviceInfo helper function', () => {
        expect(studioSource).toContain('getDeviceInfo');
    });

    test('should capture navigator.userAgent', () => {
        expect(studioSource).toContain('navigator.userAgent');
    });

    test('should detect Capacitor native platform', () => {
        expect(studioSource).toContain('Capacitor.isNativePlatform()');
    });

    test('should distinguish web-desktop from web-mobile', () => {
        expect(studioSource).toContain("'web-mobile'");
        expect(studioSource).toContain("'web-desktop'");
    });

    test('should check user-agent for mobile patterns', () => {
        expect(studioSource).toContain('Mobi|Android|iPhone|iPad');
    });

    test('should include screen dimensions', () => {
        expect(studioSource).toContain('window.screen.width');
        expect(studioSource).toContain('window.screen.height');
    });

    test('should send deviceInfo in start-stream emit', () => {
        expect(studioSource).toContain('deviceInfo: getDeviceInfo()');
    });

    // Regression: MediaRecorder should still use 4-second chunks
    test('should use 4-second MediaRecorder chunks', () => {
        expect(studioSource).toContain('.start(4000)');
    });

    // Regression: wake lock should still be used
    test('should still use wake lock for screen', () => {
        expect(studioSource).toContain("wakeLock.request('screen')");
    });

    // Regression: should NOT produce just 'web' as platform anymore
    test('should NOT produce bare web platform (must be web-desktop or web-mobile)', () => {
        // Ensure the old pattern is gone
        const hasOldPattern = /platform.*:\s*['"]web['"]/.test(studioSource);
        expect(hasOldPattern).toBe(false);
    });
});
