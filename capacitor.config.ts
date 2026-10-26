import type { CapacitorConfig } from "@capacitor/cli";

const devServerUrl = process.env.CAPACITOR_DEV_SERVER_URL?.trim();

const config: CapacitorConfig = {
  appId: "com.matchanimal.app",
  appName: "MatchAnimal",
  webDir: "apps/web/out",
  server: devServerUrl
    ? { url: devServerUrl, cleartext: devServerUrl.startsWith("http://") }
    : undefined,
  plugins: {
    CapacitorCookies: { enabled: true },
  },
};

export default config;
