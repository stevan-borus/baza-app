/**
 * Uniwind wrappers for third-party components.
 *
 * Uniwind's Metro resolver only rewrites the literal `import ... from "react-native"`
 * — anything from another package silently drops `className` at runtime.
 *
 * Every third-party component we pass `className` to must be wrapped with
 * `withUniwind` so the className prop is translated to real styles.
 *
 * Import these wrapped versions from `@/components/ui/styled` instead of the
 * original packages when you need className support.
 */
import { withUniwind } from "uniwind";
import { SafeAreaView as RNSafeAreaView } from "react-native-safe-area-context";
import { MotiView as RawMotiView, MotiText as RawMotiText } from "moti";
import {
  BottomSheetView as RawBottomSheetView,
  BottomSheetScrollView as RawBottomSheetScrollView,
} from "@gorhom/bottom-sheet";

export const SafeAreaView = withUniwind(RNSafeAreaView);
export const MotiView = withUniwind(RawMotiView);
export const MotiText = withUniwind(RawMotiText);
export const BottomSheetView = withUniwind(RawBottomSheetView);
export const BottomSheetScrollView = withUniwind(RawBottomSheetScrollView);
