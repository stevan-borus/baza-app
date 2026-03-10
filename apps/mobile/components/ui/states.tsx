import React, { useEffect } from "react";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Text, YStack } from "tamagui";
import { DANGER } from "./tokens";
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { GlassCard } from "./glass-card";
import { Button } from "./button";

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

const AnimatedGlassCard = Animated.createAnimatedComponent(GlassCard);

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
    <AnimatedGlassCard
      entering={FadeInDown.duration(400).springify()}
      padding="$6"
      items="center"
      gap="$3"
    >
      <YStack
        width={56}
        height={56}
        rounded={28}
        bg="rgba(255,255,255,0.05)"
        items="center"
        justify="center"
      >
        <FontAwesome name="inbox" size={24} color="rgba(255,255,255,0.3)" />
      </YStack>
      <Text fontSize="$5" fontWeight="600" color="$color" textAlign="center">
        {title}
      </Text>
      {description ? (
        <Text fontSize="$3" color="$color9" textAlign="center">
          {description}
        </Text>
      ) : null}
      {ctaLabel && onCtaPress ? (
        <Button variant="primary" size="small" onPress={onCtaPress} mt="$2">
          {ctaLabel}
        </Button>
      ) : null}
    </AnimatedGlassCard>
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
      <FontAwesome name="exclamation-circle" size={20} color={DANGER} />
      <Text color="$red10" fontSize="$3" fontWeight="500" textAlign="center">
        {message}
      </Text>
    </AnimatedYStack>
  );
}

export function NetworkError({
  onRetry,
}: {
  onRetry?: () => void;
}) {
  return (
    <YStack flex={1} items="center" justify="center" p="$6" gap="$4">
      <YStack
        width={72}
        height={72}
        rounded={36}
        bg="rgba(255,255,255,0.05)"
        items="center"
        justify="center"
      >
        <FontAwesome name="wifi" size={32} color="rgba(255,255,255,0.3)" />
      </YStack>
      <Text fontSize="$5" fontWeight="600" color="$color" textAlign="center">
        No Connection
      </Text>
      <Text fontSize="$3" color="$color9" textAlign="center">
        Check your internet connection and try again.
      </Text>
      {onRetry ? (
        <Button variant="primary" size="default" onPress={onRetry}>
          Retry
        </Button>
      ) : null}
    </YStack>
  );
}
