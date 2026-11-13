/// <reference types="vite/client" />

// Public build-time settings. Each is safe to ship to the browser; secrets
// (Turnstile secret, service-role key) stay in the Supabase dashboard.
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  readonly VITE_TURNSTILE_SITE_KEY?: string
}
