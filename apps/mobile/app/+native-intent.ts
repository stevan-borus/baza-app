/**
 * Rewrites incoming native links to stable in-app paths.
 * Never throw from this file; always return a safe route string.
 */
export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}) {
  try {
    const url = new URL(path, "baza://app");

    // Normalize everything else to pathname-based routes.
    const normalizedPath = url.pathname || "/";
    return `${normalizedPath}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}
