import { createClient } from '@supabase/supabase-js';

// Clean the URL by removing paths to ensure we use the base project URL
let rawUrl = import.meta.env.VITE_SUPABASE_URL || 'https://wxpmdthgnnfvgxicehgo.supabase.co/rest/v1/';
const urlObj = new URL(rawUrl);
const supabaseUrl = `${urlObj.protocol}//${urlObj.host}`;

const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_9jt4ibBV_nqQ8MqTTzqjmA_PXlADjPl';

export const supabase = createClient(supabaseUrl, supabaseKey);
