# Uniwind Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Tamagui with Uniwind + Moti + @gorhom/bottom-sheet across the mobile app with zero visual regression. This is a pure migration — no redesign, no new screens. Screen redesigns happen in `2026-04-23-screen-redesign.md` after this plan completes.

**Architecture:** One-commit mechanical port. Remove Tamagui babel/metro plugins and tamagui.config.ts. Add Uniwind Metro plugin, Tailwind config, and `global.css` with `@theme` tokens. Rewrite all 45 Tamagui-importing files to use `className` (Uniwind) + `View`/`Text`/`Pressable` from React Native. Replace the custom `AppSheet` with `@gorhom/bottom-sheet`. Replace `react-native-reanimated` `FadeIn`/`FadeInDown` usages in auth screens with Moti. Everything visual stays byte-identical: same colors, radii, paddings, blur intensity, haptic calls. This plan produces a runnable, visually unchanged app on Uniwind.

**Tech Stack:** Uniwind v1 (free tier), Moti 0.30+, @gorhom/bottom-sheet 5.x, Reanimated 4 (keep), expo-blur (keep), expo-haptics (keep), react-native-svg (keep), victory-native (keep). Remove: `tamagui`, `@tamagui/*` (all 12 packages), `@tamagui/native/setup-zeego` side-effect import.

**Working directory:** `/Users/stevanborus/Desktop/baza-app/.claude/worktrees/new-ui`

**Package manager:** pnpm. Run commands from `apps/mobile/` unless noted.

---

## File Structure

### New files (to create)

