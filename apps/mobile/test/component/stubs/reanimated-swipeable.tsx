/**
 * Component-test stub for `react-native-gesture-handler/ReanimatedSwipeable`.
 *
 * The real component needs native gesture + reanimated worklets. The stub
 * keeps the contract the inbox relies on — children render in place and the
 * right-action panel is reachable — by mounting `renderRightActions` next to
 * the row. Its delete Pressable carries the same testID either way, so a
 * component test presses the action a real user reaches by swiping. The
 * swipe gesture itself stays covered off-device.
 */
import React from "react";
import { View } from "react-native";

type SwipeableMethods = { close: () => void; openLeft: () => void; openRight: () => void; reset: () => void };

const noopMethods: SwipeableMethods = {
  close: () => {},
  openLeft: () => {},
  openRight: () => {},
  reset: () => {},
};

const noopShared = { value: 0 } as never;

type Props = {
  children?: React.ReactNode;
  renderRightActions?: (
    progress: never,
    translation: never,
    methods: SwipeableMethods,
  ) => React.ReactNode;
};

export default function ReanimatedSwipeable({ children, renderRightActions }: Props) {
  return (
    <View>
      {children}
      {renderRightActions?.(noopShared, noopShared, noopMethods)}
    </View>
  );
}
