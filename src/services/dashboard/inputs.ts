/**
 * Dashboard inputs — Grafana-style template variables, Evidence syntax.
 *
 * A document declares inputs as components and references them in SQL:
 *
 *   <Dropdown name=region data={regions} value=region_name/>
 *
 *   ```sql filtered
 *   select * from sales where region = '${inputs.region.value}'
 *   ```
 *
 * The renderer substitutes values BEFORE the query reaches the engine, as
 * escaped SQL literals — a dashboard travels between people, so an input is
 * user input in the injection sense, not just the UX sense.
 *
 * Every input carries a default, so a document always runs on first open
 * rather than sitting blank until someone touches every control.
 */

/** A single input's current value. DateRange carries two. */
export type InputValue =
  | { kind: "scalar"; value: string | number | boolean }
  | { kind: "range"; start: string; end: string };

const INPUT_REFERENCE = /\$\{\s*inputs\.([A-Za-z_][A-Za-z0-9_]*)(?:\.(value|start|end))?\s*\}/g;

/** Input names a query references. Drives "only re-run what changed". */
export const referencedInputs = (sql: string): string[] => {
  const names = new Set<string>();
  for (const match of sql.matchAll(INPUT_REFERENCE)) names.add(match[1]);
  return [...names];
};

/** Renders a JS value as a SQL literal. Strings escape; nothing splices raw. */
const literal = (value: string | number | boolean): string => {
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return String(value).replace(/'/g, "''");
};

/**
 * Substitutes `${inputs.name}` / `.value` / `.start` / `.end` into SQL.
 *
 * The reference is usually already inside quotes in the document (matching
 * Evidence's convention `where x = '${inputs.y.value}'`), so scalars are
 * emitted as escaped text WITHOUT adding quotes — adding them would produce
 * `''value''`. An unknown input substitutes an empty string rather than
 * leaving the placeholder to become a SQL syntax error.
 */
export const applyInputs = (sql: string, values: ReadonlyMap<string, InputValue>): string =>
  sql.replace(INPUT_REFERENCE, (_whole, name: string, field?: string) => {
    const input = values.get(name);
    if (!input) return "";
    if (input.kind === "range") {
      if (field === "end") return literal(input.end);
      return literal(input.start);
    }
    return literal(input.value);
  });

const isoDate = (date: Date): string => date.toISOString().slice(0, 10);

/** Default value per input component, so documents run before any interaction. */
export const defaultInputValue = (
  tag: string,
  props: { defaultValue?: string; min?: number }
): InputValue => {
  switch (tag) {
    case "DateInput":
    case "DatePicker":
      return { kind: "scalar", value: props.defaultValue ?? isoDate(new Date()) };
    case "DateRange": {
      const end = new Date();
      const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { kind: "range", start: isoDate(start), end: isoDate(end) };
    }
    case "Checkbox":
      return { kind: "scalar", value: props.defaultValue === "true" };
    case "Slider":
      return { kind: "scalar", value: Number(props.defaultValue ?? props.min ?? 0) };
    default:
      return { kind: "scalar", value: props.defaultValue ?? "" };
  }
};

type Listener = () => void;

/**
 * Input state for one open dashboard.
 *
 * View state, not document state: two people looking at the same shared
 * report can pick different dates (§25's "personal" scope). Deliberately not
 * persisted and not synced in v1.
 */
export class InputsStore {
  private readonly values = new Map<string, InputValue>();
  private readonly listeners = new Set<Listener>();
  private version = 0;
  private snapshotCache: ReadonlyMap<string, InputValue> = new Map();

  /** Registers a default without clobbering a value the user already set. */
  ensure(name: string, fallback: InputValue): void {
    if (this.values.has(name)) return;
    this.values.set(name, fallback);
    this.bump();
  }

  set(name: string, value: InputValue): void {
    this.values.set(name, value);
    this.bump();
  }

  get(name: string): InputValue | undefined {
    return this.values.get(name);
  }

  /** Stable between changes — safe for `useSyncExternalStore`. */
  snapshot(): ReadonlyMap<string, InputValue> {
    return this.snapshotCache;
  }

  /** Monotonic change counter, for effect dependencies. */
  get revision(): number {
    return this.version;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private bump(): void {
    this.version += 1;
    this.snapshotCache = new Map(this.values);
    for (const listener of this.listeners) listener();
  }
}
