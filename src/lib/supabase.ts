import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  typeof window !== 'undefined'
    ? `${window.location.origin}/supabase`
    : process.env.NEXT_PUBLIC_SUPABASE_URL!;

export const supabase = createClient(
  supabaseUrl,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);
