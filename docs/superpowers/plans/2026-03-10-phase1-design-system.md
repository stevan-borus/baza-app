# Phase 1: Design System & Components — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the foundational design system — color tokens, Tamagui config, and all shared UI components — that every screen in Phases 2-5 depends on.

**Architecture:** Upgrade the existing Tamagui config with new color tokens and media queries. Replace current UI components (Card, Button, Input, Sheet, states) with glass-themed `styled()` equivalents. Add new components (WeekStrip, SessionCard, ProgressRing, StatCard). All components use Tamagui's `styled()` for theme-awareness, compiler optimization, and variant support.

**Tech Stack:** Tamagui 2.0 (styled, animations, Sheet, media queries), react-native-svg, expo-blur, expo-haptics, React Native

**Spec reference:** `docs/superpowers/specs/2026-03-10-ui-redesign-design.md`

---

## Chunk 1: Foundation (Config, Tokens, Dependencies)

### Task 1: Install New Dependencies

**Files:**
- Modify: `apps/mobile/package.json`

- [ ] **Step 1: Install react-native-svg, victory-native, expo-haptics**

```bash
cd apps/mobile && npx expo install react-native-svg victory-native expo-haptics
```

- [ ] **Step 2: Verify installation**

```bash
cd apps/mobile && cat package.json | grep -E "react-native-svg|victory-native|expo-haptics"
```

Expected: All three dependencies listed.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/package.json apps/mobile/bun.lockb
git commit -m "feat: add react-native-svg, victory-native, expo-haptics dependencies"
```

---

### Task 2: Update Tamagui Config — Color Tokens & Media Queries

**Files:**
- Modify: `apps/mobile/tamagui.config.ts`

- [ ] **Step 1: Read the current tamagui.config.ts**

Read `apps/mobile/tamagui.config.ts` to understand the existing theme structure.

- [ ] **Step 2: Replace color palettes and add media queries**

Replace the entire `tamagui.config.ts` with updated config. Key changes:
- Dark palette: new values based on `#0A0F14` background
- Light palette: keep existing but ensure accent colors match
- Accent colors: `#2e5b42` as primary, `#4a8c6b` as light variant
- Add `media` config with breakpoints: `sm` (max 640), `md` (max 1024), `lg` (min 1025)
- Add custom theme tokens for glass surfaces: `glassBg`, `glassBorder`
- Keep existing animations (`bouncy`, `lazy`, `quick`)

The dark palette should produce these key values:
- `background` → `#0A0F14`
- `color` (text) → `rgba(255,255,255,0.9)`
- Accent tokens map to `#2e5b42` family

Add to the `createTamagui` call:
```ts
media: {
  sm: { maxWidth: 640 },
  md: { maxWidth: 1024 },
  lg: { minWidth: 1025 },
},
```

- [ ] **Step 3: Update navigationThemeColors**

Update `navigationThemeColors` to use the new dark background value.

- [ ] **Step 4: Verify app still boots**

```bash
cd apps/mobile && npx expo start --ios --no-dev
```

Manually verify the app launches without crashes. Colors will look different — that's expected.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/tamagui.config.ts
git commit -m "feat: update Tamagui config with new color tokens and media queries"
```

---

### Task 3: Update ScreenContainer for Web Max-Width

**Files:**
- Modify: `apps/mobile/components/ui/screen-container.tsx`

- [ ] **Step 1: Add web max-width constraint**

Update `ScreenContainer` and `ScreenContainerRaw` to constrain content width on larger screens. Use Tamagui's `$lg` media query or a simple `maxWidth` + `alignSelf: 'center'` + `width: '100%'` pattern:

```tsx
import React, { PropsWithChildren } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { YStack } from "tamagui";
import { TAB_BAR_HEIGHT } from "./constants";

export function ScreenContainer({ children }: PropsWithChildren) {
  const insets = useSafeAreaInsets();
  const topPadding = insets.top + 12;

  return (
    <YStack
      flex={1}
      bg="$background"
      items="center"
      style={{ paddingTop: topPadding }}
    >
      <YStack
        width="100%"
        maxWidth={560}
        flex={1}
        px="$5"
        pb={TAB_BAR_HEIGHT + 16}
        gap="$5"
      >
        {children}
      </YStack>
    </YStack>
  );
}

export function ScreenContainerRaw({ children }: PropsWithChildren) {
  const insets = useSafeAreaInsets();
  const topPadding = insets.top + 12;

  return (
    <YStack
      flex={1}
      bg="$background"
      items="center"
      style={{ paddingTop: topPadding, paddingBottom: TAB_BAR_HEIGHT }}
    >
      <YStack width="100%" maxWidth={560} flex={1}>
        {children}
      </YStack>
    </YStack>
  );
}
```

- [ ] **Step 2: Verify screens render correctly on mobile**

```bash
cd apps/mobile && npx expo start --ios
```

Check that existing screens still render correctly — the maxWidth won't kick in on phone widths.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/components/ui/screen-container.tsx
git commit -m "feat: add web max-width constraint to ScreenContainer"
```

