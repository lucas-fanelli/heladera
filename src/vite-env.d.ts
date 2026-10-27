/// <reference types="vite/client" />

/** true en el build de demo (un solo archivo, Db falso, router por hash). Definido en vite.config.ts. */
declare const __DEMO__: boolean;

/** Cuándo se compiló esto ("MM-DD hh:mm"), para saber qué versión tiene un teléfono. Definido en vite.config.ts. */
declare const __BUILD__: string;

interface ImportMetaEnv {
  /** 'fake' | 'firestore' (default: 'fake' hasta el nivel B) */
  readonly VITE_DB?: string;
  /** 'path' | 'hash' (default: path; demo fuerza hash) */
  readonly VITE_ROUTER?: string;
  readonly VITE_MOTION_SCALE?: string;
  readonly VITE_TIMING_SCALE?: string;
  /** Firebase (nivel B) */
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_USE_EMULATORS?: string;
}
interface ImportMeta { readonly env: ImportMetaEnv }

declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
