import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.a7ef990277cb54aa4b3b0d2e2cbbba45e',
  appName: 'voice-link-app',
  webDir: 'dist',
  
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"]
    }
  }
};

export default config;