---

## Chunk 2: Core Components (GlassCard, Button, Input, Sheet)

### Task 4: Create GlassCard Component

**Files:**
- Create: `apps/mobile/components/ui/glass-card.tsx`

- [ ] **Step 1: Create the GlassCard component**

```tsx
import { Platform } from "react-native";
import { styled, YStack } from "tamagui";

const supportsBlur = Platform.OS === "ios" || Platform.OS === "web";

export const GlassCard = styled(YStack, {
  name: "GlassCard",
  backgroundColor: supportsBlur
    ? "rgba(255,255,255,0.06)"
    : "rgba(20,25,30,0.95)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
  borderRadius: 16,
  padding: "$4",
  overflow: "hidden",

  pressStyle: {
    opacity: 0.8,
  },

  hoverStyle: {
    backgroundColor: supportsBlur
      ? "rgba(255,255,255,0.09)"
      : "rgba(20,25,30,0.98)",
  },

  variants: {
    accentBorder: {
      left: {
        borderLeftWidth: 3,
        borderLeftColor: "$accent1",
      },
      top: {
        borderTopWidth: 3,
        borderTopColor: "$accent1",
      },
    },

    interactive: {
      true: {
        cursor: "pointer",
      },
      false: {
        pressStyle: undefined,
      },
    },

    size: {
      sm: {
        padding: "$3",
        borderRadius: 12,
      },
      md: {
        padding: "$4",
        borderRadius: 16,
      },
      lg: {
        padding: "$5",
        borderRadius: 20,
      },
    },
  } as const,

  defaultVariants: {
    interactive: false,
    size: "md",
  },
});
```

Note: For iOS blur, we'll wrap GlassCard content with `expo-blur`'s `BlurView` in a separate `GlassBlurCard` variant if needed. The base `GlassCard` uses translucent backgrounds which look great without requiring actual blur on every card (blur is expensive). Reserve actual blur for the tab bar and sheets.

- [ ] **Step 2: Verify it renders**

Temporarily import and render `<GlassCard><Text>Test</Text></GlassCard>` in any screen. Confirm it shows translucent card with border.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/components/ui/glass-card.tsx
git commit -m "feat: add GlassCard styled component with variants"
```

---

### Task 5: Rebuild Button with styled()

**Files:**
- Modify: `apps/mobile/components/ui/button.tsx`

- [ ] **Step 1: Rewrite Button using Tamagui styled()**

Replace the existing function-based Button with a `styled()` component:

```tsx
import { styled, Button as TButton, Text } from "tamagui";

export const Button = styled(TButton, {
  name: "Button",
  borderWidth: 0,
  borderRadius: 12,
  fontWeight: "600",
  cursor: "pointer",

  pressStyle: {
    scale: 0.97,
    opacity: 0.9,
  },

  disabledStyle: {
    opacity: 0.4,
  },

  variants: {
    variant: {
      primary: {
        backgroundColor: "$accent1",
        color: "#FFFFFF",
        hoverStyle: {
          backgroundColor: "$accent2",
        },
      },
      secondary: {
        backgroundColor: "rgba(255,255,255,0.06)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
        color: "$color",
        hoverStyle: {
          backgroundColor: "rgba(255,255,255,0.1)",
        },
      },
      danger: {
        backgroundColor: "rgba(196,75,75,0.15)",
        color: "#c44b4b",
        hoverStyle: {
          backgroundColor: "rgba(196,75,75,0.25)",
        },
      },
      ghost: {
        backgroundColor: "transparent",
        color: "$color",
        pressStyle: {
          opacity: 0.65,
        },
        hoverStyle: {
          backgroundColor: "rgba(255,255,255,0.04)",
        },
      },
    },

    size: {
      sm: {
        height: 32,
        paddingHorizontal: "$3",
        fontSize: 13,
        borderRadius: 9,
      },
      md: {
        height: 44,
        paddingHorizontal: "$4",
        fontSize: 15,
        borderRadius: 11,
      },
      lg: {
        height: 52,
        paddingHorizontal: "$5",
        fontSize: 17,
        borderRadius: 12,
      },
    },
  } as const,

  defaultVariants: {
    variant: "primary",
    size: "md",
  },
});

// Convenience aliases for backwards compatibility
export const SecondaryButton = Button.styleable((props, ref) => (
  <Button ref={ref} variant="secondary" {...props} />
));
export const DangerButton = Button.styleable((props, ref) => (
  <Button ref={ref} variant="danger" {...props} />
));
```

- [ ] **Step 2: Check existing Button usages still compile**

```bash
cd apps/mobile && npx tsc --noEmit 2>&1 | head -30
```

Fix any type errors from the API change. The main difference: `variant` and `size` are now Tamagui variant props instead of custom string props. String children should work directly since Tamagui Button handles text.

- [ ] **Step 3: Verify visually**

Boot the app and check a screen that uses Button (e.g., sign-in). Confirm buttons render with the new glass/green styling.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/components/ui/button.tsx
git commit -m "feat: rebuild Button with Tamagui styled() and glass variants"
```