- `apps/mobile/tailwind.config.js` — Tailwind v4 config (content paths, theme extensions)
- `apps/mobile/global.css` — `@theme` block mapping our design tokens to Tailwind CSS variables
- `apps/mobile/nativewind-env.d.ts` — wait, this is Uniwind — use `apps/mobile/uniwind-env.d.ts` for `className` type augmentation
- `apps/mobile/components/ui/app-text.tsx` — thin `Text` wrapper applying the Inter font + base color, so we don't have to repeat it on every `<Text>`
- `apps/mobile/components/ui/pressable-card.tsx` — `Pressable` with haptic feedback on press (replaces Tamagui's `pressStyle={{ scale: 0.97 }}` + explicit haptic calls in `Button`)

### Files to delete

- `apps/mobile/tamagui.config.ts`
- `apps/mobile/components/ui/sheet.tsx` (replaced by gorhom-based wrapper below)

### Files to replace wholesale

- `apps/mobile/babel.config.js` — remove Tamagui plugin
- `apps/mobile/metro.config.js` — remove Tamagui plugin, add Uniwind plugin
- `apps/mobile/app/_layout.tsx` — remove Tamagui Provider chain, remove zeego setup import, keep navigation theme wiring
- `apps/mobile/components/ui/glass-card.tsx` — port to `View` + classes + BlurView child
- `apps/mobile/components/ui/button.tsx` — port to `Pressable` + classes, keep haptic
- `apps/mobile/components/ui/input.tsx` — port to `TextInput` + classes
- `apps/mobile/components/ui/badge.tsx` — port to `Text` + classes
- `apps/mobile/components/ui/session-card.tsx` — port to `View` + `GlassCard`
- `apps/mobile/components/ui/week-strip.tsx` — port to `Pressable` rows
- `apps/mobile/components/ui/progress-ring.tsx` — SVG stays the same, only wrapper classes change
- `apps/mobile/components/ui/screen-container.tsx` — `View` + classes, keep SafeArea handling
- `apps/mobile/components/ui/states.tsx` (EmptyState, ErrorState, ListRow) — port
- `apps/mobile/components/ui/typography.tsx` (SectionLabel, LinkText, etc.) — port
- `apps/mobile/components/ui/tabs.tsx` — port
- `apps/mobile/components/ui/action-button.tsx` — port (FAB)
- `apps/mobile/components/ui/skeleton.tsx` — Moti for pulse animation
- `apps/mobile/components/ui/sheet.tsx` → rewrite to `@gorhom/bottom-sheet` wrapper named `AppSheet` (same public API: `open`, `onOpenChange`, children)
- `apps/mobile/components/ui/card.tsx`, `bento/`, `date-time-picker.tsx` — audit and port
- `apps/mobile/components/auth/auth-background.tsx` — port, keep LinearGradient
- `apps/mobile/components/client/onboarding-checklist.tsx` — port
- All 9 screens under `app/(client|trainer|admin)/` — port JSX (YStack/XStack → View, `bg="$accent1"` → `bg-accent`, etc.)
- `app/sign-in.tsx`, `app/reset-password.tsx` — port, replace `Animated.View + FadeIn/FadeInDown` with `MotiView`
- `app/accept-invite.tsx` if present — port

### Design token mapping

All Tamagui tokens map 1:1 to Tailwind utilities defined in `global.css`:

| Tamagui | Uniwind class | CSS var |
|---|---|---|
| `$background` (dark #0A0F14) | `bg-background` | `--color-background: #0A0F14` |
| `$color` | `text-foreground` | `--color-foreground: rgba(255,255,255,0.9)` |
| `$color9` (secondary text) | `text-muted` | `--color-muted: rgba(255,255,255,0.5)` |
| `$color11` / pure white | `text-white` | Tailwind default |
| `$accent1` | `bg-accent` / `text-accent` | `--color-accent: #2e5b42` |
| `$red3`/`$red10` | `bg-danger-soft` / `text-danger` | `--color-danger: #ef4444` |
| GLASS_BG | `bg-glass` | `--color-glass: rgba(255,255,255,0.05)` |
| GLASS_BORDER | `border-glass` | `--color-glass-border: rgba(255,255,255,0.08)` |
| `$1..$10` spacing (Tamagui = 4,8,12,16,20,24,28,32,36,40) | `1,2,3,4,5,6,7,8,9,10` (Tailwind = 4,8,12,16,20,24,28,32,36,40) | Same values, same keys — no translation needed |
| `rounded={16}` | `rounded-2xl` (16px) | Tailwind default |
| `rounded={22}` | `rounded-[22px]` | arbitrary |
| `borderRadius: 12` | `rounded-xl` | Tailwind default (12px) |
| Inter font (loaded via `expo-font` already) | `font-sans` in tailwind config → `'Inter'` | `--font-sans: 'Inter'` |

**Spacing is identical** between Tamagui's `$N` scale and Tailwind's `N` scale (both are multiples of 4). So `gap="$3"` → `gap-3`, `p="$4"` → `p-4`, `mt="$6"` → `mt-6`. This is a mechanical replace.

---

## Task 1: Install Uniwind + dependencies

**Files:**
- Modify: `apps/mobile/package.json`
- Modify: repository root `pnpm-lock.yaml` (auto)

- [ ] **Step 1: Install Uniwind, Tailwind v4, Moti, gorhom bottom sheet**

Run from `apps/mobile/`:
```bash
pnpm add uniwind tailwindcss@next @tailwindcss/postcss moti @gorhom/bottom-sheet
```

Expected: packages added to `apps/mobile/package.json` dependencies, lockfile updates.

- [ ] **Step 2: Verify install**

Run from `apps/mobile/`:
```bash
pnpm list uniwind moti @gorhom/bottom-sheet tailwindcss
```

Expected: all four packages print with version numbers.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/package.json pnpm-lock.yaml
git commit -m "chore: install uniwind, moti, gorhom bottom-sheet"
```

---

## Task 2: Create Tailwind config and global.css

**Files:**
- Create: `apps/mobile/tailwind.config.js`
- Create: `apps/mobile/global.css`
- Create: `apps/mobile/uniwind-env.d.ts`

- [ ] **Step 1: Create tailwind.config.js**

Write `apps/mobile/tailwind.config.js`:
```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  presets: [require("uniwind/preset")],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 2: Create global.css**

Write `apps/mobile/global.css`:
```css
@import "tailwindcss";

@theme {
  /* Surfaces */
  --color-background: #0A0F14;
  --color-surface: hsla(210, 15%, 11%, 1);
  --color-surface-2: hsla(210, 12%, 15%, 1);

  /* Text */
  --color-foreground: rgba(255, 255, 255, 0.9);
  --color-muted: rgba(255, 255, 255, 0.5);
  --color-faint: rgba(255, 255, 255, 0.3);

  /* Glass */
  --color-glass: rgba(255, 255, 255, 0.05);
  --color-glass-strong: rgba(255, 255, 255, 0.08);
  --color-glass-border: rgba(255, 255, 255, 0.08);
  --color-glass-android: rgba(20, 25, 30, 0.95);

  /* Brand */
  --color-accent: #2e5b42;
  --color-accent-soft: hsla(151, 33%, 27%, 0.15);
  --color-accent-light: #4a8c6b;

  /* Status */
  --color-danger: #ef4444;
  --color-danger-soft: rgba(239, 68, 68, 0.12);
  --color-warning: #f59e0b;
  --color-warning-soft: rgba(245, 158, 11, 0.12);
  --color-success: #22c55e;
  --color-success-soft: rgba(34, 197, 94, 0.12);

  /* Typography */
  --font-sans: "Inter", system-ui, sans-serif;
}
```

- [ ] **Step 3: Create type augmentation**

Write `apps/mobile/uniwind-env.d.ts`:
```ts
/// <reference types="uniwind/types" />
```

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/tailwind.config.js apps/mobile/global.css apps/mobile/uniwind-env.d.ts
git commit -m "chore: add tailwind config and design tokens"
```

---

## Task 3: Wire Uniwind into Metro, remove Tamagui plugins

**Files:**
- Modify: `apps/mobile/metro.config.js`
- Modify: `apps/mobile/babel.config.js`

- [ ] **Step 1: Replace metro.config.js**

Write `apps/mobile/metro.config.js`:
```js
const { getDefaultConfig } = require("expo/metro-config");
const { withUniwind } = require("uniwind/metro");

const config = getDefaultConfig(__dirname);
config.resolver.unstable_enablePackageExports = true;

module.exports = withUniwind(config, {
  input: "./global.css",
});
```

- [ ] **Step 2: Replace babel.config.js**

Write `apps/mobile/babel.config.js`:
```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      [
        "babel-preset-expo",
        {
          "react-compiler": {
            sources: (filename) =>
              /\.[jt]sx?$/.test(filename) && !filename.includes("node_modules"),
          },
        },
      ],
    ],
    plugins: ["react-native-worklets/plugin"],
  };
};
```

- [ ] **Step 3: Verify Metro boots**

Run from `apps/mobile/`:
```bash
pnpm expo start --port 8010 --clear
```

Expected: dev server starts, Metro loads without Tamagui plugin errors. Kill the server (Ctrl+C) — we can't load the app yet because screens still import Tamagui. This step just verifies the plugin swap didn't break bundling.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/metro.config.js apps/mobile/babel.config.js
git commit -m "chore: swap tamagui metro/babel plugins for uniwind"
```

---

## Task 4: Port `components/ui/glass-card.tsx`

**Files:**
- Modify: `apps/mobile/components/ui/glass-card.tsx`

- [ ] **Step 1: Rewrite glass-card.tsx**

