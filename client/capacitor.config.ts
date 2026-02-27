import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'org.wearethenew.audiobox',
  appName: 'AudioBox Studio',
  webDir: 'dist',
  server: {
    // Load the app from the production server so API calls, WebSockets,
    // and listener URLs all work correctly in the native wrapper.
    url: 'https://audiobox.wearethenew.org',
    cleartext: false
  },
  android: {
    // Allow mixed content for development
    allowMixedContent: false
  }
};

export default config;