---

### Task 6: Rebuild Input with Glass Style and Floating Labels

**Files:**
- Modify: `apps/mobile/components/ui/input.tsx`

- [ ] **Step 1: Rewrite Input with glass styling and icon prefix support**

```tsx
import React, { useState, useRef } from "react";
import { Pressable, TextInput } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Input as TInput, XStack, YStack, Text, styled, useTheme } from "tamagui";
import { Animated } from "react-native";

const GlassInputFrame = styled(XStack, {
  name: "GlassInputFrame",
  backgroundColor: "rgba(255,255,255,0.06)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
  borderRadius: 11,
  height: 52,
  paddingHorizontal: "$4",
  alignItems: "center",
  gap: "$3",
  cursor: "pointer",

  variants: {
    focused: {
      true: {
        borderColor: "$accent1",
        borderWidth: 2,
        backgroundColor: "rgba(255,255,255,0.08)",
      },
    },
    error: {
      true: {
        borderColor: "#c44b4b",
        borderWidth: 2,
      },
    },
  } as const,
});

type InputProps = {
  icon?: React.ComponentProps<typeof FontAwesome>["name"];
  label?: string;
  error?: string;
} & React.ComponentProps<typeof TInput>;

export function Input({ icon, label, error, onFocus, onBlur, value, ...props }: InputProps) {
  const [focused, setFocused] = useState(false);
  const theme = useTheme();

  return (
    <YStack gap="$1">
      {label ? (
        <Text fontSize={13} fontWeight="500" color="rgba(255,255,255,0.5)" mb="$1">
          {label}
        </Text>
      ) : null}
      <GlassInputFrame focused={focused} error={!!error}>
        {icon ? (
          <FontAwesome
            name={icon}
            size={16}
            color={focused ? theme.accent1?.val : "rgba(255,255,255,0.3)"}
          />
        ) : null}
        <TInput
          unstyled
          flex={1}
          fontSize={15}
          color="rgba(255,255,255,0.9)"
          placeholderTextColor="rgba(255,255,255,0.3)"
          onFocus={(e) => { setFocused(true); onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); onBlur?.(e); }}
          value={value}
          {...props}
        />
      </GlassInputFrame>
      {error ? (
        <Text fontSize={12} color="#c44b4b" mt="$1">
          {error}
        </Text>
      ) : null}
    </YStack>
  );
}

export function PasswordInput(
  props: Omit<InputProps, "secureTextEntry">,
) {
  const [visible, setVisible] = useState(false);
  const theme = useTheme();

  return (
    <Input
      icon="lock"
      secureTextEntry={!visible}
      textContentType="password"
      autoComplete="password"
      {...props}
    >
      {/* Eye toggle is handled via suffix */}
    </Input>
  );
}
```

Note: The PasswordInput needs the eye toggle integrated into the GlassInputFrame. Update the Input component to accept a `suffix` prop:

Add to `InputProps`: `suffix?: React.ReactNode;`
Add in GlassInputFrame, after the TInput: `{suffix}`
PasswordInput passes the eye toggle as suffix.

- [ ] **Step 2: Fix type errors and verify**

```bash
cd apps/mobile && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Visually verify on sign-in screen**

Boot app, navigate to sign-in. Inputs should show glass style with icons.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/components/ui/input.tsx
git commit -m "feat: rebuild Input with glass styling, icon prefix, and label support"
```

---

### Task 7: Restyle AppSheet with Glass Theme

**Files:**
- Modify: `apps/mobile/components/ui/sheet.tsx`

- [ ] **Step 1: Update AppSheet to use glass styling with Tamagui animation**

```tsx
import React, { PropsWithChildren } from "react";
import { Platform } from "react-native";
import { Sheet, Theme } from "tamagui";

export function AppSheet({
  open,
  onOpenChange,
  children,
}: PropsWithChildren<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>) {
  return (
    <Sheet
      modal
      open={open}
      onOpenChange={onOpenChange}
      snapPointsMode="fit"
      dismissOnSnapToBottom
      moveOnKeyboardChange
      animation="bouncy"
    >
      <Sheet.Overlay
        animation="lazy"
        enterStyle={{ opacity: 0 }}
        exitStyle={{ opacity: 0 }}
        opacity={0.6}
        bg="rgba(0,0,0,0.6)"
      />
      <Sheet.Handle
        height={4}
        rounded={999}
        bg="rgba(255,255,255,0.2)"
        opacity={1}
        mx="auto"
        width={36}
        mt="$2"
      />
      <Sheet.Frame
        bg={Platform.OS === "ios" || Platform.OS === "web"
          ? "rgba(12,14,18,0.92)"
          : "rgba(12,14,18,0.98)"}
        borderTopLeftRadius={22}
        borderTopRightRadius={22}
        px="$4"
        pt="$3"
        pb="$8"
        borderTopWidth={1}
        borderColor="rgba(255,255,255,0.08)"
      >
        {children}
      </Sheet.Frame>
    </Sheet>
  );
}
```

