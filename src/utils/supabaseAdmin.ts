// Re-export Neon admin client with Supabase-compatible interface
// This allows existing code to continue working without changes
import { neonAdmin, getNeonAdmin, getSql } from './neonAdmin';

export const supabaseAdmin = neonAdmin;
export const getSupabaseAdmin = getNeonAdmin;
export { getSql };
