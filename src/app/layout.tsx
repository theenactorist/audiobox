import "@mantine/core/styles.css";
import { ColorSchemeScript, MantineProvider, createTheme } from "@mantine/core";
import type { Metadata } from "next";
import { Instrument_Sans } from "next/font/google";
import "./globals.css";

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument-sans",
});

export const metadata: Metadata = {
  title: "AudioBox - High-Fidelity Audio Streaming",
  description: "Professional audio broadcasting platform",
};

import { AuthProvider } from "@/context/AuthContext";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { ThemeToggle } from "@/components/ThemeToggle";

const theme = createTheme({
  primaryColor: 'green',
  colors: {
    green: [
      "#E6F9F0",
      "#C3F0DA",
      "#9EE6C3",
      "#7ADCAE",
      "#56D298",
      "#0FA76A", // Primary shade (index 5)
      "#0D8E5A",
      "#0A754A",
      "#085C3A",
      "#05432A",
    ],
  },
  fontFamily: instrumentSans.style.fontFamily,
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <ColorSchemeScript />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0FA76A" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="AudioBox" />
      </head>
      <body className={instrumentSans.className}>
        <ServiceWorkerRegistration />
        <MantineProvider theme={theme}>
          <AuthProvider>
            <ThemeToggle />
            {children}
          </AuthProvider>
        </MantineProvider>
      </body>
    </html>
  );
}