Key changes: removed the mounted/useEffect workaround, added `animation="bouncy"` for spring entry, glass-themed colors, removed Theme wrapper (inherits from parent).

- [ ] **Step 2: Verify sheets still work**

Boot app, open any screen that uses a sheet (e.g., calendar session detail). Confirm it opens/closes with spring animation.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/components/ui/sheet.tsx
git commit -m "feat: restyle AppSheet with glass theme and Tamagui bouncy animation"
```

---

## Chunk 3: New Shared Components

### Task 8: Create Badge Component (Extracted from card.tsx)

**Files:**
- Create: `apps/mobile/components/ui/badge.tsx`
- Modify: `apps/mobile/components/ui/card.tsx` (remove Badge export)

- [ ] **Step 1: Create standalone Badge with styled()**

```tsx
import { styled, Text, XStack } from "tamagui";

const BadgeFrame = styled(XStack, {
  name: "Badge",
  paddingHorizontal: "$2.5",
  paddingVertical: "$1",
  borderRadius: 999,
  alignSelf: "flex-start",
  alignItems: "center",

  variants: {
    status: {
      success: { backgroundColor: "rgba(46,91,66,0.2)" },
      warning: { backgroundColor: "rgba(196,148,75,0.2)" },
      danger: { backgroundColor: "rgba(196,75,75,0.2)" },
      info: { backgroundColor: "rgba(255,255,255,0.08)" },
      neutral: { backgroundColor: "rgba(255,255,255,0.06)" },
    },
  } as const,

  defaultVariants: {
    status: "neutral",
  },
});

const BadgeText = styled(Text, {
  name: "BadgeText",
  fontSize: 11,
  fontWeight: "600",

  variants: {
    status: {
      success: { color: "#4a8c6b" },
      warning: { color: "#c4944b" },
      danger: { color: "#c44b4b" },
      info: { color: "rgba(255,255,255,0.7)" },
      neutral: { color: "rgba(255,255,255,0.5)" },
    },
  } as const,

  defaultVariants: {
    status: "neutral",
  },
});

type BadgeProps = {
  children: React.ReactNode;
  status?: "success" | "warning" | "danger" | "info" | "neutral";
};

export function Badge({ children, status = "neutral" }: BadgeProps) {
  return (
    <BadgeFrame status={status}>
      <BadgeText status={status}>{children}</BadgeText>
    </BadgeFrame>
  );
}
```

- [ ] **Step 2: Remove Badge from card.tsx, update imports across codebase**

Search for all files importing `Badge` from `card.tsx` (or `./card`) and update to import from `./badge` (or `@/components/ui/badge`).

```bash
cd apps/mobile && grep -rn "Badge.*from.*card" --include="*.tsx" --include="*.ts"
```

Update each file's import.

- [ ] **Step 3: Verify no broken imports**

```bash
cd apps/mobile && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/components/ui/badge.tsx apps/mobile/components/ui/card.tsx
git add -u  # catch updated imports
git commit -m "feat: extract Badge to standalone styled component with status variants"
```

---

### Task 9: Rebuild StatCard with GlassCard

**Files:**
- Modify: `apps/mobile/components/ui/card.tsx` (update StatCard)

- [ ] **Step 1: Rewrite StatCard using GlassCard**

Update StatCard in `card.tsx` to use GlassCard as base:

```tsx
import { GlassCard } from "./glass-card";
import { Text, YStack } from "tamagui";
import FontAwesome from "@expo/vector-icons/FontAwesome";

export function StatCard({
  label,
  value,
  icon,
  accentColor,
}: {
  label: string;
  value: string | number;
  icon?: React.ComponentProps<typeof FontAwesome>["name"];
  accentColor?: string;
}) {
  return (
    <GlassCard size="sm" gap="$2">
      {icon ? (
        <YStack
          width={34}
          height={34}
          borderRadius={10}
          bg={accentColor ?? "$accent1"}
          items="center"
          justify="center"
        >
          <FontAwesome name={icon} size={16} color="#ffffff" />
        </YStack>
      ) : null}
      <Text fontSize={13} color="rgba(255,255,255,0.5)" fontWeight="500">
        {label}
      </Text>
      <Text fontSize={24} fontWeight="700" color="rgba(255,255,255,0.9)" letterSpacing={-0.3}>
        {String(value)}
      </Text>
    </GlassCard>
  );
}
```

Also remove the old Card component and CalendarPrimitive from this file since they'll be replaced by GlassCard. Keep the file but remove unused exports. Update any existing imports of `Card` to use `GlassCard` instead.

- [ ] **Step 2: Update imports across codebase**

```bash
cd apps/mobile && grep -rn "import.*Card.*from.*ui/card" --include="*.tsx" --include="*.ts"
```

Replace `Card` imports with `GlassCard` from `ui/glass-card` where applicable.

- [ ] **Step 3: Type check**

```bash
cd apps/mobile && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 4: Commit**

