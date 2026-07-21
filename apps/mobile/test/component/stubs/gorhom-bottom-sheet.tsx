/**
 * Component-test stub for `@gorhom/bottom-sheet`.
 *
 * The real package needs gesture-handler + reanimated (Metro-only native
 * deep-imports). This stub keeps the modal CONTRACT AppSheet relies on —
 * an imperative ref with `present()`/`dismiss()`, children mounted only
 * while presented, `onDismiss` fired on teardown — and none of the
 * gesture/animation chrome. Sheet mechanics stay covered by e2e.
 */
import React, {
  forwardRef,
  useImperativeHandle,
  useState,
} from "react";
import { ScrollView, TextInput, View } from "react-native";

export type BottomSheetBackdropProps = Record<string, unknown>;

// No index signature: forwardRef's PropsWithoutRef collapses named props to
// `unknown` when one is present. AppSheet's extra modal props flow through at
// runtime regardless; the stub only reads these two.
type ModalProps = {
  children?: React.ReactNode;
  onDismiss?: () => void;
};

export type BottomSheetModal = {
  present: () => void;
  dismiss: () => void;
};

export const BottomSheetModal = forwardRef<BottomSheetModal, ModalProps>(
  function BottomSheetModal({ children, onDismiss }, ref) {
    const [presented, setPresented] = useState(false);
    useImperativeHandle(ref, () => ({
      present: () => setPresented(true),
      dismiss: () => {
        setPresented(false);
        onDismiss?.();
      },
    }));
    return presented ? <View testID="stub-bottom-sheet">{children}</View> : null;
  },
);

export function BottomSheetBackdrop(_props: Record<string, unknown>) {
  return null;
}

export function BottomSheetModalProvider({
  children,
}: {
  children?: React.ReactNode;
}) {
  return <>{children}</>;
}

export function BottomSheetView({
  children,
  ...rest
}: { children?: React.ReactNode } & Record<string, unknown>) {
  return <View {...rest}>{children}</View>;
}

export function BottomSheetScrollView({
  children,
  ...rest
}: { children?: React.ReactNode } & Record<string, unknown>) {
  return <ScrollView {...rest}>{children}</ScrollView>;
}

export const BottomSheetTextInput = TextInput;

export function useBottomSheetTimingConfigs<T>(configs: T): T {
  return configs;
}
