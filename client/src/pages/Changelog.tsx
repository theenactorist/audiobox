import { useEffect } from 'react';
import { IconSparkles, IconCode, IconRocket } from '@tabler/icons-react';

const COLORS = {
    bg: "#111714",
    surface: "#1a2320",
    surfaceHover: "#1f2b27",
    border: "#2a3632",
    borderLight: "#344440",
    text: "#e8ede9",
    textSecondary: "#8a9e94",
    textMuted: "#5a6e64",
    green: "#34d399",
    greenDim: "#1a6b4d",
    greenBg: "rgba(52, 211, 153, 0.08)",
    greenBorder: "rgba(52, 211, 153, 0.2)",
    blue: "#60a5fa",
    blueBg: "rgba(96, 165, 250, 0.1)",
    blueBorder: "rgba(96, 165, 250, 0.25)",
    orange: "#fb923c",
    orangeBg: "rgba(251, 146, 60, 0.1)",
    orangeBorder: "rgba(251, 146, 60, 0.25)",
};

const linkFont = "https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&family=JetBrains+Mono:wght@400;500&display=swap";

const releases = [
    {
        date: "March 1, 2026",
        title: "Native Android App, Mobile Web UI Redesign & Critical iOS Reliability",
        icon: <IconRocket size={24} color={COLORS.green} />,
        iconBg: COLORS.greenBg,
        iconBorder: COLORS.greenBorder,
        updates: [
            { type: "feature", text: "AudioBox is now natively on Android! We launched the official Capacitor APK integration complete with lock-screen Audio Session persistence." },
            { type: "feature", text: "Completely redesigned the Mobile Web Studio interface with sleek bottom-tab M3 Navigation and perfectly centered visualizers." },
            { type: "fix", text: "Resolved a severe browser crash on Arc and Chromium browsers caused by overlapping audio recording sessions returning from the background." },
            { type: "fix", text: "Fixed a major issue preventing broadcasters from using the 'Takeover Broadcast' feature when switching devices." },
            { type: "fix", text: "Solved the 'Start Listening' bug on iOS Safari by strictly enforcing synchronous native audio context initialization." },
            { type: "fix", text: "The volume slider on the iOS listener page now successfully controls the audio level natively." },
            { type: "improvement", text: "Completely rebuilt the Studio audio visualizers to bypass React state, yielding extreme rendering performance and zero lag." },
            { type: "fix", text: "Fixed an issue where the browser would silently ignore the selected microphone and fallback to the system default." },
            { type: "improvement", text: "Simplified the Studio app by removing the 'Public Broadcast' toggle to focus entirely on seamless private link sharing." },
            { type: "feature", text: "Replaced the dynamic 'Previous Broadcast' section on the Listen page with static podcast shortcut links." }
        ]
    },
    {
        date: "February 28, 2026",
        title: "Studio Navigation & Under-the-Hood Polish",
        icon: <IconSparkles size={24} color={COLORS.orange} />,
        iconBg: COLORS.orangeBg,
        iconBorder: COLORS.orangeBorder,
        updates: [
            { type: "fix", text: "Fixed a critical bug that caused 20-second audio loops when switching microphones mid-broadcast. Mic swaps are now seamless." },
            { type: "fix", text: "Added a 16-second 'Ending broadcast...' countdown to guarantee listeners hear your final words before the stream terminates." },
            { type: "fix", text: "Elevated mobile notifications so they no longer hide underneath the bottom navigation bar." },
            { type: "improvement", text: "Polished the mobile Live tab layout to perfectly center the audio visualizer and prevent volume fader overflow." },
        ]
    },
    {
        date: "February 27, 2026",
        title: "iOS Reliability & Studio Pro Fixes",
        icon: <IconRocket size={24} color={COLORS.green} />,
        iconBg: COLORS.greenBg,
        iconBorder: COLORS.greenBorder,
        updates: [
            { type: "feature", text: "Studio Seamless Takeover: Co-hosts can now seamlessly take over an active broadcast from another device with a single click." },
            { type: "fix", text: "Massive 300% volume boost for mobile broadcasters, ensuring your voice is heard loud and clear even on quiet phone microphones." },
            { type: "fix", text: "Bulletproof Backgrounding: Streams now survive switching tabs or answering phone calls on iOS, automatically recovering your audio when you return." },
            { type: "fix", text: "Fixed an issue where audio was only playing in the left ear for listeners. Broadcasts are now perfectly centered." },
            { type: "improvement", text: "New tap-to-enable microphone flow for iOS, fixing the silent permission block on iPhones." },
        ]
    },
    {
        date: "February 25, 2026",
        title: "Crystal Clear Audio & Studio Polish",
        icon: <IconSparkles size={24} color={COLORS.orange} />,
        iconBg: COLORS.orangeBg,
        iconBorder: COLORS.orangeBorder,
        updates: [
            { type: "fix", text: "Fixed an issue that could cause audio distortion, ensuring your microphone sounds crystal clear to listeners." },
            { type: "feature", text: "Listener counts are now hyper-accurate: they only go up when someone is actually playing the audio." },
            { type: "improvement", text: "The audio visualizers are smoother and react more naturally to your voice." },
            { type: "improvement", text: "Added the official AudioBox logo to browser tabs and polished the text across the app." },
            { type: "improvement", text: "The volume slider feels more intuitive to use." },
            { type: "fix", text: "Squashed several small bugs making the app feel faster and more reliable." },
        ]
    },
    {
        date: "February 24, 2026",
        title: "A Brand New Look for AudioBox",
        icon: <IconRocket size={24} color={COLORS.green} />,
        iconBg: COLORS.greenBg,
        iconBorder: COLORS.greenBorder,
        updates: [
            { type: "feature", text: "Welcome to the new AudioBox! We designed a beautiful, immersive dark mode for both listeners and creators." },
            { type: "feature", text: "You can now make a stream 'Unlisted' so it doesn't show up on your public profile." },
            { type: "feature", text: "Test your microphone and monitor your audio levels before you even go live." },
            { type: "fix", text: "Fixed issues that caused streams to freeze or drop for listeners on slower internet connections." },
            { type: "improvement", text: "Upgraded our streaming engine to handle more concurrent listeners with zero lag." },
        ]
    }
];

