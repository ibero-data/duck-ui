/**
 * Timestamp/date display helpers.
 *
 * DuckDB timestamps arrive from Arrow as epoch milliseconds that encode the
 * *stored wall-clock time as if it were UTC*. Formatting them with local-time
 * getters (toLocaleString and friends) shifts the value by the viewer's UTC
 * offset — that is exactly the off-by-one-day DATE bug (#15). Everything here
 * formats via UTC so what DuckDB stored is what the user sees.
 */

/** "YYYY-MM-DD HH:MM:SS[.mmm]" in UTC — matches how DuckDB itself prints timestamps. */
export const formatTimestampUTC = (date: Date): string => {
  if (Number.isNaN(date.getTime())) return "Invalid Date";
  const iso = date.toISOString(); // 2025-01-01T12:34:56.789Z
  const datePart = iso.slice(0, 10);
  let timePart = iso.slice(11, 23);
  if (timePart.endsWith(".000")) timePart = timePart.slice(0, 8);
  return `${datePart} ${timePart}`;
};

/** "YYYY-MM-DD" in UTC. */
export const formatDateUTC = (date: Date): string => {
  if (Number.isNaN(date.getTime())) return "Invalid Date";
  return date.toISOString().slice(0, 10);
};
