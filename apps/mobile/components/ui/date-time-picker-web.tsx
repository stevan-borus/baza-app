import React, { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { DayPicker } from "react-day-picker";
import { srLatn, enUS } from "date-fns/locale";
import "react-day-picker/style.css";
import "./date-time-picker-web.css";
import { now } from "@/lib/now";
import { AppSheet } from "./sheet";
import { Button } from "./button";

type Mode = "date" | "time" | "datetime";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: Date | null;
  mode: Mode;
  minimumDate?: Date;
  maximumDate?: Date;
  onConfirm: (date: Date) => void;
  locale: string;
  accent: string;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function combineDateAndTime(date: Date, hours: number, minutes: number): Date {
  const out = new Date(date);
  out.setHours(hours, minutes, 0, 0);
  return out;
}

export function WebDateTimeSheet({
  open,
  onOpenChange,
  value,
  mode,
  minimumDate,
  maximumDate,
  onConfirm,
  locale,
  accent,
}: Props) {
  const { t } = useTranslation();
  const [draftDate, setDraftDate] = useState<Date | null>(value ?? now());
  const [draftTime, setDraftTime] = useState(() => {
    const v = value ?? now();
    return `${pad2(v.getHours())}:${pad2(v.getMinutes())}`;
  });

  useEffect(() => {
    if (open) {
      setDraftDate(value ?? now());
      const v = value ?? now();
      setDraftTime(`${pad2(v.getHours())}:${pad2(v.getMinutes())}`);
    }
  }, [open, value]);

  const dpLocale = locale === "en" ? enUS : srLatn;

  const showCalendar = mode !== "time";
  const showTime = mode !== "date";

  const canConfirm = useMemo(() => {
    if (showCalendar && !draftDate) return false;
    if (showTime) {
      const [h, m] = draftTime.split(":");
      if (!h || !m) return false;
    }
    return true;
  }, [showCalendar, showTime, draftDate, draftTime]);

  function handleConfirm() {
    let result: Date;
    if (showCalendar && showTime) {
      const [h, m] = draftTime.split(":").map(Number);
      result = combineDateAndTime(draftDate ?? now(), h, m);
    } else if (showCalendar) {
      result = draftDate ?? now();
    } else {
      const [h, m] = draftTime.split(":").map(Number);
      const base = value ?? now();
      result = combineDateAndTime(base, h, m);
    }
    onConfirm(result);
  }

  return (
    <AppSheet open={open} onOpenChange={onOpenChange}>
      <View className="gap-5">
        <Text
          className="text-foreground font-body-bold"
          style={{ fontSize: 18, letterSpacing: -0.2 }}
        >
          {mode === "time"
            ? t("common.pickTime", { defaultValue: "Izaberi vreme" })
            : mode === "date"
              ? t("common.pickDate", { defaultValue: "Izaberi datum" })
              : t("common.pickDateTime", {
                  defaultValue: "Izaberi datum i vreme",
                })}
        </Text>

        {showCalendar ? (
          <div
            data-testid="date-time-picker-calendar"
            style={
              {
                "--rdp-accent-color": accent,
                "--rdp-background-color": "transparent",
                "--rdp-accent-background-color": `${accent}33`,
                color: "inherit",
              } as React.CSSProperties
            }
          >
            <DayPicker
              mode="single"
              selected={draftDate ?? undefined}
              onSelect={(d) => d && setDraftDate(d)}
              // Open on the picked date's month, falling back to today when
              // nothing is picked. Without this the calendar always opened on
              // the current month, so editing an existing date (a 1990 date of
              // birth, say) meant paging back through every month by hand.
              defaultMonth={value ?? now()}
              locale={dpLocale}
              weekStartsOn={1}
              showOutsideDays
              startMonth={minimumDate}
              endMonth={maximumDate}
              disabled={
                minimumDate || maximumDate
                  ? ([
                      minimumDate ? { before: minimumDate } : undefined,
                      maximumDate ? { after: maximumDate } : undefined,
                    ].filter(Boolean) as never)
                  : undefined
              }
            />
          </div>
        ) : null}

        {showTime ? (
          <View className="gap-1.5">
            <Text
              className="text-muted text-xs uppercase"
              style={{ letterSpacing: 1.4, fontFamily: "AlbertSans-SemiBold" }}
            >
              {t("common.time", { defaultValue: "Vreme" })}
            </Text>
            <View
              className="border rounded-2xl bg-glass border-glass-border"
              style={{ height: 48, paddingHorizontal: 14, justifyContent: "center" }}
            >
              <input
                data-testid="date-time-picker-time-input"
                type="time"
                value={draftTime}
                onChange={(e) => setDraftTime(e.target.value)}
                style={{
                  background: "transparent",
                  border: 0,
                  outline: "none",
                  fontSize: 14,
                  color: "inherit",
                  fontFamily: "AlbertSans-Regular, system-ui, sans-serif",
                  width: "100%",
                  height: 48,
                }}
              />
            </View>
          </View>
        ) : null}

        <View className="flex-row gap-3 pt-1">
          <Button
            className="flex-1"
            variant="secondary"
            onPress={() => onOpenChange(false)}
            testID="date-time-picker-cancel"
          >
            {t("common.cancel", { defaultValue: "Otkaži" })}
          </Button>
          <Button
            className="flex-1"
            disabled={!canConfirm}
            onPress={handleConfirm}
            testID="date-time-picker-confirm"
          >
            {t("common.confirm", { defaultValue: "Potvrdi" })}
          </Button>
        </View>
      </View>
    </AppSheet>
  );
}