export default function Changelog() {
    useEffect(() => {
        document.title = 'What\'s New | AudioBox';
    }, []);

    const getBadgeStyle = (type: string) => {
        switch (type) {
            case 'feature':
                return { color: COLORS.green, bg: COLORS.greenBg, border: COLORS.greenBorder, label: "Feature" };
            case 'fix':
                return { color: COLORS.blue, bg: COLORS.blueBg, border: COLORS.blueBorder, label: "Fix" };
            case 'improvement':
            default:
                return { color: COLORS.textSecondary, bg: COLORS.surface, border: COLORS.border, label: "Improvement" };
        }
    };

    return (
        <div style={{ minHeight: "100vh", backgroundColor: COLORS.bg, color: COLORS.text, fontFamily: "'DM Sans', sans-serif" }}>
            <style>
                {`@import url('${linkFont}');
                body { margin: 0; background-color: ${COLORS.bg}; }
                ::-webkit-scrollbar { width: 8px; }
                ::-webkit-scrollbar-track { background: ${COLORS.bg}; }
                ::-webkit-scrollbar-thumb { background: ${COLORS.border}; border-radius: 4px; }
                ::-webkit-scrollbar-thumb:hover { background: ${COLORS.borderLight}; }
                .timeline-line::before {
                    content: '';
                    position: absolute;
                    top: 24px;
                    bottom: -32px;
                    left: 24px;
                    width: 2px;
                    background: ${COLORS.border};
                    z-index: 0;
                }
                .timeline-item:last-child .timeline-line::before {
                    display: none;
                }
                `}
            </style>

            <div style={{ maxWidth: 800, margin: "0 auto", padding: "64px 24px" }}>
                <div style={{ textAlign: "center", marginBottom: 64 }}>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: COLORS.greenBg, color: COLORS.green, padding: "8px 16px", borderRadius: 100, border: `1px solid ${COLORS.greenBorder}`, fontSize: 13, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 24 }}>
                        <IconCode size={16} />
                        Changelog
                    </div>
                    <h1 style={{ fontSize: 42, fontWeight: 700, margin: "0 0 16px", letterSpacing: "-0.02em" }}>What's new in AudioBox</h1>
                    <p style={{ fontSize: 18, color: COLORS.textSecondary, margin: 0, lineHeight: 1.6, maxWidth: 600, marginInline: "auto" }}>
                        We're constantly improving the broadcasting and listening experience. Here's a look at what we've shipped over the last 30 days.
                    </p>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
                    {releases.map((release, i) => (
                        <div key={i} className="timeline-item" style={{ position: "relative", display: "flex", gap: 24 }}>
                            <div className="timeline-line" style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 48, flexShrink: 0 }}>
                                <div style={{ width: 48, height: 48, borderRadius: "50%", background: release.iconBg, border: `1px solid ${release.iconBorder}`, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1 }}>
                                    {release.icon}
                                </div>
                            </div>

                            <div style={{ flex: 1, paddingBottom: 48 }}>
                                <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.textSecondary, fontFamily: "'JetBrains Mono', monospace", marginBottom: 8 }}>
                                    {release.date}
                                </div>
                                <h2 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 24px", letterSpacing: "-0.01em" }}>
                                    {release.title}
                                </h2>

                                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                                    {release.updates.map((update, j) => {
                                        const badge = getBadgeStyle(update.type);
                                        return (
                                            <div key={j} style={{ display: "flex", gap: 16, alignItems: "flex-start", background: COLORS.surface, padding: "16px 20px", borderRadius: 16, border: `1px solid ${COLORS.border}` }}>
                                                <div style={{ display: "inline-block", background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`, padding: "4px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", marginTop: 2 }}>
                                                    {badge.label}
                                                </div>
                                                <div style={{ fontSize: 15, color: COLORS.text, lineHeight: 1.6 }}>
                                                    {update.text}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <div style={{ textAlign: "center", marginTop: 64, padding: "48px 0", borderTop: `1px solid ${COLORS.border}` }}>
                    <p style={{ color: COLORS.textSecondary, fontSize: 15 }}>
                        Check back often — we ship fast and frequently! 🚀
                    </p>
                </div>
            </div>
        </div>
    );
}
