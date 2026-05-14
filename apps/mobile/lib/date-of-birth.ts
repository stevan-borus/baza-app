import { now } from "@/lib/now";

export function parseDateOfBirth(input: string): Date | null {
  if (!input) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return null;

  const [year, month, day] = input.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));

  // Validate components round-trip (rejects Feb 30, etc.)
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }

  const currentYear = now().getUTCFullYear();
  if (year < 1900 || year > currentYear) return null;

  return d;
}

export function formatDateOfBirth(
  d: Date | null,
  locale: "sr" | "en",
): string {
  if (!d) return "";
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year = d.getUTCFullYear();

  if (locale === "sr") return `${day}.${month}.${year}.`;

  const englishMonths = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return `${englishMonths[d.getUTCMonth()]} ${d.getUTCDate()}, ${year}`;
}
