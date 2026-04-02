# Changelog

All notable changes to the AudioBox livestream functionality will be documented in this file.

## [1.1.0] - 2026-04-02

### Stability & Bug Fixes
- **Desktop Tab Throttling Fix:** Fixed a critical issue where Chrome on desktop laptops would aggressively throttle the AudioBox tab when the host switched to another tab or used split-screen — especially on battery power. This starved the `MediaRecorder` of timer ticks, causing audio chunks to stop flowing to the server. When the socket eventually reconnected, a new WebM EBML header corrupted the FFmpeg pipe, killing audio for all listeners.
  - **Root cause:** The `keepAlive` module (silent audio loop + Media Session API) was only activated on mobile devices. Desktop browsers were left unprotected against background tab throttling.
  - **Fix:** `keepAlive` now activates on **all platforms** (desktop + mobile). The near-silent audio loop signals to Chrome/Firefox/Safari that the tab is an active media player and should not be throttled.
  - This fix also protects Firefox and Safari desktop hosts from similar throttling behaviour.

---

## [1.0.0] - 2026-03-03

### Performance Improvements
- **Studio Resource Leaks Fixed:** Major browser heaviness and CPU usage spikes during broadcasting have been resolved:
  - The visualizer now properly reuses the main `AudioContext` instead of spawning new instances every time the microphone stream changes.
  - Reduced the `AnalyserNode` `fftSize` from 256 to 64, as we only need a few frequency bins.
- **Lightweight Visualizer:** Replaced the heavy 60fps canvas-based 48-bar visualizer with a highly optimized 8-bar CSS transition visualizer running at 7fps. This reduced CPU usage in the Studio by over 90%.

### Stability & Bug Fixes
- **Ghost Audio Chunks Fixed:** Fixed a critical bug where the `MediaRecorder` kept running for 16 seconds after ending a stream. This caused ghost audio chunks to hit the server, triggering a failed FFmpeg initialization ("EBML header parsing failed"). The recorder is now stopped immediately.
- **False "Broadcast Ended" Alarms on iOS:** When a host ended a stream and went live again within 25 seconds (common on iOS), a stale grace period timer would fire and prematurely end the new broadcast for everyone. This timer is now properly tracked and cancelled when a new broadcast starts.
- **Clean FFmpeg Handover:** Fixed a bug where a host taking over a broadcast would send chunks to the *old* FFmpeg process. The server now cleanly kills the old FFmpeg so that the new broadcaster's chunks trigger a fresh initialization.
- **Listener HLS Reconnections:** Overhauled the listener auto-reconnect flow. Whenever an FFmpeg error occurs or a stream restarts (due to a takeover), the HLS.js player is completely destroyed and recreated with a fresh, cache-busting URL (`?_v=timestamp`). This fixes the bug where listeners were stuck without audio after a takeover.
- **Sparse Playlists:** Tuned HLS.js configuration parameters (`manifestLoadingMaxRetry`, `liveSyncDurationCount`) to be far more resilient when FFmpeg restarts and the `.m3u8` playlist drops below 3 segments.

### User Experience (UX)
- **Monitoring Mode Visibility:** The "Monitoring Mode" card (which allows taking over a broadcast from another device) is now visible on both the Setup tab and the Live dashboard on mobile devices.
- **Takeover Mic Prompts:** Added a clear, amber hint under the audio input dropdown after a successful broadcast takeover, reminding the host to select their microphone to begin sending audio.
- **End Broadcast UX:** Improved the flow when ending a broadcast with an inline finishing state ("Ending broadcast...") and an instant UI refresh to show that the broadcast has stopped, while the server naturally waits 16 seconds to give listeners the final buffered audio.