Write `apps/mobile/components/ui/glass-card.tsx`:
```tsx
import React from "react";
import { Platform, View, type ViewProps } from "react-native";
import { BlurView } from "expo-blur";

type Size = "sm" | "md" | "lg";
type AccentBorder = "left" | "top";

type GlassCardProps = ViewProps & {
  size?: Size;
  accentBorder?: AccentBorder;
  accentBorderColorClass?: string; // e.g. "border-accent", "border-danger"
  interactive?: boolean;
  children?: React.ReactNode;
};

const sizeClass: Record<Size, string> = {
  sm: "p-3 rounded-2xl",
  md: "p-4 rounded-[20px]",
  lg: "p-5 rounded-[22px]",
};

export function GlassCard({
  size = "md",
  accentBorder,
  accentBorderColorClass = "border-accent",
  interactive,
  className,
  children,
  style,
  ...rest
}: GlassCardProps) {
  const isIOS = Platform.OS === "ios";
  const isAndroid = Platform.OS === "android";
  const isWeb = Platform.OS === "web";

  const accentCls =
    accentBorder === "left"
      ? `border-l-[3px] ${accentBorderColorClass}`
      : accentBorder === "top"
        ? `border-t-[3px] ${accentBorderColorClass}`
        : "";

  const bgCls = isAndroid
    ? "bg-glass-android"
    : isWeb
      ? "bg-glass [backdrop-filter:blur(12px)]"
      : "bg-transparent";

  return (
    <View
      className={[
        "border border-glass-border overflow-hidden relative",
        sizeClass[size],
        bgCls,
        accentCls,
        interactive ? "active:opacity-80" : "",
        className ?? "",
      ].join(" ")}
      style={style}
      {...rest}
    >
      {isIOS ? (
        <BlurView
          intensity={40}
          tint="dark"
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        />
      ) : null}
      {children}
    </View>
  );
}

export type { GlassCardProps };
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/components/ui/glass-card.tsx
git commit -m "refactor(ui): port GlassCard to uniwind"
```

---

## Task 5: Port `components/ui/button.tsx`

**Files:**
- Modify: `apps/mobile/components/ui/button.tsx`

- [ ] **Step 1: Rewrite button.tsx**

Write `apps/mobile/components/ui/button.tsx`:
```tsx
import React from "react";
import { Pressable, Text, type PressableProps } from "react-native";
import * as Haptics from "expo-haptics";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "small" | "default" | "large";

type ButtonProps = Omit<PressableProps, "children"> & {
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  children?: React.ReactNode;
};

const sizeCls: Record<Size, string> = {
  small: "h-9 rounded-xl px-3",
  default: "h-[50px] rounded-2xl px-4",
  large: "h-14 rounded-[18px] px-5",
};

const variantCls: Record<Variant, string> = {
  primary: "bg-accent active:opacity-90 active:scale-[0.97]",
  secondary: "bg-glass border border-glass-border active:opacity-90 active:scale-[0.97]",
  danger: "bg-danger-soft active:opacity-90 active:scale-[0.97]",
  ghost: "bg-transparent active:opacity-65",
};

const variantTextCls: Record<Variant, string> = {
  primary: "text-white font-semibold",
  secondary: "text-white font-semibold",
  danger: "text-danger font-semibold",
  ghost: "text-foreground font-semibold",
};

export function Button({
  variant = "primary",
  size = "default",
  disabled,
  children,
  onPress,
  className,
  ...props
}: ButtonProps) {
  function handlePress(e: Parameters<NonNullable<PressableProps["onPress"]>>[0]) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress?.(e);
  }

  return (
    <Pressable
      disabled={disabled}
      onPress={handlePress}
      className={[
        "items-center justify-center flex-row",
        sizeCls[size],
        variantCls[variant],
        disabled ? "opacity-40" : "",
        className ?? "",
      ].join(" ")}
      {...props}
    >
      {typeof children === "string" || typeof children === "number" ? (
        <Text className={variantTextCls[variant]}>{children}</Text>
      ) : (
        children
      )}
    </Pressable>
  );
}

export function SecondaryButton(props: Omit<ButtonProps, "variant">) {
  return <Button variant="secondary" {...props} />;
}

export function DangerButton(props: Omit<ButtonProps, "variant">) {
  return <Button variant="danger" {...props} />;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/components/ui/button.tsx
git commit -m "refactor(ui): port Button to uniwind"
```

---

## Task 6: Port `components/ui/badge.tsx`

**Files:**
- Modify: `apps/mobile/components/ui/badge.tsx`

- [ ] **Step 1: Read current badge.tsx**

Run: `cat apps/mobile/components/ui/badge.tsx`
Expected: Tamagui-based styled Text with `success`/`warning`/`danger`/`neutral` variants.

- [ ] **Step 2: Rewrite badge.tsx**

Write `apps/mobile/components/ui/badge.tsx`:
```tsx
import React from "react";
import { Text, View } from "react-native";

type Status = "success" | "warning" | "danger" | "neutral";

type BadgeProps = {
  status?: Status;
  children: React.ReactNode;
};

const bgCls: Record<Status, string> = {
  success: "bg-success-soft",
  warning: "bg-warning-soft",
  danger: "bg-danger-soft",
  neutral: "bg-glass",
};

const textCls: Record<Status, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  neutral: "text-muted",
};

export function Badge({ status = "neutral", children }: BadgeProps) {
  return (
    <View className={`px-2.5 py-1 rounded-full ${bgCls[status]}`}>
      <Text className={`text-xs font-semibold ${textCls[status]}`}>{children}</Text>
    </View>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/components/ui/badge.tsx
git commit -m "refactor(ui): port Badge to uniwind"
```

---

## Task 7: Port `components/ui/input.tsx`

**Files:**
- Modify: `apps/mobile/components/ui/input.tsx`

- [ ] **Step 1: Read current input.tsx**

Run: `cat apps/mobile/components/ui/input.tsx`
Expected: Input with floating label + PasswordInput with eye toggle. Uses Tamagui animation for label.

- [ ] **Step 2: Rewrite input.tsx using MotiView for floating label**

