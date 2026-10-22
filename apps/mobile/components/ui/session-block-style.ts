// Hidden and visible emit the same border-width keys with finite values: Fabric
// Android resets a removed border width to NaN, which clips the block's children.
export function sessionBlockStyle(
  hiddenFromClients: boolean | undefined,
  spineColor: string,
  mutedColor: string,
) {
  // Hidden from clients: dashed muted outline + a washed-out fill, so the block
  // reads as "draft" against its solid neighbours before any label is read.
  const outline = hiddenFromClients ? 1 : 0;
  return {
    // 4px colored spine. overflow-hidden + rounded-xl clips its outer corners
    // to match the card radius automatically.
    borderLeftWidth: 4,
    borderLeftColor: spineColor,
    borderTopWidth: outline,
    borderRightWidth: outline,
    borderBottomWidth: outline,
    borderStyle: hiddenFromClients ? ("dashed" as const) : ("solid" as const),
    borderColor: mutedColor,
    opacity: hiddenFromClients ? 0.6 : 1,
  };
}
