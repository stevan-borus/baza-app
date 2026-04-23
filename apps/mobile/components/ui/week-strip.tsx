import React from "react";
import { ScrollView, View, Text, Pressable } from "react-native";
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
              className="active:opacity-70"
              style={{
                alignItems: "center",
                gap: 6,
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 16,
                backgroundColor: isSelected ? ACCENT : "transparent",
                borderWidth: !isSelected && today ? 1 : 0,
                borderColor: GLASS_BORDER,
                minWidth: 48,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "500",
                  color: isSelected ? "#ffffff" : "rgba(255,255,255,0.5)",
                }}
              >
                {dayName}
              </Text>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "700",
                  color: isSelected ? "#ffffff" : "rgba(255,255,255,0.9)",
                }}
              >
                {dayNum}
              </Text>
              {activity ? (
                <View
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: activity === "booked" ? ACCENT : "transparent",
                    borderWidth: activity === "available" ? 1 : 0,
                    borderColor: ACCENT,
                  }}
                />
              ) : (
                <View style={{ width: 6, height: 6 }} />
              )}
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}