Write `apps/mobile/components/ui/input.tsx`:
```tsx
import React, { useState } from "react";
import { TextInput, View, type TextInputProps, Pressable } from "react-native";
import { MotiText } from "moti";
import FontAwesome from "@expo/vector-icons/FontAwesome";

type InputProps = TextInputProps & {
  label?: string;
  leftIcon?: React.ComponentProps<typeof FontAwesome>["name"];
  iconColor?: string;
};

export function Input({
  label,
  leftIcon,
  iconColor = "rgba(255,255,255,0.5)",
  value,
  onFocus,
  onBlur,
  className,
  ...rest
}: InputProps) {
  const [focused, setFocused] = useState(false);
  const active = focused || (typeof value === "string" && value.length > 0);

  return (
    <View className="bg-glass border border-glass-border rounded-2xl px-4 h-14 justify-center">
      {label ? (
        <MotiText
          className="absolute left-4 text-muted"
          animate={{
            top: active ? 6 : 18,
            fontSize: active ? 11 : 15,
          }}
          transition={{ type: "timing", duration: 150 }}
        >
          {label}
        </MotiText>
      ) : null}
      <View className="flex-row items-center gap-2 mt-3">
        {leftIcon ? (
          <FontAwesome name={leftIcon} size={16} color={iconColor} />
        ) : null}
        <TextInput
          value={value}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          placeholderTextColor="rgba(255,255,255,0.35)"
          className={`flex-1 text-foreground text-base ${className ?? ""}`}
          {...rest}
        />
      </View>
    </View>
  );
}

type PasswordInputProps = Omit<InputProps, "secureTextEntry">;

export function PasswordInput(props: PasswordInputProps) {
  const [hidden, setHidden] = useState(true);
  return (
    <View className="relative">
      <Input {...props} secureTextEntry={hidden} leftIcon="lock" />
      <Pressable
        onPress={() => setHidden((h) => !h)}
        className="absolute right-4 top-0 bottom-0 justify-center"
        hitSlop={12}
      >
        <FontAwesome
          name={hidden ? "eye" : "eye-slash"}
          size={16}
          color="rgba(255,255,255,0.5)"
        />
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/components/ui/input.tsx
git commit -m "refactor(ui): port Input/PasswordInput to uniwind + moti"
```

---

## Task 8: Port `components/ui/typography.tsx`

**Files:**
- Modify: `apps/mobile/components/ui/typography.tsx`

- [ ] **Step 1: Read current typography.tsx**

Run: `cat apps/mobile/components/ui/typography.tsx`
Expected: exports for `ScreenTitle`, `SectionLabel`, `LinkText`, maybe others. All Tamagui-based Text variants.

- [ ] **Step 2: Rewrite typography.tsx**

Write `apps/mobile/components/ui/typography.tsx`:
```tsx
import React from "react";
import { Text, type TextProps } from "react-native";

export function ScreenTitle({ className, ...p }: TextProps) {
  return (
    <Text
      className={`text-[28px] font-bold text-foreground tracking-tight ${className ?? ""}`}
      {...p}
    />
  );
}

export function SectionLabel({ className, ...p }: TextProps) {
  return (
    <Text
      className={`text-xs font-semibold text-muted uppercase tracking-wider ${className ?? ""}`}
      {...p}
    />
  );
}

export function LinkText({ className, ...p }: TextProps) {
  return (
    <Text
      className={`text-accent font-medium ${className ?? ""}`}
      {...p}
    />
  );
}

export function BodyText({ className, ...p }: TextProps) {
  return <Text className={`text-base text-foreground ${className ?? ""}`} {...p} />;
}

export function MutedText({ className, ...p }: TextProps) {
  return <Text className={`text-sm text-muted ${className ?? ""}`} {...p} />;
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/components/ui/typography.tsx
git commit -m "refactor(ui): port typography primitives to uniwind"
```

---

## Task 9: Port `components/ui/states.tsx`

**Files:**
- Modify: `apps/mobile/components/ui/states.tsx`

- [ ] **Step 1: Read current file**

Run: `cat apps/mobile/components/ui/states.tsx`
Expected: `EmptyState`, `ErrorState`, `ListRow` components.

- [ ] **Step 2: Rewrite states.tsx**

Write `apps/mobile/components/ui/states.tsx`:
```tsx
import React from "react";
import { View, Text } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { GlassCard } from "./glass-card";

export function EmptyState({
  icon = "calendar-o",
  title,
  subtitle,
  action,
}: {
  icon?: React.ComponentProps<typeof FontAwesome>["name"];
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <View className="items-center py-10 gap-3">
      <View className="w-14 h-14 rounded-full bg-glass items-center justify-center border border-glass-border">
        <FontAwesome name={icon} size={22} color="rgba(255,255,255,0.5)" />
      </View>
      <Text className="text-foreground font-semibold text-base text-center">
        {title}
      </Text>
      {subtitle ? (
        <Text className="text-muted text-sm text-center px-8">{subtitle}</Text>
      ) : null}
      {action}
    </View>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <GlassCard accentBorder="left" accentBorderColorClass="border-danger">
      <View className="flex-row gap-3 items-center">
        <FontAwesome name="exclamation-circle" size={16} color="#ef4444" />
        <Text className="text-danger font-medium flex-1">{message}</Text>
      </View>
    </GlassCard>
  );
}

export function ListRow({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <View className="gap-0.5">
      <Text className="text-foreground font-medium text-base">{title}</Text>
      {subtitle ? <Text className="text-muted text-sm">{subtitle}</Text> : null}
    </View>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/components/ui/states.tsx
git commit -m "refactor(ui): port states (empty/error/listrow) to uniwind"
```

---

## Task 10: Port `components/ui/session-card.tsx`

**Files:**
- Modify: `apps/mobile/components/ui/session-card.tsx`

- [ ] **Step 1: Rewrite session-card.tsx**

