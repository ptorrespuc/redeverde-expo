import Constants from "expo-constants";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";

let isGoogleMapsConfigured = false;

function getGoogleMapsApiKey() {
  const fromExtra =
    typeof Constants.expoConfig?.extra?.googleMapsApiKey === "string"
      ? Constants.expoConfig.extra.googleMapsApiKey.trim()
      : "";
  const fromEnv = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? "";

  return fromExtra || fromEnv;
}

export async function loadGoogleMapsLibraries() {
  const apiKey = getGoogleMapsApiKey();

  if (!apiKey) {
    throw new Error("Defina EXPO_PUBLIC_GOOGLE_MAPS_API_KEY para carregar o Google Maps.");
  }

  if (!isGoogleMapsConfigured) {
    setOptions({
      key: apiKey,
      language: "pt-BR",
      region: "BR",
    });

    isGoogleMapsConfigured = true;
  }

  const { Map } = (await importLibrary("maps")) as google.maps.MapsLibrary;

  return { Map };
}
