# Phase 2: Auth Screens — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the sign-in and reset-password screens with the Calm+Peloton dark wellness gradient aesthetic, and create the new invite acceptance screen.

**Architecture:** All three auth screens share a common dark gradient background component. Each screen uses the glass-styled Input and Button components from Phase 1. The invite acceptance screen is a new Expo Router route.

**Tech Stack:** Tamagui styled(), expo-linear-gradient, Expo Router, Phase 1 components (GlassCard, Button, Input)

**Spec reference:** `docs/superpowers/specs/2026-03-10-ui-redesign-design.md` — Section 2: Auth Screens

**Prerequisite:** Phase 1 (Design System & Components) must be complete.

---

## Chunk 1: Shared Auth Layout & Sign-In

### Task 1: Create Auth Gradient Background Component

**Files:**
- Create: `apps/mobile/components/auth/auth-background.tsx`

- [ ] **Step 1: Create the shared auth background**

A reusable wrapper providing the dark gradient background used on all auth screens. Uses `expo-linear-gradient` for a subtle radial-like effect (center slightly green-tinted, edges near-black).

```tsx
import React, { PropsWithChildren } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { YStack } from "tamagui";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAvoidingView, Platform, ScrollView } from "react-native";

export function AuthBackground({ children }: PropsWithChildren) {
  const insets = useSafeAreaInsets();

  return (
    <LinearGradient
      colors={["#0d1a14", "#0A0F14", "#070a0e"]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={{ flex: 1 }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingTop: insets.top + 20,
            paddingBottom: insets.bottom + 20,
            paddingHorizontal: 24,
            alignItems: "center",
            maxWidth: 480,
            alignSelf: "center",
            width: "100%",
          }}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/components/auth/auth-background.tsx
git commit -m "feat: add shared AuthBackground gradient component for auth screens"
```

---

### Task 2: Redesign Sign-In Screen

**Files:**
- Modify: `apps/mobile/app/sign-in.tsx`

- [ ] **Step 1: Read the current sign-in.tsx**

Read `apps/mobile/app/sign-in.tsx` to understand the current auth logic (API calls, state management, navigation).

- [ ] **Step 2: Rewrite sign-in with new design**

Keep all existing auth logic (email/password state, sign-in mutation, error handling, navigation). Replace the JSX layout with:

- `AuthBackground` wrapper
- Baza logo/wordmark area (top ~30% — use a `Text` with brand name for now, or an image if logo exists)
- "Welcome back" heading using `ScreenTitle` (or custom 28px bold)
- "Sign in to your account" subtitle in secondary text color
- `Input` with `icon="envelope"` and `label="Email"`
- `PasswordInput` with `label="Password"` (already has lock icon built in)
- "Forgot password?" `LinkText` aligned right, navigates to `/reset-password`
- `Button` variant="primary" size="large" full width: "Sign In" — disabled when fields empty
- Error state: if error exists, render a `GlassCard` with red-tinted left border above the button showing error message

Key styling:
- Logo area: `marginTop: '25%'`
- Form area: `width: '100%'`, `gap: '$4'`
- Button: `marginTop: '$4'`

- [ ] **Step 3: Verify sign-in works**

```bash
cd apps/mobile && npx expo start --ios
```

