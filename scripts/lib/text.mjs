/** Repairs project names mangled upstream in URA's feed. */

// URA occasionally serves UTF-8 bytes that have already been decoded as
// CP1252 somewhere in its stack, so "J’den" arrives as "Jâ€™den" with the
// leading byte further replaced by U+FFFD. The original byte is unrecoverable,
// so match the damaged sequences directly rather than trying to round-trip.
const REPAIRS = [
  [/�€™/g, "’"], // â€™ -> ’
  [/�€\?/g, "’"],     // â€? -> ’ (trailing byte also lost)
  [/�‰/g, "É"],       // Ã‰ -> É
  [/�©/g, "é"],       // Ã© -> é
  [/�¨/g, "è"],       // Ã¨ -> è
];

export function repairMojibake(value) {
  let repaired = String(value ?? "");
  for (const [pattern, replacement] of REPAIRS) repaired = repaired.replace(pattern, replacement);
  return repaired;
}

/** Names still holding a replacement character after repair, for logging. */
export function findUnrepaired(names) {
  return names.filter((name) => repairMojibake(name).includes("�"));
}
