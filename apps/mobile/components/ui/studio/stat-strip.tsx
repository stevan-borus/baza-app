/**
 * StatStrip — N hairline-separated columns. Each column has an ALL-CAPS
 * tracked label and a bold numeral. Empty data renders an em-dash so the
 * strip stays elegant when the user has no numbers yet.
 *
 * `columns` controls how many columns per row — 4 fits a tight overview,
 * 2 keeps numerals at a comfortable size when the labels are long. Items
 * wrap into multi-row grids when there are more items than columns.
 *
 * One "accent" column gets forest-green ink for the brand signature.
 */
import React from "react";
import { Text, View } from "react-native";

export type StatItem = {
  label: string;
  value: number | string | undefined | null;
  /** Paint the value (and label) in accent green. */
  accent?: boolean;
};

export function StatStrip({
  items,
  columns,
  className = "mx-5",
}: {
  items: StatItem[];
  /** Items per row. Defaults to `items.length` (single row). */
  columns?: number;
  className?: string;
}) {
  const cols = columns ?? items.length;
  // Group items into rows of `cols` length.
  const rows: StatItem[][] = [];
  for (let i = 0; i < items.length; i += cols) {
    rows.push(items.slice(i, i + cols));
  }

  return (
    <View className={className}>
      {rows.map((row, rowIdx) => (
        <React.Fragment key={rowIdx}>
          {rowIdx > 0 ? (
            <View className="bg-glass-border" style={{ height: 1 }} />
          ) : null}
          <View className="flex-row">
            {row.map((item, idx) => (
              <React.Fragment key={`${item.label}-${idx}`}>
                {idx > 0 ? (
                  <View
                    className="bg-glass-border"
                    style={{ width: 1, marginVertical: 10 }}
                  />
                ) : null}
                <StatColumn
                  label={item.label}
                  value={item.value}
                  accent={item.accent}
                />
              </React.Fragment>
            ))}
            {/* Pad the last row so columns stay equal-width when the
                total isn't divisible by cols. */}
            {row.length < cols
              ? Array.from({ length: cols - row.length }).map((_, i) => (
                  <View key={`pad-${i}`} style={{ flex: 1 }} />
                ))
              : null}
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}

function StatColumn({ label, value, accent = false }: StatItem) {
  const display =
    value === undefined || value === null
      ? "—"
      : typeof value === "number"
        ? value === 0
          ? "—"
          : String(value)
        : value === "0" || value === "0%" || value === ""
          ? "—"
          : value;
  return (
    <View
      className="flex-1 items-center py-5 px-2 gap-1.5"
      style={{ justifyContent: "space-between", minHeight: 96 }}
    >
      <View style={{ height: 28, justifyContent: "center" }}>
        <Text
          className={accent ? "text-accent" : "text-muted"}
          numberOfLines={2}
          style={{
            fontFamily: "AlbertSans-SemiBold",
            fontSize: 10,
            letterSpacing: 1.2,
            textTransform: "uppercase",
            textAlign: "center",
          }}
        >
          {label}
        </Text>
      </View>
      <Text
        className={accent ? "text-accent" : "text-foreground"}
        style={{
          fontFamily: "AlbertSans-Bold",
          fontSize: 26,
          letterSpacing: -0.6,
          lineHeight: 30,
        }}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {display}
      </Text>
    </View>
  );
}
