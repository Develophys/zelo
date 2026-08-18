import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.develophys.zelo",
  appName: "Zelo",
  webDir: "dist",
  backgroundColor: "#f2f5f3",
  server: {
    androidScheme: "https",
    iosScheme: "https",
  },
};

export default config;
