import React from "react";
import { Text, YStack } from "tamagui";

export function ListRow({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <YStack py="$3" borderBottomWidth={1} borderColor="$borderColor">
      <Text fontWeight="500" fontSize="$3" color="$color">
        {title}
      </Text>
      {subtitle ? (
        <Text fontSize="$2" color="$color10" mt="$1">
          {subtitle}
        </Text>
      ) : null}
    </YStack>
  );
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <YStack p="$6" rounded={16} bg="$backgroundHover" items="center" gap="$2">
      <Text fontSize="$3" color="$color10" text="center">
        {title}
      </Text>
      {description ? (
        <Text fontSize="$2" color="$color9" text="center">
          {description}
        </Text>
      ) : null}
    </YStack>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <YStack p="$4" rounded={12} bg="$red3" items="center">
      <Text color="$red10" fontSize="$3" fontWeight="500" text="center">
        {message}
      </Text>
    </YStack>
  );
}

