import { Text, View } from "react-native";

export function InitialsAvatar({ name, size = 56 }: { name: string; size?: number }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  return (
    <View
      className="items-center justify-center rounded-full bg-accent-soft"
      style={{ width: size, height: size }}
    >
      <Text
        className="text-accent font-body-bold"
        style={{ fontSize: Math.round(size * 0.36) }}
      >
        {initials}
      </Text>
    </View>
  );
}
