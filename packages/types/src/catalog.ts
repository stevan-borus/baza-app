import { z } from "zod";
import { ClassTypeInputSchema } from "./generated/prisma-zod/schemas/variants/input/ClassType.input";
import { PackageTypeInputSchema } from "./generated/prisma-zod/schemas/variants/input/PackageType.input";
import { StudioRoomInputSchema } from "./generated/prisma-zod/schemas/variants/input/StudioRoom.input";

export const packageTypeInputSchema = PackageTypeInputSchema.pick({
  name: true,
  sessionCount: true,
  validityDays: true,
  lateCancelHours: true,
}).extend({
  name: z.string().min(2).max(100),
  sessionCount: z.number().int().positive(),
  validityDays: z.number().int().positive(),
  lateCancelHours: z.number().int().nonnegative().default(12),
  classTypeId: z.uuid(),
  isBirthdayGift: z.boolean().optional().default(false),
}).refine(
  (data) => !data.isBirthdayGift || data.sessionCount === 1,
  {
    message: "Birthday gift PackageTypes must have sessionCount = 1",
    path: ["sessionCount"],
  },
);
export type PackageTypeInput = z.infer<typeof packageTypeInputSchema>;

export const updatePackageTypeInputSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  sessionCount: z.number().int().positive().optional(),
  validityDays: z.number().int().positive().optional(),
  lateCancelHours: z.number().int().nonnegative().optional(),
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
export type UpdatePackageTypeInput = z.infer<typeof updatePackageTypeInputSchema>;

export const classTypeInputSchema = ClassTypeInputSchema.pick({
  name: true,
  maxClients: true,
  durationMins: true,
}).extend({
  name: z.string().min(2).max(100),
  maxClients: z.number().int().positive(),
  durationMins: z.number().int().positive(),
});
export type ClassTypeInput = z.infer<typeof classTypeInputSchema>;

export const studioRoomInputSchema = StudioRoomInputSchema.pick({
  name: true,
  capacity: true,
}).extend({
  name: z.string().min(2).max(100),
  capacity: z.number().int().positive(),
});
export type StudioRoomInput = z.infer<typeof studioRoomInputSchema>;

export const updateStudioRoomInputSchema = studioRoomInputSchema.partial();
export type UpdateStudioRoomInput = z.infer<typeof updateStudioRoomInputSchema>;

export const updateClassTypeInputSchema = classTypeInputSchema.partial();
export type UpdateClassTypeInput = z.infer<typeof updateClassTypeInputSchema>;