Write `apps/mobile/components/ui/session-card.tsx`:
```tsx
import React from "react";
import { Pressable, Text, View } from "react-native";
import { GlassCard } from "./glass-card";
import { Badge } from "./badge";

type SessionStatus = "booked" | "waitlisted" | "full" | "available";

type SessionCardProps = {
  time: string;
  className: string;
  trainerName?: string;
  room?: string;
  bookedCount: number;
  capacity: number;
  classType?: string;
  status: SessionStatus;
  onPress?: () => void;
};

const classTypeBorder: Record<string, string> = {
  Yoga: "border-l-[#2dd4bf]",
  Pilates: "border-l-accent",
  HIIT: "border-l-[#f87171]",
};

const statusConfig: Record<SessionStatus, { label: string; status: "success" | "warning" }> = {
  booked: { label: "Booked", status: "success" },
  waitlisted: { label: "Waitlisted", status: "warning" },
  full: { label: "Full", status: "warning" },
  available: { label: "", status: "success" },
};

export function SessionCard({
  time,
  className,
  trainerName,
  room,
  bookedCount,
  capacity,
  classType,
  status,
  onPress,
}: SessionCardProps) {
  const config = statusConfig[status];
  const spotsLeft = capacity - bookedCount;
  const badgeLabel =
    status === "available" ? `${spotsLeft} spot${spotsLeft !== 1 ? "s" : ""}` : config.label;
  const accentBorder = classType && classTypeBorder[classType] ? "left" : undefined;

  return (
    <Pressable onPress={onPress} className="active:opacity-80">
      <GlassCard
        accentBorder={accentBorder}
        accentBorderColorClass={
          classType && classTypeBorder[classType]
            ? classTypeBorder[classType]
            : "border-accent"
        }
      >
        <View className="flex-row items-center gap-3">
          <Text className="text-base font-bold text-foreground min-w-[54px]">
            {time}
          </Text>
          <View className="flex-1 gap-0.5">
            <Text className="text-sm font-semibold text-foreground">
              {className}
            </Text>
            {trainerName || room ? (
              <Text className="text-xs text-muted">
                {[trainerName, room].filter(Boolean).join(" · ")}
              </Text>
            ) : null}
          </View>
          {badgeLabel ? <Badge status={config.status}>{badgeLabel}</Badge> : null}
        </View>
      </GlassCard>
    </Pressable>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/components/ui/session-card.tsx
git commit -m "refactor(ui): port SessionCard to uniwind"
```

---

## Task 11: Port `components/ui/week-strip.tsx`

**Files:**
- Modify: `apps/mobile/components/ui/week-strip.tsx`

- [ ] **Step 1: Rewrite week-strip.tsx** (keep same public API and date logic)

Write `apps/mobile/components/ui/week-strip.tsx`:
```tsx
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

type ActivityStatus = "booked" | "available";

type WeekStripProps = {
  selectedDate: string;
  onSelectDate: (date: string) => void;
  activityByDate?: Record<string, ActivityStatus>;
};

function getDayLabel(dateStr: string): { dayName: string; dayNum: string } {
  const date = new Date(dateStr + "T00:00:00");
  const dayName = date.toLocaleDateString("en", { weekday: "short" }).slice(0, 3);
  const dayNum = String(date.getDate());
  return { dayName, dayNum };
}

function getWeekDates(selectedDate: string): string[] {
  const date = new Date(selectedDate + "T00:00:00");
  const day = date.getDay();
  const monday = new Date(date);
  monday.setDate(date.getDate() - ((day + 6) % 7));
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
}

function isToday(dateStr: string): boolean {
  return dateStr === new Date().toISOString().split("T")[0];
}

export function WeekStrip({ selectedDate, onSelectDate, activityByDate = {} }: WeekStripProps) {
  const weekDates = getWeekDates(selectedDate);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View className="flex-row gap-2 py-1 px-1">
        {weekDates.map((dateStr) => {
          const isSelected = dateStr === selectedDate;
          const today = isToday(dateStr);
          const { dayName, dayNum } = getDayLabel(dateStr);
          const activity = activityByDate[dateStr];

          return (
            <Pressable
              key={dateStr}
              onPress={() => onSelectDate(dateStr)}
              className={[
                "items-center gap-1.5 py-2.5 px-3 rounded-2xl min-w-[48px]",
                isSelected
                  ? "bg-accent"
                  : today
                    ? "border border-glass-border"
                    : "",
                "active:opacity-70",
              ].join(" ")}
            >
              <Text
                className={`text-xs font-medium ${
                  isSelected ? "text-white" : "text-muted"
                }`}
              >
                {dayName}
              </Text>
              <Text
                className={`text-lg font-bold ${
                  isSelected ? "text-white" : "text-foreground"
                }`}
              >
                {dayNum}
              </Text>
              {activity ? (
                <View
                  className={[
                    "w-1.5 h-1.5 rounded-full",
                    activity === "booked"
                      ? "bg-accent"
                      : "border border-accent",
                  ].join(" ")}
                />
              ) : (
                <View className="w-1.5 h-1.5" />
              )}
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/components/ui/week-strip.tsx
git commit -m "refactor(ui): port WeekStrip to uniwind"
```

---

## Task 12: Port `components/ui/progress-ring.tsx`

**Files:**
- Modify: `apps/mobile/components/ui/progress-ring.tsx`

- [ ] **Step 1: Read current file**

Run: `cat apps/mobile/components/ui/progress-ring.tsx`
Expected: SVG circle with stroke-dasharray animation. Tamagui only wraps the container.

- [ ] **Step 2: Rewrite replacing Tamagui wrapper with View + classes**

The SVG primitives stay identical. Only replace any `YStack`/`Text` imports with `View`/`Text` from react-native, and replace `fontSize="$6"` etc. with className equivalents. Preserve all svg/math logic exactly.

If current file uses `useThemeName` or Tamagui theme tokens for colors, replace with literal hex constants from design tokens: accent `#2e5b42`, glass border `rgba(255,255,255,0.08)`.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/components/ui/progress-ring.tsx
git commit -m "refactor(ui): port ProgressRing wrapper to uniwind"
```

---

## Task 13: Port `components/ui/screen-container.tsx`

**Files:**
- Modify: `apps/mobile/components/ui/screen-container.tsx`

- [ ] **Step 1: Read current file**

Run: `cat apps/mobile/components/ui/screen-container.tsx`
Expected: safe-area wrapper with optional padding/header, Tamagui-based.

- [ ] **Step 2: Rewrite screen-container.tsx**

Write `apps/mobile/components/ui/screen-container.tsx`:
```tsx
import React from "react";
import { View, type ViewProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Props = ViewProps & {
  children: React.ReactNode;
  padded?: boolean;
};

export function ScreenContainer({ children, padded = true, className, ...rest }: Props) {
  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-background">
      <View
        className={`flex-1 ${padded ? "px-6" : ""} ${className ?? ""}`}
        {...rest}
      >
        {children}
      </View>
    </SafeAreaView>
  );
}

