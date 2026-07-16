import { z } from "zod";

// Catalog model fields as they exist on the Prisma models — each is picked and
// fully re-validated in the .extend() below (the picked shapes exist only to
// enumerate the writable columns). Hand-written so this package no longer
// depends on the generated prisma-zod tree.
const packageTypeFieldsSchema = z.object({
  name: z.string(),
  sessionCount: z.number().int(),
  validityDays: z.number().int(),
  lateCancelHours: z.number().int(),
});
const classTypeFieldsSchema = z.object({
  name: z.string(),
  maxClients: z.number().int(),
  durationMins: z.number().int(),
});
const studioRoomFieldsSchema = z.object({
  name: z.string(),
  capacity: z.number().int(),
});

export const packageTypeInputSchema = packageTypeFieldsSchema.pick({
  name: true,
  sessionCount: true,
  validityDays: true,
  lateCancelHours: true,
}).extend({
  // .trim() before the length check: whitespace is never meaningful in a
  // catalog name, and a padded name (the staging "Energy " incident) later
  // broke a name-based lookup. Trimming at parse means no client can persist
  // a padded name regardless of the form.
  name: z.string().trim().min(2).max(100),
  sessionCount: z.number().int().positive(),
  validityDays: z.number().int().positive(),
  lateCancelHours: z.number().int().nonnegative().default(12),
  // Optional list price in RSD — prefills the paid-assign amount, editable
  // per payment. Null/omitted = no price on file.
  price: z.number().int().positive().nullable().optional(),
  classTypeId: z.uuid(),
  isBirthdayGift: z.boolean().optional().default(false),
}).refine(
  (data) => !data.isBirthdayGift || data.sessionCount === 1,
  {
    message: "Birthday gift PackageTypes must have sessionCount = 1",
    path: ["sessionCount"],
  },
);

export const updatePackageTypeInputSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  sessionCount: z.number().int().positive().optional(),
  validityDays: z.number().int().positive().optional(),
  lateCancelHours: z.number().int().nonnegative().optional(),
  price: z.number().int().positive().nullable().optional(),
  classTypeId: z.uuid().optional(),
  isBirthdayGift: z.boolean().optional(),
}).refine(
  (data) =>
    !data.isBirthdayGift || data.sessionCount === undefined || data.sessionCount === 1,
  {
    message: "Birthday gift PackageTypes must have sessionCount = 1",
    path: ["sessionCount"],
  },
);

export const classTypeInputSchema = classTypeFieldsSchema.pick({
  name: true,
  maxClients: true,
  durationMins: true,
}).extend({
  name: z.string().trim().min(2).max(100),
  maxClients: z.number().int().positive(),
  durationMins: z.number().int().positive(),
});

export const studioRoomInputSchema = studioRoomFieldsSchema.pick({
  name: true,
  capacity: true,
}).extend({
  name: z.string().trim().min(2).max(100),
  capacity: z.number().int().positive(),
});

export const updateStudioRoomInputSchema = studioRoomInputSchema.partial();

export const updateClassTypeInputSchema = classTypeInputSchema.partial();

// ─── Catalog response schemas ────────────────────────────────────────────────

const embeddedClassTypeSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const packageTypeSchema = z.object({
  id: z.string(),
  name: z.string(),
  sessionCount: z.number(),
  validityDays: z.number(),
  lateCancelHours: z.number(),
  price: z.number().nullable().optional(),
  classTypeId: z.string(),
  classType: embeddedClassTypeSchema.optional(),
  isBirthdayGift: z.boolean().optional(),
});
export type PackageType = z.infer<typeof packageTypeSchema>;

// GET /api/packages/types
export const packageTypesResponseSchema = z.object({
  success: z.boolean(),
  packageTypes: z.array(packageTypeSchema),
});
export type PackageTypesResponse = z.infer<typeof packageTypesResponseSchema>;

// POST /api/packages/types + PATCH /api/packages/types/[id]
export const packageTypeMutationResponseSchema = z.object({
  success: z.boolean(),
  packageType: packageTypeSchema,
});
export type PackageTypeMutationResponse = z.infer<
  typeof packageTypeMutationResponseSchema
>;

export const roomSchema = z.object({
  id: z.string(),
  name: z.string(),
  capacity: z.number(),
});
export type Room = z.infer<typeof roomSchema>;

// GET /api/rooms
export const roomsResponseSchema = z.object({
  success: z.boolean(),
  rooms: z.array(roomSchema),
});
export type RoomsResponse = z.infer<typeof roomsResponseSchema>;

// POST /api/rooms + PATCH /api/rooms/[id]
export const roomMutationResponseSchema = z.object({
  success: z.boolean(),
  room: roomSchema,
});
export type RoomMutationResponse = z.infer<typeof roomMutationResponseSchema>;

export const classTypeSchema = z.object({
  id: z.string(),
  name: z.string(),
  maxClients: z.number(),
  durationMins: z.number(),
});
export type ClassType = z.infer<typeof classTypeSchema>;

// GET /api/trainings/class-types
export const classTypesResponseSchema = z.object({
  success: z.boolean(),
  classTypes: z.array(classTypeSchema),
});
export type ClassTypesResponse = z.infer<typeof classTypesResponseSchema>;

// POST /api/trainings/class-types + PATCH /api/trainings/class-types/[id]
export const classTypeMutationResponseSchema = z.object({
  success: z.boolean(),
  classType: classTypeSchema,
});
export type ClassTypeMutationResponse = z.infer<
  typeof classTypeMutationResponseSchema
>;
