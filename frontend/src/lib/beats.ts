import { supabase } from "@/lib/supabase";

/**
 * Một beat Save the Cat — mirror schema bảng `beats` (đã verify qua PostgREST).
 * `id` là null khi DB chưa có row tương ứng (init_beats chưa chạy cho novel đó).
 */
export interface Beat {
  id: string | null;
  novel_id: string;
  beat_number: number;
  beat_name: string;
  content: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/**
 * Cấu trúc 15 beat Save the Cat — source of truth cho khung sườn plot.
 * `act` nhóm beat vào 3 hồi; `hint` là gợi ý ngắn tiếng Việt cho UI.
 */
export interface StcBeat {
  beat_number: number;
  beat_name: string;
  act: 1 | 2 | 3;
  hint: string;
}

/**
 * 15 beat Save the Cat theo thứ tự narrative (Blake Snyder).
 * Hồi 1 (1–5): thiết lập; Hồi 2 (6–12): đối đầu; Hồi 3 (13–15): giải quyết.
 */
export const STC_BEATS: StcBeat[] = [
  { beat_number: 1, beat_name: "Opening Image", act: 1, hint: "Hình ảnh mở đầu — đặt tông & bầu không khí." },
  { beat_number: 2, beat_name: "Theme Stated", act: 1, hint: "Chủ đề được nêu lên — nhân vật chính chưa hiểu." },
  { beat_number: 3, beat_name: "Set-Up", act: 1, hint: "Thiết lập thế giới cũ, nhân vật, bối cảnh." },
  { beat_number: 4, beat_name: "Catalyst", act: 1, hint: "Sự kiện chất xúc tác phá vỡ trạng thái cũ." },
  { beat_number: 5, beat_name: "Debate", act: 1, hint: "Nhân vật do dự trước cuộc hành trình." },
  { beat_number: 6, beat_name: "Break into Two", act: 2, hint: "Quyết định bước sang thế giới mới." },
  { beat_number: 7, beat_name: "B Story", act: 2, hint: "Câu chuyện phụ — thường là tình cảm, thể hiện chủ đề." },
  { beat_number: 8, beat_name: "Fun & Games", act: 2, hint: "Nhân vật dùng sức mới — 'promise of the premise'." },
  { beat_number: 9, beat_name: "Midpoint", act: 2, hint: "Điểm xoay — thắng/thua giả, stakes nâng lên." },
  { beat_number: 10, beat_name: "Bad Guys Close In", act: 2, hint: "Kẻ thù siết vòng, nội bộ rạn nứt." },
  { beat_number: 11, beat_name: "All Is Lost", act: 2, hint: "Mất mát tất yếu — thường là mentor." },
  { beat_number: 12, beat_name: "Dark Night of Soul", act: 2, hint: "Đêm tối tâm hồn — tuyệt vọng cùng cực." },
  { beat_number: 13, beat_name: "Break into Three", act: 3, hint: "Sáng kiến mới — bước vào hồi kết." },
  { beat_number: 14, beat_name: "Finale", act: 3, hint: "Hồi kết — tổng hợp bài học, đối mặt kẻ thù." },
  { beat_number: 15, beat_name: "Final Image", act: 3, hint: "Hình ảnh cuối — đối lập opening, khẳng định sự thay đổi." },
];

/**
 * Nhãn 3 hồi cho divider giữa các nhóm beat trên UI.
 */
export const ACT_LABELS: Record<1 | 2 | 3, { name: string; range: string }> = {
  1: { name: "Hồi 1 · Khởi", range: "beat 1–5" },
  2: { name: "Hồi 2 · Đối đầu", range: "beat 6–12" },
  3: { name: "Hồi 3 · Giải quyết", range: "beat 13–15" },
};

/**
 * Trạng thái hiển thị của một beat trên UI.
 * - `empty`: chưa có nội dung.
 * - `draft`: đang có chỉnh sửa local chưa lưu (vermilion).
 * - `filled`: đã có nội dung đã lưu (sage).
 */
export type BeatStatus = "empty" | "draft" | "filled";

/**
 * Suy luận trạng thái hiển thị từ nội dung + cờ dirty (chỉnh sửa local chưa lưu).
 * @param content - Nội dung beat (null khi rỗng).
 * @param isDirty - True khi user đang sửa chưa blur-save.
 * @returns Trạng thái hiển thị empty | draft | filled.
 */
export function deriveStatus(
  content: string | null,
  isDirty: boolean,
): BeatStatus {
  if (isDirty) return "draft";
  if (content != null && content.trim().length > 0) return "filled";
  return "empty";
}

/**
 * Lấy danh sách beat của một novel, sắp xếp theo beat_number.
 * @param novelId - UUID của novel.
 * @returns Mảng Beat (có thể rỗng nếu chưa init_beats).
 */
export async function listBeats(novelId: string): Promise<Beat[]> {
  const { data, error } = await supabase
    .from("beats")
    .select("*")
    .eq("novel_id", novelId)
    .order("beat_number", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Beat[];
}

/**
 * Cập nhật nội dung một beat đã có trong DB (match BE update_beat by id).
 * @param beatId - UUID của beat row.
 * @param content - Nội dung mới.
 * @returns Beat đã cập nhật.
 */
export async function updateBeat(
  beatId: string,
  content: string,
): Promise<Beat> {
  const { data, error } = await supabase
    .from("beats")
    .update({ content })
    .eq("id", beatId)
    .select()
    .single();
  if (error) throw error;
  return data as Beat;
}

/**
 * Tạo beat mới khi DB chưa có row (resilient khi init_beats chưa chạy).
 * @param novelId - UUID của novel.
 * @param beatNumber - Số thứ tự beat (1–15).
 * @param beatName - Tên beat (StC).
 * @param content - Nội dung beat.
 * @returns Beat vừa tạo (kèm id mới).
 */
export async function createBeat(
  novelId: string,
  beatNumber: number,
  beatName: string,
  content: string,
): Promise<Beat> {
  const { data, error } = await supabase
    .from("beats")
    .insert({ novel_id: novelId, beat_number: beatNumber, beat_name: beatName, content })
    .select()
    .single();
  if (error) throw error;
  return data as Beat;
}