export function ScreenContainerRaw({ children, className, ...rest }: Props) {
  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-background">
      <View className={`flex-1 ${className ?? ""}`} {...rest}>
        {children}
      </View>
    </SafeAreaView>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/components/ui/screen-container.tsx
git commit -m "refactor(ui): port ScreenContainer to uniwind"
```

---

## Task 14: Replace `components/ui/sheet.tsx` with gorhom

**Files:**
- Modify: `apps/mobile/components/ui/sheet.tsx`

- [ ] **Step 1: Rewrite sheet.tsx on top of gorhom**

Write `apps/mobile/components/ui/sheet.tsx`:
```tsx
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { Platform, View } from "react-native";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { BlurView } from "expo-blur";

type AppSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  snapPoints?: (string | number)[];
};

export function AppSheet({
  open,
  onOpenChange,
  children,
  snapPoints = ["60%", "90%"],
}: AppSheetProps) {
  const ref = useRef<BottomSheet>(null);
  const points = useMemo(() => snapPoints, [snapPoints]);

  useEffect(() => {
    if (open) ref.current?.expand();
    else ref.current?.close();
  }, [open]);

  const handleChange = useCallback(
    (index: number) => {
      if (index === -1) onOpenChange(false);
    },
    [onOpenChange],
  );

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.5}
      />
    ),
    [],
  );

  return (
    <BottomSheet
      ref={ref}
      index={-1}
      snapPoints={points}
      enablePanDownToClose
      onChange={handleChange}
      backdropComponent={renderBackdrop}
      backgroundStyle={{
        backgroundColor: Platform.OS === "ios" ? "transparent" : "#0A0F14",
      }}
      handleIndicatorStyle={{ backgroundColor: "rgba(255,255,255,0.35)" }}
    >
      {Platform.OS === "ios" ? (
        <BlurView
          intensity={60}
          tint="dark"
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        />
      ) : null}
      <BottomSheetView className="px-6 pt-2 pb-10">
        <View>{children}</View>
      </BottomSheetView>
    </BottomSheet>
  );
}
```

- [ ] **Step 2: Ensure `GestureHandlerRootView` wraps the app**

Read `apps/mobile/app/_layout.tsx`. Expected: `GestureHandlerRootView` import. If absent, the next task (Task 19) adds it.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/components/ui/sheet.tsx
git commit -m "refactor(ui): replace custom sheet with gorhom bottom-sheet"
```

---

## Task 15: Port remaining `components/ui/` files

**Files:**
- Modify: `apps/mobile/components/ui/action-button.tsx`
- Modify: `apps/mobile/components/ui/card.tsx`
- Modify: `apps/mobile/components/ui/date-time-picker.tsx`
- Modify: `apps/mobile/components/ui/skeleton.tsx`
- Modify: `apps/mobile/components/ui/tabs.tsx`
- Modify: `apps/mobile/components/ui/bento/*`

- [ ] **Step 1: Inventory remaining files**

Run: `grep -l "tamagui\|@tamagui" apps/mobile/components/ui/*.tsx apps/mobile/components/ui/bento/*.tsx`
Expected: list of files still importing Tamagui.

- [ ] **Step 2: Port each file using the same mechanical rules**

For each file, apply these rules (no new logic):
- `import { styled, YStack, XStack, Text } from "tamagui"` → `import { View, Text } from "react-native"`
- `<YStack>` → `<View className="flex-col">`
- `<XStack>` → `<View className="flex-row">`
- `gap="$N"` → `gap-N` class
- `p="$N"`/`px="$N"`/`py="$N"` → `p-N`/`px-N`/`py-N` classes
- `bg="$accent1"` → `bg-accent`
- `color="$color"` → `text-foreground`
- `color="$color9"` → `text-muted`
- `pressStyle={{ opacity: 0.8 }}` → `active:opacity-80` class on Pressable
- `animation="quick"` etc. → MotiView with `transition={{ type: "timing", duration: 150 }}`
- For `styled(YStack, { variants: {...} })`: rewrite as a plain React component that picks a className from a variant map (see Button Task 5 as the pattern).

- [ ] **Step 3: For skeleton.tsx specifically: use Moti for pulse**

Replace Tamagui's `animation="lazy"` + opacity oscillation with:
```tsx
import { MotiView } from "moti";

export function Skeleton({ className }: { className?: string }) {
  return (
    <MotiView
      from={{ opacity: 0.4 }}
      animate={{ opacity: 0.8 }}
      transition={{
        type: "timing",
        duration: 900,
        loop: true,
        repeatReverse: true,
      }}
      className={`bg-glass rounded-xl ${className ?? ""}`}
    />
  );
}
```

- [ ] **Step 4: Run grep again to verify zero Tamagui imports remain in `components/ui/`**

Run: `grep -l "tamagui\|@tamagui" apps/mobile/components/ui/**/*.tsx 2>/dev/null | wc -l`
Expected: `0`

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/components/ui
git commit -m "refactor(ui): port remaining ui primitives to uniwind"
```

---

## Task 16: Port `components/auth/auth-background.tsx`

**Files:**
- Modify: `apps/mobile/components/auth/auth-background.tsx`

- [ ] **Step 1: Read current file**

Run: `cat apps/mobile/components/auth/auth-background.tsx`
Expected: LinearGradient backdrop with centered content slot, Tamagui YStack.

- [ ] **Step 2: Rewrite using View**

Write `apps/mobile/components/auth/auth-background.tsx`:
```tsx
import React from "react";
import { View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardAvoidingView, Platform, ScrollView } from "react-native";

