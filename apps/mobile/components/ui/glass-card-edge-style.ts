export type AccentBorder = "left" | "top";

// Every state emits the same border-width keys with finite values: Fabric
// Android resets a removed border width to NaN, which clips the card's children.
export function glassCardEdgeStyle(
  accentBorder: AccentBorder | undefined,
  accentBorderColor: string,
  baseBorderColor: string,
) {
  const edge = (side: AccentBorder) =>
    accentBorder === side
      ? { width: 3, color: accentBorderColor }
      : { width: 1, color: baseBorderColor };
  const left = edge("left");
  const top = edge("top");
  return {
    borderLeftWidth: left.width,
    borderLeftColor: left.color,
    borderTopWidth: top.width,
    borderTopColor: top.color,
  };
}
