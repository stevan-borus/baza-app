import React, { useEffect } from "react";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Text, YStack } from "tamagui";
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
} from "react-native-reanimated";

export function ListRow({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <YStack py="$3.5">
      <Text fontWeight="500" fontSize="$4" color="$color">
        {title}
      </Text>
      {subtitle ? (
        <Text fontSize="$3" color="$color10" mt="$1">
          {subtitle}
        </Text>
      ) : null}
    </YStack>
  );
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <Animated.View entering={FadeInDown.duration(400).springify()}>
      <YStack
        p="$6"
        rounded={22}
        bg="$color2"
        items="center"
        gap="$3"
      >
        <YStack
          width={56}
          height={56}
          rounded={28}
          bg="$color3"
          items="center"
          justify="center"
        >
          <FontAwesome name="inbox" size={24} color="#9ca3af" />
        </YStack>
        <Text fontSize="$5" fontWeight="600" color="$color" text="center">
          {title}
        </Text>
        {description ? (
          <Text fontSize="$3" color="$color9" text="center">
            {description}
          </Text>
        ) : null}
      </YStack>
    </Animated.View>
  );
}

const AnimatedYStack = Animated.createAnimatedComponent(YStack);

export function ErrorState({ message }: { message: string }) {
  const shakeX = useSharedValue(0);

  useEffect(() => {
    shakeX.value = withSequence(
      withTiming(-6, { duration: 60 }),
      withTiming(6, { duration: 60 }),
      withTiming(-4, { duration: 60 }),
      withTiming(4, { duration: 60 }),
      withTiming(0, { duration: 60 }),
    );
  }, [shakeX]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  return (
    <AnimatedYStack
      p="$4"
      rounded={16}
      bg="$red3"
      items="center"
      gap="$2"
      style={animatedStyle}
    >
      <FontAwesome name="exclamation-circle" size={20} color="#ef4444" />
      <Text color="$red10" fontSize="$3" fontWeight="500" text="center">
        {message}
      </Text>
    </AnimatedYStack>
  );
}
