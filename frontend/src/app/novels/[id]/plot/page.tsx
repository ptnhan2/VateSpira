import { redirect } from "next/navigation";

/**
 * Redirect /novels/[id]/plot → /novels/[id] (Plot là tab default, không còn standalone page).
 *
 * UF-4b redesign: Plot content render trong 2-panel layout tại /novels/[id].
 * Route này giữ lại cho backward compat (bookmarks, old links).
 */
export default function PlotRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  void params.then((p) => {
    redirect(`/novels/${p.id}`);
  });
  return null;
}
