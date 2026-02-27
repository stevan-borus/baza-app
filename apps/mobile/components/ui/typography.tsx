import React, { PropsWithChildren } from "react";
import Animated, { FadeInLeft } from "react-native-reanimated";
import { Text, YStack } from "tamagui";

type LinkTextProps = React.ComponentProps<typeof Text> & {
  children: React.ReactNode;
};

export function LinkText({ children, ...props }: LinkTextProps) {
  return (
    <Text
      color="$accent1"
      fontSize="$4"
      fontWeight="500"
      py="$2"
      pressStyle={{ opacity: 0.7 }}
      {...props}
    >
      {children}
    </Text>
  );
}

type LabelProps = React.ComponentProps<typeof Text> & {
  children: React.ReactNode;
};

export function Label({ children, ...props }: LabelProps) {
  return (
    <Text fontSize="$5" fontWeight="600" color="$color" {...props}>
      {children}
    </Text>
  );
}

export function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <Animated.View entering={FadeInLeft.duration(400).springify()}>
      <YStack gap="$1">
        <Text color="$color" fontSize="$8" fontWeight="700" letterSpacing={-0.5}>
          {title}
        </Text>
        {subtitle ? (
          <Text color="$color10" fontSize="$3">
            {subtitle}
          </Text>
        ) : null}
      </YStack>
    </Animated.View>
  );
}

export function SectionLabel({ children }: PropsWithChildren) {
  return (
    <Text
      fontSize="$3"
      fontWeight="600"
      color="$color10"
      textTransform="uppercase"
      letterSpacing={0.5}
    >
      {children}
    </Text>
  );
}
