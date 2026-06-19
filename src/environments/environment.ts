// Production environment.
// supabaseUrl + supabaseAnonKey are safe to expose to the client — the anon
// key only grants what RLS allows. All privileged keys (Gemini) live in Edge
// Function secrets, never here.
//
// NOTE: this is the SHARED life-assistant Supabase project. Tarot data is
// isolated by the `tarot_` table prefix + per-user RLS (see ../../CLAUDE.md).
export const environment = {
  production: true,
  supabaseUrl: 'https://snlrpqamjzwoksmoxzir.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNubHJwcWFtanp3b2tzbW94emlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2NDUzODcsImV4cCI6MjA5NzIyMTM4N30.7QWi5t9-92wgiq_bG4KaXJngC7N6GCPpQAPfTI6po_k',
};
