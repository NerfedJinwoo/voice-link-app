import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.a7ef990277cb54aa4b3b0d2e2cbbba45e',
  appName: 'voice-link-app',
  webDir: 'dist',
  server: {
    url: 'https://7ef99027-7cb5-4aa4-b3b0-d2e2cbbba45e.lovableproject.com?forceHideBadge=true',
    cleartext: true
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"]
    }
  }
};

export default config;