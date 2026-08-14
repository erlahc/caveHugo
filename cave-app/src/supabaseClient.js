import { createClient } from "@supabase/supabase-js";

// Ces deux valeurs viennent de Supabase > Project Settings > API.
// La clé "anon" est PUBLIQUE par design (elle est faite pour être exposée
// côté client) : c'est Row Level Security côté base qui protège tes données,
// pas le secret de cette clé.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
