import { z } from "zod";

// Stable codes for the multi-select fields. Labels are localized in the app;
// the DB stores these codes so a translation change doesn't drop data.
export const healthConditionCodeSchema = z.enum([
  "neck_pain",
  "back_pain",
  "disc_herniation",
  "scoliosis",
  "joint_pain_injuries",
  "osteoporosis",
  "high_blood_pressure",
  "dizziness_balance",
  "recent_surgery",
  "pregnancy_postpartum",
]);
export type HealthConditionCode = z.infer<typeof healthConditionCodeSchema>;

export const pilatesExperienceCodeSchema = z.enum([
  "none",
  "mat",
  "reformer",
  "clinical",
]);
export type PilatesExperienceCode = z.infer<typeof pilatesExperienceCodeSchema>;

export const activityLevelCodeSchema = z.enum([
  "sedentary",
  "moderate",
  "high",
]);
export type ActivityLevelCode = z.infer<typeof activityLevelCodeSchema>;

export const exerciseFrequencyCodeSchema = z.enum(["0-1", "2-3", "4+"]);
export type ExerciseFrequencyCode = z.infer<typeof exerciseFrequencyCodeSchema>;

export const healthGoalCodeSchema = z.enum([
  "improve_posture",
  "reduce_pain",
  "increase_flexibility",
  "core_strength",
  "rehabilitation",
  "stress_reduction",
  "movement_quality",
]);
export type HealthGoalCode = z.infer<typeof healthGoalCodeSchema>;

export const discomfortMovementCodeSchema = z.enum([
  "sitting",
  "standing",
  "walking",
  "bending",
  "rotation",
  "balance",
]);
export type DiscomfortMovementCode = z.infer<typeof discomfortMovementCodeSchema>;

export const healthIntakeInputSchema = z
  .object({
    conditions: z.array(healthConditionCodeSchema).max(20),
    conditionsOther: z.string().min(1).max(500).optional(),
    underMedicalTreatment: z.boolean(),
    medicalTreatmentDetails: z.string().min(1).max(2000).optional(),
    pilatesExperience: z.array(pilatesExperienceCodeSchema).min(1).max(4),
    pilatesExperienceDuration: z.string().min(1).max(200).optional(),
    activityLevel: activityLevelCodeSchema,
    exerciseFrequency: exerciseFrequencyCodeSchema,
    goals: z.array(healthGoalCodeSchema).max(10),
    goalsOther: z.string().min(1).max(500).optional(),
    discomfortDuring: z.array(discomfortMovementCodeSchema).max(6),
    additionalNotes: z.string().min(1).max(2000).optional(),
    guardianName: z.string().min(1).max(120).optional(),
    guardianRelation: z.enum(["roditelj", "staratelj"]).optional(),
  })
  .refine(
    (d) =>
      !d.underMedicalTreatment ||
      (d.medicalTreatmentDetails?.trim().length ?? 0) > 0,
    {
      message:
        "medicalTreatmentDetails required when underMedicalTreatment is true",
      path: ["medicalTreatmentDetails"],
    },
  );
export type HealthIntakeInput = z.infer<typeof healthIntakeInputSchema>;

export const healthIntakeResponseSchema = z.object({
  id: z.string(),
  clientProfileId: z.string(),
  conditions: z.array(healthConditionCodeSchema),
  conditionsOther: z.string().nullable(),
  underMedicalTreatment: z.boolean(),
  medicalTreatmentDetails: z.string().nullable(),
  pilatesExperience: z.array(pilatesExperienceCodeSchema),
  pilatesExperienceDuration: z.string().nullable(),
  activityLevel: activityLevelCodeSchema,
  exerciseFrequency: exerciseFrequencyCodeSchema,
  goals: z.array(healthGoalCodeSchema),
  goalsOther: z.string().nullable(),
  discomfortDuring: z.array(discomfortMovementCodeSchema),
  additionalNotes: z.string().nullable(),
  recordedAt: z.string(), // ISO date string when JSON-serialized
  recordedByUserId: z.string().nullable(),
  guardianName: z.string().nullable(),
  guardianRelation: z.string().nullable(),
});
export type HealthIntakeResponse = z.infer<typeof healthIntakeResponseSchema>;