```bash
git add -u
git commit -m "feat: rebuild StatCard on GlassCard, migrate Card usages to GlassCard"
```

---

### Task 10: Rebuild EmptyState and ErrorState

**Files:**
- Modify: `apps/mobile/components/ui/states.tsx`

- [ ] **Step 1: Rewrite states with glass theme and CTA support**

```tsx
import React from "react";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Text, YStack } from "tamagui";
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
    <YStack py="$3" borderBottomWidth={1} borderColor="rgba(255,255,255,0.06)">
      <Text fontWeight="500" fontSize={15} color="rgba(255,255,255,0.9)">
        {title}
      </Text>
      {subtitle ? (
        <Text fontSize={13} color="rgba(255,255,255,0.5)" mt="$1">
          {subtitle}
        </Text>
      ) : null}
    </YStack>
  );
}

export function EmptyState({
  title,
  description,
  icon,
  actionLabel,
  onAction,
}: {
  title: string;
  description?: string;
  icon?: React.ComponentProps<typeof FontAwesome>["name"];
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <YStack py="$8" items="center" gap="$3">
      {icon ? (
        <FontAwesome name={icon} size={32} color="rgba(255,255,255,0.2)" />
      ) : null}
      <Text fontSize={17} fontWeight="600" color="rgba(255,255,255,0.5)" textAlign="center">
        {title}
      </Text>
      {description ? (
        <Text fontSize={14} color="rgba(255,255,255,0.3)" textAlign="center" maxWidth={280}>
          {description}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button variant="secondary" size="sm" onPress={onAction} mt="$2">
          {actionLabel}
        </Button>
      ) : null}
    </YStack>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <GlassCard accentBorder="left" borderLeftColor="#c44b4b">
      <YStack gap="$2">
        <Text color="#c44b4b" fontSize={15} fontWeight="500">
          {message}
        </Text>
        {onRetry ? (
          <Button variant="danger" size="sm" onPress={onRetry} alignSelf="flex-start">
            Retry
          </Button>
        ) : null}
      </YStack>
    </GlassCard>
  );
}

export function NetworkError({ onRetry }: { onRetry?: () => void }) {
  return (
    <YStack flex={1} items="center" justify="center" gap="$3" p="$6">
      <FontAwesome name="wifi" size={40} color="rgba(255,255,255,0.2)" />
      <Text fontSize={20} fontWeight="600" color="rgba(255,255,255,0.9)">
        No connection
      </Text>
      <Text fontSize={14} color="rgba(255,255,255,0.5)" textAlign="center">
        Check your internet connection and try again.
      </Text>
      {onRetry ? (
        <Button variant="primary" size="md" onPress={onRetry} mt="$2">
          Try again
        </Button>
      ) : null}
    </YStack>
  );
}
```

- [ ] **Step 2: Update existing usages if EmptyState/ErrorState API changed**

The main change: `EmptyState` now takes optional `icon`, `actionLabel`, `onAction`. Existing usages that pass only `title`/`description` will still work.

```bash
cd apps/mobile && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/components/ui/states.tsx
git commit -m "feat: rebuild EmptyState/ErrorState with glass theme, icons, and CTA support"
```

---

### Task 11: Create ProgressRing Component

**Files:**
- Create: `apps/mobile/components/ui/progress-ring.tsx`

- [ ] **Step 1: Create ProgressRing using react-native-svg**

```tsx
import React from "react";
import { YStack, Text } from "tamagui";
import Svg, { Circle } from "react-native-svg";

type ProgressRingProps = {
  progress: number; // 0-1
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  label?: string;
  sublabel?: string;
};

export function ProgressRing({
  progress,
  size = 100,
  strokeWidth = 8,
  color = "#2e5b42",
  trackColor = "rgba(255,255,255,0.06)",
  label,
  sublabel,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - Math.min(Math.max(progress, 0), 1));

  return (
    <YStack items="center" gap="$2" accessibilityLabel={`${Math.round(progress * 100)}% complete`}>
      <YStack width={size} height={size} items="center" justify="center">
        <Svg width={size} height={size}>
          {/* Track */}
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={trackColor}
            strokeWidth={strokeWidth}
            fill="none"
          />
          {/* Progress */}
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            rotation={-90}
            origin={`${size / 2}, ${size / 2}`}
          />
        </Svg>
        {/* Center text */}
        <YStack position="absolute" items="center">
          <Text fontSize={size * 0.22} fontWeight="700" color="rgba(255,255,255,0.9)">
            {Math.round(progress * 100)}%
          </Text>
        </YStack>
      </YStack>
      {label ? (
        <Text fontSize={15} fontWeight="600" color="rgba(255,255,255,0.9)" textAlign="center">
          {label}
        </Text>
      ) : null}
      {sublabel ? (
        <Text fontSize={13} color="rgba(255,255,255,0.5)" textAlign="center">
          {sublabel}
        </Text>
      ) : null}
    </YStack>
  );
}
```

