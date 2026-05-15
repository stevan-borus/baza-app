/**
 * Currently-active version per consent document key. A bump here triggers
 * re-consent for every user whose latest accepted version is older.
 *
 * Versions are monotonic integers, never reused. Bumping a version MUST be
 * paired with creating the corresponding `docs/legal/{sr,en}/<key>-vN.md`
 * source file before this constant changes.
 */
import type { ConsentDocumentKey } from "@/generated/prisma";

export const ACTIVE_VERSIONS: Record<ConsentDocumentKey, number> = {
  tos: 1,
  privacy: 1,
  eula: 1,
  waiver_adult: 1,
  waiver_minor: 1,
  social_media: 1,
  health_intake: 1,
};

/** Gate documents — must be accepted by all users (or all clients, in the case of the waiver). */
export const GATE_DOCUMENT_KEYS_FOR_ROLE = {
  ADMIN: ["tos", "privacy", "eula"] as const,
  TRAINER: ["tos", "privacy", "eula"] as const,
  CLIENT: ["tos", "privacy", "eula"] as const, // waiver_adult/minor added by client logic based on DOB at accept time
} satisfies Record<"ADMIN" | "TRAINER" | "CLIENT", readonly ConsentDocumentKey[]>;

/**
 * "Must-answer" keys (separate from gate keys). The user must record a
 * choice for these (Da or Ne — both are acceptable answers; only an
 * *undecided* state blocks progression past /consent). Health intake is
 * NOT here because skipping it is allowed (records nothing); only the
 * social-media Da/Ne is non-skippable.
 */
export const MUST_ANSWER_KEYS_FOR_ROLE = {
  ADMIN: [] as const,
  TRAINER: [] as const,
  CLIENT: ["social_media"] as const,
} satisfies Record<"ADMIN" | "TRAINER" | "CLIENT", readonly ConsentDocumentKey[]>;
