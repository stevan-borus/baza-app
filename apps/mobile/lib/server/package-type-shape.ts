/**
 * PackageType ↔ ClassType set helpers: the API speaks a flat
 * `classTypes: [{id, name}]` array; storage is PackageTypeClassType join
 * rows. One select fragment + one shaper so every route agrees.
 */
export const PACKAGE_TYPE_CLASS_TYPES_SELECT = {
  classTypes: { select: { classType: { select: { id: true, name: true } } } },
} as const;

export function shapePackageTypeClassTypes<
  T extends { classTypes: { classType: { id: string; name: string } }[] },
>(row: T): Omit<T, "classTypes"> & { classTypes: { id: string; name: string }[] } {
  const { classTypes, ...rest } = row;
  return { ...rest, classTypes: classTypes.map((link) => link.classType) };
}
