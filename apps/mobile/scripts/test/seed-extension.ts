/**
 * CLI bridge that lets Maestro flows trigger the same DB-direct setup the
 * Phase A Playwright specs do via `test/e2e/helpers/db.ts`. The Maestro
 * runner (`run-e2e.sh`) shells out to this script before flows that need
 * extra fixtures (trainer↔client booking link, past attended session, etc.).
 *
 * Usage:
 *   tsx scripts/test/seed-extension.ts link-trainer <trainerEmail> <clientEmail>
 *   tsx scripts/test/seed-extension.ts past-attended-session
 *
 * Exits non-zero on failure so the runner can surface the error.
 */
import {
  createPastAttendedSession,
  disconnect,
  linkTrainerToClient,
} from "../../test/e2e/helpers/db";

async function main() {
  const [, , command, ...args] = process.argv;
  switch (command) {
    case "link-trainer": {
      const [trainerEmail, clientEmail] = args;
      if (!trainerEmail || !clientEmail) {
        throw new Error(
          "usage: link-trainer <trainerEmail> <clientEmail>",
        );
      }
      const result = await linkTrainerToClient(trainerEmail, clientEmail);
      console.log(JSON.stringify(result));
      break;
    }
    case "past-attended-session": {
      // 25h ago — comfortably past the late-cancel cutoff (the seed uses
      // 12h windows for Reformer) so the cron-driven attendance markers
      // resolve to consumed/canceled cleanly.
      const startsAt = new Date(Date.now() - 25 * 60 * 60 * 1000);
      const result = await createPastAttendedSession({
        trainerEmail: "trainer.reformer@e2e.test",
        classTypeName: "Reformer pilates",
        consumedClientEmail: "client.active.reformer@e2e.test",
        canceledClientEmail: "client.active.energy@e2e.test",
        startsAt,
      });
      console.log(JSON.stringify(result));
      break;
    }
    default:
      throw new Error(`unknown command: ${command ?? "(none)"}`);
  }
}

main()
  .catch((error) => {
    console.error("[seed-extension] failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnect();
  });
