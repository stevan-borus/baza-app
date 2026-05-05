// Native stub for the web-only date-time picker sheet. The web build
// resolves to date-time-picker-web.tsx which imports react-day-picker;
// keeping this stub here means the parent file's static import still
// resolves cleanly on iOS/Android.

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: Date | null;
  mode: "date" | "time" | "datetime";
  minimumDate?: Date;
  maximumDate?: Date;
  onConfirm: (date: Date) => void;
  locale: string;
  accent: string;
};

export function WebDateTimeSheet(_props: Props) {
  return null;
}
