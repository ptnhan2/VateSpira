import { supabase } from "@/lib/supabase";

/**
 * Một scene thuộc beat — mirror schema bảng `scenes` (UF-3 + UF-4b).
 * Scene là đơn vị chi tiết hơn beat: title + summary + outline, KHÔNG có prose (UF-4 scope).
 */
export interface Scene {
  id: string;
  novel_id: string;
  beat_id: string;
  scene_number: number;
  title: string;
  summary: string;
  /** Dàn ý chi tiết scene (tình tiết tuần tự + dialogue markers). UF-4b scope expansion. */
  outline: string | null;
  status: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/**
 * Lấy danh sách scene của một novel, sắp xếp theo beat_id rồi scene_number.
 * @param novelId - UUID của novel.
 * @returns Mảng Scene (có thể rỗng nếu chưa có scene nào).
 */
export async function listScenes(novelId: string): Promise<Scene[]> {
  const { data, error } = await supabase
    .from("scenes")
    .select("*")
    .eq("novel_id", novelId)
    .order("beat_id", { ascending: true })
    .order("scene_number", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Scene[];
}

/**
 * Tạo scene mới thuộc một beat. Status mặc định 'empty' (DB default).
 * @param novelId - UUID novel.
 * @param beatId - UUID beat (FK → beats.id).
 * @param sceneNumber - Số thứ tự scene trong beat (1, 2, 3…).
 * @param title - Tiêu đề scene (rỗng khi user vừa tạo).
 * @param summary - Tóm tắt scene (rỗng khi user vừa tạo).
 * @returns Scene vừa tạo (kèm id mới).
 */
export async function createScene(
  novelId: string,
  beatId: string,
  sceneNumber: number,
  title: string,
  summary: string,
): Promise<Scene> {
  const { data, error } = await supabase
    .from("scenes")
    .insert({
      novel_id: novelId,
      beat_id: beatId,
      scene_number: sceneNumber,
      sort_order: sceneNumber,
      title,
      summary,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Scene;
}

/**
 * Xoá một scene theo id.
 * @param sceneId - UUID scene cần xoá.
 */
export async function deleteScene(sceneId: string): Promise<void> {
  const { error } = await supabase
    .from("scenes")
    .delete()
    .eq("id", sceneId);
  if (error) throw error;
}

/**
 * Cập nhật title + summary + outline của scene (auto-save on blur).
 * @param sceneId - UUID scene.
 * @param title - Tiêu đề mới.
 * @param summary - Tóm tắt mới.
 * @param outline - Dàn ý chi tiết mới.
 * @returns Scene đã cập nhật.
 */
export async function updateScene(
  sceneId: string,
  title: string,
  summary: string,
  outline: string,
): Promise<Scene> {
  const { data, error } = await supabase
    .from("scenes")
    .update({ title, summary, outline: outline || null })
    .eq("id", sceneId)
    .select()
    .single();
  if (error) throw error;
  return data as Scene;
}
