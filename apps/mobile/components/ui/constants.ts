import { Platform } from "react-native";

export const HEADER_HEIGHT = Platform.OS === "ios" ? 44 : 56;
export const TAB_BAR_HEIGHT = Platform.OS === "ios" ? 88 : 64;
