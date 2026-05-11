import { Stack } from "expo-router";

export default function AdminKatalogStack() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        presentation: "modal",
      }}
    />
  );
}
