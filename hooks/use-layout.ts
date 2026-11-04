import { Platform, useWindowDimensions } from "react-native";

export const DESKTOP_MIN_WIDTH = 1024;

/** True on wide web browsers, where the app swaps the bottom tabs for a top bar and uses multi-column screens. */
export function useIsDesktop() {
  const { width } = useWindowDimensions();
  return Platform.OS === "web" && width >= DESKTOP_MIN_WIDTH;
}