- [ ] **Step 2: Verify it renders**

Temporarily add `<ProgressRing progress={0.65} label="8 remaining" sublabel="Expires Mar 30" />` to any screen. Confirm SVG ring renders with green arc.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/components/ui/progress-ring.tsx
git commit -m "feat: add ProgressRing SVG component for package visualization"
```

---

### Task 12: Create WeekStrip Component

**Files:**
- Create: `apps/mobile/components/ui/week-strip.tsx`

- [ ] **Step 1: Create WeekStrip with scrollable day pills**

```tsx
import React from "react";
import { ScrollView } from "react-native";
import { styled, Text, XStack, YStack } from "tamagui";
import dayjs from "dayjs";

const DayPill = styled(YStack, {
  name: "DayPill",
  width: 44,
  height: 64,
  borderRadius: 22,
  alignItems: "center",
  justifyContent: "center",
  gap: "$1",
  cursor: "pointer",

  pressStyle: {
    opacity: 0.7,
  },

  variants: {
    selected: {
      true: {
        backgroundColor: "$accent1",
      },
      false: {
        backgroundColor: "transparent",
      },
    },
    today: {
      true: {
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.15)",
      },
    },
  } as const,
});

const ActivityDot = styled(YStack, {
  name: "ActivityDot",
  width: 5,
  height: 5,
  borderRadius: 3,

  variants: {
    type: {
      booked: { backgroundColor: "$accent1" },
      available: { backgroundColor: "rgba(255,255,255,0.2)", borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" },
      none: { backgroundColor: "transparent" },
    },
  } as const,

  defaultVariants: {
    type: "none",
  },
});

type DayActivity = "booked" | "available" | "none";

type WeekStripProps = {
  selectedDate: string; // YYYY-MM-DD
  onSelectDate: (date: string) => void;
  activityByDate?: Record<string, DayActivity>;
  weekStartDate?: string; // YYYY-MM-DD, defaults to current week
};

export function WeekStrip({
  selectedDate,
  onSelectDate,
  activityByDate = {},
  weekStartDate,
}: WeekStripProps) {
  const startOfWeek = weekStartDate
    ? dayjs(weekStartDate).startOf("week")
    : dayjs(selectedDate).startOf("week");

  const days = Array.from({ length: 7 }, (_, i) => {
    const date = startOfWeek.add(i, "day");
    return {
      key: date.format("YYYY-MM-DD"),
      dayName: date.format("dd").charAt(0), // M, T, W, ...
      dayNum: date.format("D"),
      isToday: date.isSame(dayjs(), "day"),
      isSelected: date.format("YYYY-MM-DD") === selectedDate,
      activity: activityByDate[date.format("YYYY-MM-DD")] ?? "none",
    };
  });

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <XStack gap="$2" px="$1" py="$1">
        {days.map((day) => (
          <DayPill
            key={day.key}
            selected={day.isSelected}
            today={!day.isSelected && day.isToday}
            onPress={() => onSelectDate(day.key)}
          >
            <Text
              fontSize={11}
              fontWeight="500"
              color={day.isSelected ? "#FFFFFF" : "rgba(255,255,255,0.4)"}
            >
              {day.dayName}
            </Text>
            <Text
              fontSize={15}
              fontWeight={day.isSelected ? "700" : "500"}
              color={day.isSelected ? "#FFFFFF" : "rgba(255,255,255,0.9)"}
            >
              {day.dayNum}
            </Text>
            <ActivityDot type={day.activity} />
          </DayPill>
        ))}
      </XStack>
    </ScrollView>
  );
}
```

- [ ] **Step 2: Verify it renders**

Temporarily render `<WeekStrip selectedDate={dayjs().format("YYYY-MM-DD")} onSelectDate={() => {}} />` on a screen. Confirm 7 day pills render, today is highlighted.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/components/ui/week-strip.tsx
git commit -m "feat: add WeekStrip shared calendar component with activity dots"
```

---

### Task 13: Create SessionCard Component

**Files:**
- Create: `apps/mobile/components/ui/session-card.tsx`

- [ ] **Step 1: Create SessionCard**

