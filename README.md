# Audio Livestream

A high-fidelity audio streaming platform built with [Next.js](https://nextjs.org) and WebRTC for professional audio broadcasting directly from your browser.

## Features

- **High-quality audio broadcasting** with real-time WebRTC streaming
- **Audio visualization** with waveform display
- **Multiple microphone support** with device selection
- **Broadcast history** tracking with listener statistics
- **Background playback** support on mobile devices
- **Responsive design** with Mantine UI components

## Getting Started

First, ensure you have Node.js installed. Then:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### Starting the Signaling Server

In a separate terminal:

```bash
cd server
npm install
node server.js
```

The signaling server runs on port 3001 by default.

## Configuration

Create a `.env.local` file in the root directory:

```env
NEXT_PUBLIC_SIGNALING_URL=http://localhost:3001
```

For production deployments, set this to your production signaling server URL.

## Project Structure

- `/src/app` - Next.js app router pages
- `/src/components` - React components
- `/src/lib` - Utility hooks and helpers
- `/src/context` - React context for state management
- `/server` - Node.js signaling server
- `/public` - Static assets

## Development

The project uses:
- **Next.js 16** - React framework
- **React 19** - UI library
- **Mantine UI** - Component library
- **Socket.io** - WebRTC signaling
- **TypeScript** - Type safety
- **WebRTC** - Audio streaming

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [WebRTC API](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)
- [Socket.io Documentation](https://socket.io/docs/)
