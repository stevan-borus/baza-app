import React, { useEffect } from "react";
import { View, Text } from "react-native";
import { Icon } from "@/components/ui/icon";
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { Button } from "./button";
import { useThemeTokens } from "./tokens";

export function ListRow({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <View className="py-3.5">
      <Text className="font-body-medium text-lg text-foreground">{title}</Text>
      {subtitle ? (
        <Text className="text-base mt-1 text-muted">{subtitle}</Text>
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
  const tokens = useThemeTokens();
  return (
    <AnimatedView
      entering={FadeInDown.duration(400).springify()}
      className="p-6 rounded-2xl items-center gap-3"
    >
      <View className="w-14 h-14 rounded-full items-center justify-center bg-glass">
        <Icon name="inbox" size={24} color={tokens.faint} />
      </View>
      <Text className="font-body-semibold text-xl text-center text-foreground">
        {title}
      </Text>
      {description ? (
        <Text className="text-base text-center text-muted">{description}</Text>
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

export function ErrorState({
  message,
  testID,
}: {
  message: string;
  testID?: string;
}) {
  const tokens = useThemeTokens();
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
      testID={testID}
      style={animatedStyle}
      className="p-4 rounded-2xl items-center gap-2 flex-row bg-danger-soft"
    >
      <Icon name="exclamation-circle" size={20} color={tokens.danger} />
      <Text className="font-body-medium text-base text-center flex-1 text-danger">
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
  const tokens = useThemeTokens();
  return (
    <View className="flex-1 items-center justify-center p-6 gap-4">
      <View className="w-18 h-18 rounded-full items-center justify-center bg-glass">
        <Icon name="wifi" size={32} color={tokens.faint} />
      </View>
      <Text className="font-body-semibold text-xl text-center text-foreground">
        No Connection
      </Text>
      <Text className="text-base text-center text-muted">
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
