import React, { PropsWithChildren } from "react";
import { Text, View } from "react-native";
import Animated, { FadeInLeft } from "react-native-reanimated";

type LinkTextProps = React.ComponentProps<typeof Text> & {
  children: React.ReactNode;
};

export function LinkText({ children, className, style, color, fontSize, ...props }: LinkTextProps & { color?: string; fontSize?: string | number }) {
  return (
    <Text
      className={`text-accent font-medium py-2 ${className ?? ""}`}
      style={[
        fontSize ? { fontSize: typeof fontSize === 'string' && fontSize.startsWith('$') ? 14 : fontSize } : {},
        color ? { color } : {},
        style
      ]}
      {...props}
    >
      {children}
    </Text>
  );
}

type LabelProps = React.ComponentProps<typeof Text> & {
  children: React.ReactNode;
};

export function Label({ children, className, style, ...props }: LabelProps) {
  return (
    <Text className={`text-base font-semibold text-foreground ${className ?? ""}`} {...props}>
      {children}
    </Text>
  );
}

export function ScreenTitle({ children, className, style, ...props }: PropsWithChildren & React.ComponentProps<typeof Text>) {
  return (
    <Text
      className={`text-[28px] font-bold text-foreground tracking-tight ${className ?? ""}`}
      style={[{ letterSpacing: -0.5 }, style]}
      {...props}
    >
      {children}
    </Text>
  );
}

export function SectionHeader({
  title,
  subtitle,
  className,
}: {
  title: string;
  subtitle?: string;
  className?: string;
}) {
  return (
    <Animated.View entering={FadeInLeft.duration(400).springify()}>
      <View className={`gap-1 ${className ?? ""}`}>
        <Text className="text-base font-semibold text-foreground">
          {title}
        </Text>
        {subtitle ? (
          <Text className="text-sm text-muted">
            {subtitle}
          </Text>
        ) : null}
      </View>
    </Animated.View>
  );
}

export function SectionLabel({ children, className, style, ...props }: PropsWithChildren & React.ComponentProps<typeof Text>) {
  return (
    <Text
      className={`text-xs font-semibold text-muted uppercase tracking-wider ${className ?? ""}`}
      style={[{ letterSpacing: 0.5 }, style]}
      {...props}
    >
      {children}
    </Text>
  );
}
