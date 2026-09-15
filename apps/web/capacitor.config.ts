import type { CapacitorConfig } from "@capacitor/cli";

// CAP_DEV_SERVER_URL opts into Capacitor live-reload against a local Vite dev
// server (e.g. http://10.0.2.2:5173 for the Android emulator, which routes
// that address to the host machine's localhost) instead of the assets
// bundled at build time. Unset in every real build — leaves androidScheme/
// iosScheme's https://localhost origin untouched, so this must never be set
// for a release build.
const devServerUrl = process.env.CAP_DEV_SERVER_URL;

const config: CapacitorConfig = {
  appId: "com.develophys.zelo",
  appName: "Zelo",
  webDir: "dist",
  backgroundColor: "#f2f5f3",
  server: {
    androidScheme: "https",
    iosScheme: "https",
    ...(devServerUrl ? { url: devServerUrl, cleartext: true } : {}),
  },
};

export default config;
