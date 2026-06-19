// TEMPLATE — copy to `environment.ts` and fill in.
// supabaseUrl + supabaseAnonKey are client-safe (the anon key only grants what
// RLS allows). Privileged keys (Gemini) live in Edge Function secrets.
export const environment = {
  production: true,
  supabaseUrl: 'https://<your-project-ref>.supabase.co',
  supabaseAnonKey: '<anon-public-key>',
};
