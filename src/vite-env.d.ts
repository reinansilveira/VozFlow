/// <reference types="vite/client" />
/// <reference types="chrome" />

interface ImportMetaEnv {
  readonly VITE_LICENSE_API_URL?: string;
  readonly VITE_LICENSE_PUBLIC_KEY?: string;
  readonly VITE_CHECKOUT_URL?: string;
  readonly VITE_SUPPORT_URL?: string;
  readonly VITE_SITE_URL?: string;
  readonly VITE_ACTIVITY_URL?: string;
  readonly VITE_META_PIXEL_ID?: string;
  readonly VITE_GA_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
