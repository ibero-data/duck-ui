// file: src/bun-env.d.ts
// description: TypeScript environment declarations for Bun runtime
// reference: https://bun.sh/docs/runtime/typescript

/// <reference types="bun-types" />

interface ImportMetaEnv {
  readonly MODE: string;
  readonly PROD: boolean;
  readonly DEV: boolean;
  [key: string]: any;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __DUCK_UI_VERSION__: string;
declare const __DUCK_UI_RELEASE_DATE__: string;
