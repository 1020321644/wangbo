import { createClient } from '@supabase/supabase-js'

// 匿名应用：不使用 Supabase Auth 会话，避免多应用 localStorage 串号
const supabaseUrl: string = process.env.EXPO_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey: string = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || ''

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
})