Navigate to sign-in. Verify:
- Dark gradient background renders
- Glass inputs with icons display correctly
- Sign-in button is disabled when fields empty, enabled when filled
- Forgot password link navigates
- Entering wrong credentials shows error in glass card
- Successful sign-in navigates to the correct role screen

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/sign-in.tsx
git commit -m "feat: redesign sign-in screen with dark gradient and glass inputs"
```

---

### Task 3: Redesign Reset Password Screen

**Files:**
- Modify: `apps/mobile/app/reset-password.tsx`

- [ ] **Step 1: Read the current reset-password.tsx**

Read `apps/mobile/app/reset-password.tsx` to understand the two-step flow and API calls.

- [ ] **Step 2: Rewrite with new design**

Keep all existing logic (step state, request mutation, reset mutation). Replace the JSX:

- `AuthBackground` wrapper
- Back arrow (`FontAwesome` "arrow-left") top-left, navigates back to sign-in
- Lock icon in a circular glass badge: `GlassCard` with `borderRadius: 999`, `width: 64`, `height: 64`, centered lock icon
- Step indicator: two small dots below the icon, active dot is green, inactive is `rgba(255,255,255,0.2)`

**Step 1 — Request:**
- "Reset your password" heading (20px semibold)
- "Enter your email and we'll send you a reset link" subtitle
- `Input` with `icon="envelope"` and `label="Email"`
- `Button` variant="primary" size="large": "Send reset link"

**Step 2 — Reset:**
- "Check your email" heading
- "We sent a reset code to {email}" description text
- `Input` with `label="Reset code"` for token
- `Input` (password type) with `icon="lock"` and `label="New password"`
- `Button` variant="primary" size="large": "Reset password"

**Success state:**
- Replace form with: green checkmark icon in circular badge (FontAwesome "check" in green), "Password updated" heading, "Back to sign in" `LinkText`

- [ ] **Step 3: Verify flow works**

Test the full reset flow (or at least verify the UI renders for each step by toggling state).

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/reset-password.tsx
git commit -m "feat: redesign reset-password screen with glass theme and step indicator"
```

---

## Chunk 2: Invite Acceptance Screen

### Task 4: Create Accept Invite Screen

**Files:**
- Create: `apps/mobile/app/accept-invite.tsx`

- [ ] **Step 1: Understand the invite API contract**

Per `docs/api-contract.md`: `POST /api/auth/complete-invite` — request: `{ token, password }` — response: created user + session cookie. The endpoint is on the server; no mobile API route file exists.

- [ ] **Step 2: Create the accept-invite route**

New file at `apps/mobile/app/accept-invite.tsx`. This screen:

1. Reads `token` from URL params: `useLocalSearchParams<{ token: string }>()`
2. On mount, validates the token by calling the API to get invite details (email, inviter name, studio name)
3. Renders the form once invite data is loaded

Layout:
- `AuthBackground` wrapper
- "Welcome to [Studio Name]" heading (`ScreenTitle` or 28px bold)
- "You've been invited by [Admin Name]" subtitle in secondary text
- Pre-filled email field: `Input` with `icon="envelope"`, value from token data, `editable={false}`, `opacity={0.6}`
- `Input` with `icon="user"` and `label="Your name"` (if name not already set)
- `PasswordInput` with `label="Create password"`
- `PasswordInput` with `label="Confirm password"`
- `Button` variant="primary" size="large": "Join [Studio Name]"
- Terms/privacy link at bottom in tertiary text color

State management:
- `name`, `password`, `confirmPassword` state
- Validation: passwords must match, minimum length
- On submit: call complete-invite API with token + name + password
- On success: navigate to sign-in (or auto-sign-in if API returns session)
- On error: show error in GlassCard

Loading state while validating token:
- Show `AuthBackground` with centered `ActivityIndicator`

Invalid/expired token:
- Show error state: "This invite link has expired or is invalid" with "Back to sign in" link

- [ ] **Step 3: Add route to Expo Router config**

The file at `apps/mobile/app/accept-invite.tsx` is automatically picked up by Expo Router's file-based routing. Verify it's accessible:

```bash
cd apps/mobile && npx expo start --ios
```

Navigate to the route manually or test with a deep link.

- [ ] **Step 4: Test the flow**

If you have access to the admin panel to create an invite, test the full flow. Otherwise, verify the UI renders correctly with mock data by temporarily hardcoding invite details.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/accept-invite.tsx
git commit -m "feat: add accept-invite screen for invite-based onboarding"
```

---

## Summary

After Phase 2, the auth experience is complete:
- **Sign-in:** Dark gradient, glass inputs with icons, green CTA, error display
- **Reset password:** Two-step flow with step indicator, success confirmation
- **Accept invite:** New route, welcoming copy, pre-filled email from token
- **Shared:** AuthBackground gradient component reused across all three
