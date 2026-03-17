import type { ExpoConfig } from "expo/config";

const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

const config: ExpoConfig = {
  name: "Rede Verde",
  slug: "redeverde",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "redeverde",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  owner: "sgu_puc-rio",
  ios: {
    bundleIdentifier: "br.pucrio.redeverdeexpo",
    supportsTablet: true,
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        "Sua localizacao e usada para centralizar o mapa e registrar pontos de campo com precisao.",
    },
  },
  android: {
    package: "br.pucrio.redeverdeexpo",
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    permissions: ["ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION"],
    config: googleMapsApiKey
      ? {
          googleMaps: {
            apiKey: googleMapsApiKey,
          },
        }
      : undefined,
  },
  web: {
    output: "server",
    favicon: "./assets/images/favicon.png",
  },
  extra: {
    googleMapsApiKey,
    eas: {
      projectId: "c8318146-479a-4743-826a-474ccca51456",
    },
  },
  plugins: [
    "expo-router",
    "expo-location",
    "expo-image-picker",
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#ffffff",
        dark: {
          backgroundColor: "#000000",
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
};

export default config;
