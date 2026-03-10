import React from "react";
import { ScrollView } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { ACCENT, GLASS_BORDER } from "./tokens";

type ActivityStatus = "booked" | "available";

type WeekStripProps = {
  selectedDate: string; // ISO date string YYYY-MM-DD
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
      <XStack gap="$2" py="$1" px="$1">
        {weekDates.map((dateStr) => {
          const isSelected = dateStr === selectedDate;
          const today = isToday(dateStr);
          const { dayName, dayNum } = getDayLabel(dateStr);
          const activity = activityByDate[dateStr];

          return (
            <YStack
              key={dateStr}
              items="center"
              gap="$1.5"
              py="$2.5"
              px="$3"
              rounded={16}
              bg={isSelected ? ACCENT : "transparent"}
              borderWidth={!isSelected && today ? 1 : 0}
              borderColor={GLASS_BORDER}
              pressStyle={{ opacity: 0.7 }}
              onPress={() => onSelectDate(dateStr)}
              cursor="pointer"
              minWidth={48}
            >
              <Text
                fontSize="$1"
                fontWeight="500"
                color={isSelected ? "#ffffff" : "$color9"}
              >
                {dayName}
              </Text>
              <Text
                fontSize="$4"
                fontWeight="700"
                color={isSelected ? "#ffffff" : "$color"}
              >
                {dayNum}
              </Text>
              {activity ? (
                <YStack
                  width={6}
                  height={6}
                  rounded={3}
                  bg={activity === "booked" ? ACCENT : "transparent"}
                  borderWidth={activity === "available" ? 1 : 0}
                  borderColor={ACCENT}
                />
              ) : (
                <YStack width={6} height={6} />
              )}
            </YStack>
          );
        })}
      </XStack>
    </ScrollView>
  );
}
