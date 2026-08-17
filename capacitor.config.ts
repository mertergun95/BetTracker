import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bettracker.app',
  appName: 'BetTracker',
  webDir: 'dist',
  android: {
    // The app is offline-first and stores everything in IndexedDB, so there is
    // no cleartext HTTP traffic to allow.
    allowMixedContent: false,
  },
  server: {
    // Android WebViews reject file:// for some storage APIs; the https scheme
    // gives IndexedDB a stable, secure origin that survives app updates.
    androidScheme: 'https',
  },
};

export default config;
