import { supabase } from "@/lib/supabase";

/** Chapter record từ chapters table (metadata only — prose nằm trong StoreBackend). */
export interface Chapter {
  /** UUID chapter. */
  id: string;
  /** UUID novel chứa chapter. */
  novel_id: string;
  /** Số thứ tự chapter (1, 2, 3, ...). */
  number: number;
  /** Tiêu đề chapter (có thể null khi agent chưa đặt tên). */
  title: string | null;
  /** Trạng thái: 'draft' | 'revised' | 'final'. */
  status: string;
  /** Số từ (tự tính bởi save_chapter_metadata tool). */
  word_count: number;
  /** Thời gian tạo (ISO). */
  created_at: string;
  /** Thời gian cập nhật (ISO). */
  updated_at: string;
}

/**
 * Liệt kê tất cả chapters của novel, sắp xếp theo số thứ tự.
 *
 * Fetch qua Supabase browser client (RLS: user_id = auth.uid()).
 *
 * @param novelId - UUID novel cần list chapters.
 * @returns Mảng Chapter theo thứ tự number. Trả [] nếu chưa có chapter.
 * @throws Error nếu Supabase query fail (network, RLS, etc.).
 */
export async function listChapters(novelId: string): Promise<Chapter[]> {
  const { data, error } = await supabase
    .from("chapters")
    .select("*")
    .eq("novel_id", novelId)
    .order("number");
  if (error) throw error;
  return (data ?? []) as Chapter[];
}
