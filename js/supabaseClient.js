import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const supabaseUrl = 'https://wpxrncmhaiwkohegbxdv.supabase.co'
const supabaseKey = 'sb_publishable_AR7Pmd0Z3uXENSiyFCXHig_tRJQUgIB'

export const _supabase = createClient(supabaseUrl, supabaseKey)