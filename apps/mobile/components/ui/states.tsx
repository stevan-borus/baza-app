import React, { useEffect } from "react";
import { View, Text } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { Button } from "./button";

export function ListRow({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <View className="py-3.5">
      <Text className="text-foreground font-medium text-lg">{title}</Text>
      {subtitle ? (
        <Text className="text-muted text-base mt-1">{subtitle}</Text>
      ) : null}
    </View>
  );
}

const AnimatedView = Animated.createAnimatedComponent(View);

export function EmptyState({
  title,
  description,
  ctaLabel,
  onCtaPress,
}: {
  title: string;
  description?: string;
  ctaLabel?: string;
  onCtaPress?: () => void;
}) {
  return (
    <AnimatedView
      entering={FadeInDown.duration(400).springify()}
      className="p-6 rounded-2xl items-center gap-3"
    >
      <View className="w-14 h-14 rounded-full bg-glass items-center justify-center">
        <FontAwesome name="inbox" size={24} color="rgba(255,255,255,0.3)" />
      </View>
      <Text className="text-foreground font-semibold text-xl text-center">
        {title}
      </Text>
      {description ? (
        <Text className="text-muted text-base text-center">{description}</Text>
      ) : null}
      {ctaLabel && onCtaPress ? (
        <View className="mt-2">
          <Button variant="primary" size="small" onPress={onCtaPress}>
            {ctaLabel}
          </Button>
        </View>
      ) : null}
    </AnimatedView>
  );
}

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
    <AnimatedView
      style={animatedStyle}
      className="p-4 rounded-2xl bg-danger-soft items-center gap-2 flex-row"
    >
      <FontAwesome name="exclamation-circle" size={20} color="#ef4444" />
      <Text className="text-danger font-medium text-base text-center flex-1">
        {message}
      </Text>
    </AnimatedView>
  );
}

export function NetworkError({
  onRetry,
}: {
  onRetry?: () => void;
}) {
  return (
    <View className="flex-1 items-center justify-center p-6 gap-4">
      <View className="w-18 h-18 rounded-full bg-glass items-center justify-center">
        <FontAwesome name="wifi" size={32} color="rgba(255,255,255,0.3)" />
      </View>
      <Text className="text-foreground font-semibold text-xl text-center">
        No Connection
      </Text>
      <Text className="text-muted text-base text-center">
        Check your internet connection and try again.
      </Text>
      {onRetry ? (
        <Button variant="primary" size="default" onPress={onRetry}>
          Retry
        </Button>
      ) : null}
    </View>
  );
}
