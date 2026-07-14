import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/**
 * Kiểm tra Supabase đã được cấu hình chưa.
 * True khi cả URL và anon key đều không rỗng (env vars đã set trong .env.local).
 */
export const isSupabaseConfigured = supabaseUrl !== "" && supabaseAnonKey !== "";

/**
 * Supabase browser client — init từ NEXT_PUBLIC env vars.
 *
 * Khi chưa cấu hình (env vars rỗng), dùng placeholder URL để client vẫn khởi tạo
 * được mà không throw. Các call sẽ fail ở network layer và được catch tại call site,
 * cho phép UI hiển thị trạng thái "chưa cấu hình" thay vì crash.
 */
export const supabase: SupabaseClient = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder-anon-key",
);