```tsx
import React from "react";
import { Text, XStack, YStack } from "tamagui";
import { GlassCard } from "./glass-card";
import { Badge } from "./badge";

const CLASS_TYPE_COLORS: Record<string, string> = {
  yoga: "#2d8b7a",
  pilates: "#2e5b42",
  hiit: "#c47b4b",
  default: "#2e5b42",
};

type SessionCardProps = {
  time: string; // "10:00 AM"
  className: string;
  trainerName?: string;
  room?: string;
  bookedCount: number;
  capacity: number;
  classType?: string;
  status?: "available" | "booked" | "waitlisted" | "full" | "cancelled";
  onPress?: () => void;
};

export function SessionCard({
  time,
  className,
  trainerName,
  room,
  bookedCount,
  capacity,
  classType,
  status = "available",
  onPress,
}: SessionCardProps) {
  const accentColor = CLASS_TYPE_COLORS[classType?.toLowerCase() ?? "default"] ?? CLASS_TYPE_COLORS.default;
  const spotsLeft = capacity - bookedCount;
  const isFull = spotsLeft <= 0;

  const statusBadge = () => {
    switch (status) {
      case "booked":
        return <Badge status="success">Booked</Badge>;
      case "waitlisted":
        return <Badge status="warning">Waitlisted</Badge>;
      case "cancelled":
        return <Badge status="danger">Cancelled</Badge>;
      case "full":
        return <Badge status="warning">Full</Badge>;
      default:
        return isFull
          ? <Badge status="warning">Full</Badge>
          : <Badge status="success">{spotsLeft}/{capacity} spots</Badge>;
    }
  };

  return (
    <GlassCard
      interactive
      onPress={onPress}
      borderLeftWidth={3}
      borderLeftColor={accentColor}
    >
      <XStack gap="$3" items="center">
        <YStack width={60}>
          <Text fontSize={15} fontWeight="700" color="rgba(255,255,255,0.9)">
            {time}
          </Text>
        </YStack>
        <YStack flex={1} gap="$1">
          <Text fontSize={15} fontWeight="600" color="rgba(255,255,255,0.9)">
            {className}
          </Text>
          {trainerName ? (
            <Text fontSize={13} color="rgba(255,255,255,0.5)">
              {trainerName}
            </Text>
          ) : null}
          {room ? (
            <Text fontSize={12} color="rgba(255,255,255,0.3)">
              {room}
            </Text>
          ) : null}
        </YStack>
        {statusBadge()}
      </XStack>
    </GlassCard>
  );
}
```

- [ ] **Step 2: Verify it renders**

Temporarily render a SessionCard with mock data. Confirm colored left border, time, class info, and badge display correctly.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/components/ui/session-card.tsx
git commit -m "feat: add SessionCard component with class type colors and status badges"
```

---

### Task 14: Create Skeleton Loading Components

**Files:**
- Create: `apps/mobile/components/ui/skeleton.tsx`

- [ ] **Step 1: Create Skeleton components**

```tsx
import React, { useEffect } from "react";
import { styled, YStack, XStack } from "tamagui";
import { Animated, Easing } from "react-native";

const SkeletonBase = styled(YStack, {
  name: "Skeleton",
  backgroundColor: "rgba(255,255,255,0.03)",
  borderRadius: 8,
  overflow: "hidden",
});

function PulsingWrapper({ children }: { children: React.ReactNode }) {
  const opacity = React.useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacity]);

  return <Animated.View style={{ opacity }}>{children}</Animated.View>;
}

export function SkeletonCard() {
  return (
    <PulsingWrapper>
      <SkeletonBase height={80} borderRadius={16} backgroundColor="rgba(255,255,255,0.04)" />
    </PulsingWrapper>
  );
}

export function SkeletonText({ width = "60%" }: { width?: string | number }) {
  return (
    <PulsingWrapper>
      <SkeletonBase height={14} width={width} borderRadius={6} />
    </PulsingWrapper>
  );
}

