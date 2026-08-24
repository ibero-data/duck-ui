/**
 * Build-time app configuration, read from `public/databases/manifest.json`.
 *
 * The manifest is a single static file fetched once at boot. It drives two
 * things: which databases are auto-attached on startup (`databases`) and an
 * optional `ui` block that turns Duck-UI into a locked-down "kiosk" — hiding
 * the panels that let a visitor add connections, import data, or change
 * settings. This is what powers static GitHub Pages deployments of a fixed
 * dataset (see public/databases/README.md).
 */

/** One entry in the manifest `databases` array. */
export interface EmbeddedDatabase {
  /** Display name, also used to derive the attach alias when `alias` is absent. */
  name: string;
  /**
   * Either a bundled file in `public/databases/` (e.g. `sales.db`) or a
   * connection string DuckDB can ATTACH directly:
   * `ducklake:https://host/catalog.ducklake`, `https://host/file.db`, `s3://…`.
   */
  file: string;
  description?: string;
  /** Attach on startup. Defaults to true. */
  autoLoad?: boolean;
  /** Explicit attach alias. Defaults to a sanitized form of `name`/`file`. */
  alias?: string;
  /** Attach read-only. Defaults to true for connection strings, false for local files. */
  readOnly?: boolean;
  /** DuckLake data path, passed as `DATA_PATH '<value>'` in the ATTACH options. */
  dataPath?: string;
}

/** Raw `ui` block as it appears in the manifest (all fields optional). */
export interface UiConfigInput {
  /** Master switch. When true, every `hide*`/`readOnly` flag defaults to true. */
  kiosk?: boolean;
  hideConnections?: boolean;
  hideSettings?: boolean;
  hideImport?: boolean;
  hideBrain?: boolean;
  /** Hide destructive affordances (e.g. "Delete Table"). */
  readOnly?: boolean;
}

/** Resolved UI config with every flag concrete. */
export interface UiConfig {
  kiosk: boolean;
  hideConnections: boolean;
  hideSettings: boolean;
  hideImport: boolean;
  hideBrain: boolean;
  readOnly: boolean;
}

interface Manifest {
  databases?: EmbeddedDatabase[];
  ui?: UiConfigInput;
}

/** When `kiosk` is on, each flag defaults to on unless the manifest overrides it. */
const resolveUiConfig = (input?: UiConfigInput): UiConfig => {
  const kiosk = input?.kiosk ?? false;
  const withKioskDefault = (value: boolean | undefined) => value ?? kiosk;
  return {
    kiosk,
    hideConnections: withKioskDefault(input?.hideConnections),
    hideSettings: withKioskDefault(input?.hideSettings),
    hideImport: withKioskDefault(input?.hideImport),
    hideBrain: withKioskDefault(input?.hideBrain),
    readOnly: withKioskDefault(input?.readOnly),
  };
};

let manifestPromise: Promise<Manifest> | null = null;
let cachedDatabases: EmbeddedDatabase[] = [];
let cachedUi: UiConfig = resolveUiConfig();

/**
 * Fetches and caches the manifest. Idempotent — subsequent calls reuse the
 * first fetch. A missing or malformed manifest resolves to defaults (kiosk off,
 * no embedded databases) rather than throwing, so boot never blocks on it.
 */
export const loadAppConfig = async (): Promise<void> => {
  if (!manifestPromise) {
    const base = import.meta.env.BASE_URL ?? "/";
    manifestPromise = fetch(`${base}databases/manifest.json`)
      .then(async (response) => (response.ok ? ((await response.json()) as Manifest) : {}))
      .catch(() => ({}) as Manifest)
      .then((manifest) => {
        cachedDatabases = Array.isArray(manifest.databases) ? manifest.databases : [];
        cachedUi = resolveUiConfig(manifest.ui);
        return manifest;
      });
  }
  await manifestPromise;
};

/** Embedded database entries from the manifest. Empty until `loadAppConfig` resolves. */
export const getEmbeddedDatabases = (): EmbeddedDatabase[] => cachedDatabases;

/** Resolved UI/kiosk config. Returns defaults (kiosk off) until `loadAppConfig` resolves. */
export const getUiConfig = (): UiConfig => cachedUi;

/**
 * Whether a workspace tab type is hidden by the current kiosk config. Shared by
 * the tab slice (refuse to open) and WorkspaceTabs (refuse to render a restored
 * one), so both stay in lockstep.
 */
export const isGatedTabHidden = (type: string): boolean =>
  (type === "connections" && cachedUi.hideConnections) ||
  (type === "settings" && cachedUi.hideSettings);
