import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const STORAGE_KEY = "redeverde.active-group-filter";

async function getWebStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

export async function loadGroupSelection() {
  if (Platform.OS === "web") {
    const storage = await getWebStorage();
    return storage?.getItem(STORAGE_KEY) ?? null;
  }

  return AsyncStorage.getItem(STORAGE_KEY);
}

export async function saveGroupSelection(value: string) {
  if (Platform.OS === "web") {
    const storage = await getWebStorage();
    storage?.setItem(STORAGE_KEY, value);
    return;
  }

  await AsyncStorage.setItem(STORAGE_KEY, value);
}

export async function clearGroupSelection() {
  if (Platform.OS === "web") {
    const storage = await getWebStorage();
    storage?.removeItem(STORAGE_KEY);
    return;
  }

  await AsyncStorage.removeItem(STORAGE_KEY);
}