export function SkeletonStatCard() {
  return (
    <PulsingWrapper>
      <SkeletonBase height={90} borderRadius={16} backgroundColor="rgba(255,255,255,0.04)" />
    </PulsingWrapper>
  );
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <YStack gap="$3">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </YStack>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/components/ui/skeleton.tsx
git commit -m "feat: add Skeleton loading components with pulsing animation"
```

---

### Task 15: Update Segmented Control with Glass Style

**Files:**
- Modify: `apps/mobile/components/ui/bento/segmented-tabs.tsx`

- [ ] **Step 1: Update glass styling**

```tsx
import React from "react";
import { Tabs, Text } from "tamagui";

type BentoSegmentedTabsProps<T extends string> = {
  segments: Array<{ value: T; label: string }>;
  value: T;
  onValueChange: (value: T) => void;
  fullWidth?: boolean;
};

export function BentoSegmentedTabs<T extends string>({
  segments,
  value,
  onValueChange,
  fullWidth = true,
}: BentoSegmentedTabsProps<T>) {
  return (
    <Tabs
      value={value}
      onValueChange={(next) => onValueChange(next as T)}
      orientation="horizontal"
    >
      <Tabs.List
        bg="rgba(255,255,255,0.04)"
        borderWidth={1}
        borderColor="rgba(255,255,255,0.06)"
        rounded={12}
        p="$1"
      >
        {segments.map((segment) => {
          const isActive = segment.value === value;
          return (
            <Tabs.Tab
              key={segment.value}
              value={segment.value}
              bg={isActive ? "rgba(255,255,255,0.1)" : "transparent"}
              rounded={10}
              py="$2"
              px={fullWidth ? "$3" : "$2.5"}
              flex={fullWidth ? 1 : undefined}
              minWidth={fullWidth ? undefined : 88}
              flexShrink={0}
              cursor="pointer"
              hoverStyle={{
                bg: isActive ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.04)",
              }}
            >
              <Text
                fontSize={fullWidth ? 13 : 11}
                fontWeight={isActive ? "600" : "400"}
                color={isActive ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.5)"}
              >
                {segment.label}
              </Text>
            </Tabs.Tab>
          );
        })}
      </Tabs.List>
    </Tabs>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/components/ui/bento/segmented-tabs.tsx
git commit -m "feat: update SegmentedControl with glass theme styling"
```

---

### Task 16: Create Component Index and Update Typography

**Files:**
- Create: `apps/mobile/components/ui/index.ts`
- Modify: `apps/mobile/components/ui/typography.tsx`

- [ ] **Step 1: Update typography with spec values**

```tsx
import React, { PropsWithChildren } from "react";
import { Text, YStack } from "tamagui";

export function LinkText({ children, ...props }: React.ComponentProps<typeof Text> & { children: React.ReactNode }) {
  return (
    <Text
      color="$accent1"
      fontSize={15}
      fontWeight="500"
      py="$2"
      cursor="pointer"
      pressStyle={{ opacity: 0.7 }}
      hoverStyle={{ opacity: 0.8 }}
      {...props}
    >
      {children}
    </Text>
  );
}

export function Label({ children, ...props }: React.ComponentProps<typeof Text> & { children: React.ReactNode }) {
  return (
    <Text fontSize={15} fontWeight="600" color="rgba(255,255,255,0.9)" {...props}>
      {children}
    </Text>
  );
}

export function ScreenTitle({ children, ...props }: React.ComponentProps<typeof Text> & { children: React.ReactNode }) {
  return (
    <Text fontSize={28} fontWeight="800" color="rgba(255,255,255,0.9)" letterSpacing={-0.5} {...props}>
      {children}
    </Text>
  );
}

export function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <YStack gap="$1">
      <Text color="rgba(255,255,255,0.9)" fontSize={20} fontWeight="700" letterSpacing={-0.3}>
        {title}
      </Text>
      {subtitle ? (
        <Text color="rgba(255,255,255,0.5)" fontSize={14}>
          {subtitle}
        </Text>
      ) : null}
    </YStack>
  );
}

export function SectionLabel({ children }: PropsWithChildren) {
  return (
    <Text fontSize={12} fontWeight="600" color="rgba(255,255,255,0.4)" textTransform="uppercase" letterSpacing={0.5}>
      {children}
    </Text>
  );
}
```

- [ ] **Step 2: Create barrel export index**

```ts
// apps/mobile/components/ui/index.ts
export { GlassCard } from "./glass-card";
export { Button, SecondaryButton, DangerButton } from "./button";
export { Input, PasswordInput } from "./input";
export { Badge } from "./badge";
export { StatCard } from "./card";
export { AppSheet } from "./sheet";
export { EmptyState, ErrorState, NetworkError, ListRow } from "./states";
export { ProgressRing } from "./progress-ring";
export { WeekStrip } from "./week-strip";
export { SessionCard } from "./session-card";
export { SkeletonCard, SkeletonText, SkeletonStatCard, SkeletonList } from "./skeleton";
export { ScreenContainer, ScreenContainerRaw } from "./screen-container";
export { ActionButton } from "./action-button";
export { AppTabs, SegmentedControl } from "./tabs";
export { LinkText, Label, ScreenTitle, SectionHeader, SectionLabel } from "./typography";
```

- [ ] **Step 3: Type check everything**

```bash
cd apps/mobile && npx tsc --noEmit 2>&1 | head -50
```

Fix any remaining type errors.

- [ ] **Step 4: Visual smoke test**

```bash
cd apps/mobile && npx expo start --ios
```

Navigate through all existing screens. Verify:
- App boots without crashes
- Colors are updated (darker backgrounds, green accents)
- Existing screens may look rough (they'll be fully redesigned in later phases) but should not crash

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/components/ui/typography.tsx apps/mobile/components/ui/index.ts
git commit -m "feat: update typography with spec values, add component barrel export"
```

---

## Summary

After Phase 1, the following are ready for Phases 2-5:
- **Tamagui config** with new color tokens, media queries (already had compiler plugins wired)
- **GlassCard** — base container for everything
- **Button** — styled() with variant/size props
- **Input** — glass style with icon prefix and label
- **AppSheet** — glass themed with bouncy animation
- **Badge** — status variants (success/warning/danger/info/neutral)
- **StatCard** — built on GlassCard
- **EmptyState/ErrorState/NetworkError** — with icons and CTAs
- **ProgressRing** — SVG circular progress
- **WeekStrip** — shared calendar week component
- **SessionCard** — with class type colors and status badges
- **Skeleton** — loading placeholders
- **SegmentedControl** — glass styled
- **Typography** — ScreenTitle, SectionHeader, Label, etc.
- **ScreenContainer** — web max-width support
- **Barrel export** — `components/ui/index.ts`