export function AuthBackground({ children }: { children: React.ReactNode }) {
  return (
    <View className="flex-1 bg-background">
      <LinearGradient
        colors={["#0A0F14", "#0F1F1A", "#0A0F14"]}
        locations={[0, 0.5, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <SafeAreaView className="flex-1">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="flex-1"
        >
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24 }}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/components/auth/auth-background.tsx
git commit -m "refactor(auth): port AuthBackground to uniwind"
```

---

## Task 17: Port `components/client/onboarding-checklist.tsx`

**Files:**
- Modify: `apps/mobile/components/client/onboarding-checklist.tsx`

- [ ] **Step 1: Read current file**

Run: `cat apps/mobile/components/client/onboarding-checklist.tsx`

- [ ] **Step 2: Apply the same mechanical rules from Task 15 Step 2**

Tamagui → View/Text, $N tokens → Tailwind classes, animation → Moti. Keep all logic (AsyncStorage reads, completion detection) identical.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/components/client/onboarding-checklist.tsx
git commit -m "refactor(client): port OnboardingChecklist to uniwind"
```

---

## Task 18: Port auth screens (sign-in, reset-password, accept-invite)

**Files:**
- Modify: `apps/mobile/app/sign-in.tsx`
- Modify: `apps/mobile/app/reset-password.tsx`
- Modify: `apps/mobile/app/accept-invite.tsx` (if exists)

- [ ] **Step 1: Check if accept-invite exists**

Run: `ls apps/mobile/app/accept-invite.tsx 2>&1`

- [ ] **Step 2: Port sign-in.tsx — replace Tamagui + `Animated.View + FadeIn/FadeInDown` with View + MotiView**

Replace the three `Animated.View` blocks in `sign-in.tsx` with `MotiView`:
```tsx
import { MotiView } from "moti";

// logo wrapper:
<MotiView from={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ type: "timing", duration: 600 }}>
  ...
</MotiView>

// heading wrapper:
<MotiView
  from={{ opacity: 0, translateY: 16 }}
  animate={{ opacity: 1, translateY: 0 }}
  transition={{ type: "timing", duration: 500, delay: 200 }}
>
  ...
</MotiView>

// form wrapper: same pattern with delay: 300
```

Replace `<YStack gap="$6" width="100%">` with `<View className="gap-6 w-full">` etc. Replace every Tamagui token with Tailwind equivalent (see table in "Design token mapping"). Keep all business logic (useMutation, useRouter, email/password state) byte-identical.

- [ ] **Step 3: Port reset-password.tsx** with the same rules.

- [ ] **Step 4: Port accept-invite.tsx** if it exists.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/sign-in.tsx apps/mobile/app/reset-password.tsx apps/mobile/app/accept-invite.tsx
git commit -m "refactor(auth): port sign-in, reset-password, accept-invite to uniwind + moti"
```

---

## Task 19: Port root layout `app/_layout.tsx`

**Files:**
- Modify: `apps/mobile/app/_layout.tsx`

- [ ] **Step 1: Rewrite _layout.tsx removing all Tamagui**

Write `apps/mobile/app/_layout.tsx`:
```tsx
import "../global.css";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "react-native-reanimated";

import "@/lib/i18n";
import { loadStoredLocale } from "@/lib/i18n";
import { usePushRegistration } from "@/lib/push-registration";
import { Providers } from "@/lib/providers";
import { useSessionAuth } from "@/lib/session-auth";
import { useColorScheme } from "@/components/useColorScheme";
import { ThemePreferenceProvider } from "@/lib/theme-preference";

export { ErrorBoundary } from "expo-router";

SplashScreen.preventAutoHideAsync();

const ACCENT = "#2e5b42";
const BG_DARK = "#0A0F14";
const BG_LIGHT = "#fafaf8";

const CustomDarkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: BG_DARK,
    card: BG_DARK,
    primary: ACCENT,
    text: "rgba(255,255,255,0.9)",
    border: "rgba(255,255,255,0.08)",
  },
};

const CustomLightTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: BG_LIGHT,
    card: BG_LIGHT,
    primary: ACCENT,
  },
};

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
    ...FontAwesome.font,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  useEffect(() => {
    loadStoredLocale();
  }, []);

  if (!loaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemePreferenceProvider>
          <RootLayoutNav />
        </ThemePreferenceProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  return (
    <ThemeProvider value={isDark ? CustomDarkTheme : CustomLightTheme}>
      <Providers colorScheme={isDark ? "dark" : "light"}>
        <View className="flex-1">
          <AppNavigator isDark={isDark} />
          <LinearGradient
            pointerEvents="none"
            style={StyleSheet.absoluteFill}
            colors={
              isDark
                ? ["rgba(46,91,66,0.06)", "rgba(46,91,66,0.10)", "rgba(46,91,66,0.03)"]
                : ["rgba(255,248,240,0.3)", "rgba(46,91,66,0.03)", "rgba(255,248,240,0.2)"]
            }
            locations={[0, 0.5, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
        </View>
      </Providers>
    </ThemeProvider>
  );
}

function AppNavigator({ isDark }: { isDark: boolean }) {
  const session = useSessionAuth();
  const isAuthenticated =
    !session.error && !!session.data?.session && !!session.role;
  usePushRegistration({ isAuthenticated });

  if (session.isPending) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" color={ACCENT} />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: isDark ? BG_DARK : BG_LIGHT },
      }}
    >
      <Stack.Protected guard={session.role === "ADMIN"}>
        <Stack.Screen name="(admin)" />
      </Stack.Protected>
      <Stack.Protected guard={session.role === "TRAINER"}>
        <Stack.Screen name="(trainer)" />
      </Stack.Protected>
      <Stack.Protected guard={session.role === "CLIENT"}>
        <Stack.Screen name="(client)" />
      </Stack.Protected>
      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="reset-password" />
      </Stack.Protected>
      <Stack.Screen name="index" />
    </Stack>
  );
}
```

- [ ] **Step 2: Verify Providers doesn't reference Tamagui**

Run: `grep -l "tamagui\|@tamagui" apps/mobile/lib/providers.tsx`
Expected: no match. If it matches, rewrite Providers to drop TamaguiProvider wrapper (keep QueryClientProvider, etc.).

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/_layout.tsx apps/mobile/lib/providers.tsx
git commit -m "refactor: port root layout to uniwind, add gesture handler root"
```

---

## Task 20: Port role layouts and screens

