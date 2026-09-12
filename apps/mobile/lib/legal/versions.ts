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
  marketing: 1,
};

/** Gate documents — must be accepted by all users (or all clients, in the case of the waiver).
 *
 * EULA is intentionally not gated: an in-house pilates studio app distributed
 * via App Store / Play Store is already covered by the platforms' standard
 * end-user licenses. The `eula` enum value stays in `ConsentDocumentKey`
 * so historic records aren't invalidated. */
export const GATE_DOCUMENT_KEYS_FOR_ROLE = {
  ADMIN: ["tos", "privacy"] as const,
  TRAINER: ["tos", "privacy"] as const,
  CLIENT: ["tos", "privacy"] as const, // waiver_adult/minor added by client logic based on DOB at accept time
} satisfies Record<"ADMIN" | "TRAINER" | "CLIENT", readonly ConsentDocumentKey[]>;

/**
 * "Must-answer" keys (separate from gate keys). The user must record a
 * choice for these (Da or Ne — both are acceptable answers; only an
 * *undecided* state blocks progression past /consent). Health intake is
 * NOT here because skipping it is allowed (records nothing).
 *
 * `marketing` is a must-answer for the same reason `social_media` is — the
 * studio wants a recorded decision, not a shrug. It differs in what an
 * unrecorded state means downstream: an undecided social-media question
 * blocks the gate and nothing else, whereas undecided marketing is a
 * standing NO for sending purposes (Zakon o elektronskoj trgovini čl. 8
 * needs *prior* consent, so anything short of a recorded Da means no send).
 * Never gate a document behind it: ZZPL čl. 15 forbids conditioning a
 * contract on consent that the contract does not require.
 */
export const MUST_ANSWER_KEYS_FOR_ROLE = {
  ADMIN: [] as const,
  TRAINER: [] as const,
  CLIENT: ["social_media", "marketing"] as const,
} satisfies Record<"ADMIN" | "TRAINER" | "CLIENT", readonly ConsentDocumentKey[]>;
