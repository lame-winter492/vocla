import type { CapacitorConfig } from "@capacitor/cli";

// iOS app wrapper. Change `appId` to your own reverse-domain identifier before publishing
// (it must match the bundle identifier registered in your Apple Developer account).
const config: CapacitorConfig = {
  appId: "app.vocla.ios",
  appName: "Vocla",
  webDir: "dist",
  backgroundColor: "#0f1115",
  ios: {
    // let the page lay itself out under the status bar / home indicator using safe-area insets
    contentInset: "never",
    backgroundColor: "#0f1115",
    // the app shell scrolls its own panes; the web view itself shouldn't rubber-band like a web page
    scrollEnabled: false,
    // swipe-back is handled in-app
    allowsLinkPreview: false,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false, // hidden once the collection has loaded
      backgroundColor: "#0f1115",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK", // light text on the dark app
      overlaysWebView: true,
    },
  },
};

export default config;