**Files:**
- Modify: `apps/mobile/app/(client)/_layout.tsx`
- Modify: `apps/mobile/app/(client)/index.tsx`
- Modify: `apps/mobile/app/(client)/calendar.tsx`
- Modify: `apps/mobile/app/(client)/notifications.tsx`
- Modify: `apps/mobile/app/(client)/profile.tsx`
- Modify: `apps/mobile/app/(trainer)/_layout.tsx`
- Modify: `apps/mobile/app/(trainer)/index.tsx`
- Modify: `apps/mobile/app/(trainer)/clients.tsx`
- Modify: `apps/mobile/app/(trainer)/notes.tsx`
- Modify: `apps/mobile/app/(trainer)/profile.tsx`
- Modify: `apps/mobile/app/(admin)/_layout.tsx`
- Modify: `apps/mobile/app/(admin)/index.tsx`
- Modify: `apps/mobile/app/(admin)/clients.tsx`
- Modify: `apps/mobile/app/(admin)/packages.tsx`
- Modify: `apps/mobile/app/(admin)/billing.tsx`
- Modify: `apps/mobile/app/(admin)/reports.tsx`
- Modify: `apps/mobile/app/(admin)/settings/*.tsx`

- [ ] **Step 1: Apply mechanical rules from Task 15 Step 2 to every screen**

For each file: replace Tamagui imports with React Native imports + className strings. Keep all data logic (queries, mutations, state) unchanged.

Tab layouts: replace Tamagui tab bar styling with native `Tabs` from `expo-router` + `tabBarStyle` prop for the glass look:
```tsx
<Tabs
  screenOptions={{
    headerShown: false,
    tabBarActiveTintColor: "#2e5b42",
    tabBarInactiveTintColor: "rgba(255,255,255,0.5)",
    tabBarStyle: {
      backgroundColor: "rgba(10,15,20,0.85)",
      borderTopColor: "rgba(255,255,255,0.08)",
      position: Platform.OS === "ios" ? "absolute" : "relative",
    },
    tabBarBackground: () =>
      Platform.OS === "ios" ? (
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
      ) : null,
  }}
>
  ...
</Tabs>
```

- [ ] **Step 2: Verify zero Tamagui imports remain**

Run from worktree root:
```bash
grep -rln "from \"tamagui\"\|from 'tamagui'\|@tamagui" apps/mobile --include="*.tsx" --include="*.ts" | grep -v node_modules
```

Expected: empty output (no files).

- [ ] **Step 3: Commit in per-role chunks**

```bash
git add apps/mobile/app/\(client\)
git commit -m "refactor(client): port client screens to uniwind"

git add apps/mobile/app/\(trainer\)
git commit -m "refactor(trainer): port trainer screens to uniwind"

git add apps/mobile/app/\(admin\)
git commit -m "refactor(admin): port admin screens to uniwind"
```

---

## Task 21: Remove Tamagui packages and config file

**Files:**
- Delete: `apps/mobile/tamagui.config.ts`
- Modify: `apps/mobile/package.json`

- [ ] **Step 1: Delete tamagui.config.ts**

```bash
rm apps/mobile/tamagui.config.ts
```

- [ ] **Step 2: Uninstall all tamagui packages**

Run from `apps/mobile/`:
```bash
pnpm remove tamagui @tamagui/animations-react-native @tamagui/babel-plugin @tamagui/colors @tamagui/config @tamagui/core @tamagui/font-inter @tamagui/metro-plugin @tamagui/native @tamagui/shorthands
```

Expected: all 10 tamagui packages removed from dependencies.

- [ ] **Step 3: Search for leftover imports one more time**

Run from worktree root:
```bash
grep -rln "tamagui" apps/mobile --include="*.tsx" --include="*.ts" --include="*.js" | grep -v node_modules | grep -v uniwind-migration
```

Expected: empty.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/package.json pnpm-lock.yaml
git rm apps/mobile/tamagui.config.ts
git commit -m "chore: remove tamagui packages and config"
```

---

## Task 22: Type-check and run the app

- [ ] **Step 1: Type check**

Run from `apps/mobile/`:
```bash
npx tsc --noEmit
```

Expected: zero TypeScript errors.

- [ ] **Step 2: Lint**

Run from repo root:
```bash
pnpm lint
```

Expected: zero lint errors.

- [ ] **Step 3: Boot dev server**

Run from `apps/mobile/`:
```bash
pnpm expo start --port 8010 --clear
```

Expected: Metro bundles without Tamagui references. Scan logs for any red errors.

- [ ] **Step 4: Smoke-test the app**

Open the app on iOS simulator (or web). Verify:
- Sign in screen renders with logo + inputs + CTA, animations play
- After sign-in, home loads for the role
- Bottom tabs render with glass styling
- Calendar tab opens, week strip scrolls, day tap switches
- Session card tap opens bottom sheet, sheet has blur backdrop
- Pull-to-refresh works on list screens
- No yellow/red Metro warnings about missing styles

If any screen looks visually different from the pre-migration state beyond trivial pixel shifts, open the corresponding file and compare against `git show HEAD~20:<path>` (or whatever pre-migration revision). Fix class mappings until parity.

- [ ] **Step 5: Commit any smoke-test fixes**

```bash
git add -A
git commit -m "fix: smoke test tweaks after uniwind migration"
```

---

## Self-Review Checklist

- [x] Tamagui removed from package.json, config, babel, metro (Tasks 3, 21)
- [x] Uniwind wired into Metro (Task 3)
- [x] `global.css` imported in root layout (Task 19)
- [x] `GestureHandlerRootView` added for gorhom (Task 19)
- [x] All 45 Tamagui-importing files ported (Tasks 4–20)
- [x] Custom Sheet replaced with gorhom wrapper (Task 14)
- [x] Moti replaces `react-native-reanimated` FadeIn/FadeInDown in auth (Task 18)
- [x] Haptics preserved in Button + Sheet open (Task 5)
- [x] Type check + lint clean (Task 22)
- [x] Smoke test completed (Task 22)
- [x] No new visual design — this plan is port-only

**Next plan:** `docs/superpowers/plans/2026-04-23-screen-redesign.md` — applies new designs from Mobbin references on top of the Uniwind stack.
