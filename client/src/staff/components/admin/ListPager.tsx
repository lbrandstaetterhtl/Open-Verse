import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/** "1–100 of 2,489" with previous/next buttons for the server-paged admin lists. Hidden when one page holds all. */
export function ListPager({ page, pageSize, total, onPageChange }: { page: number; pageSize: number; total: number; onPageChange: (page: number) => void }) {
  const { t, i18n } = useTranslation();
  if (total <= pageSize && page === 0) return null;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const nf = new Intl.NumberFormat(i18n.language);
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-3">
      <span className="ov-data text-xs text-muted-foreground">
        {t("staff:admin_paging.range", { from: nf.format(from), to: nf.format(to), total: nf.format(total), defaultValue: "{{from}}–{{to}} of {{total}}" })}
      </span>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" className="h-8 gap-1 px-2" disabled={page <= 0} onClick={() => onPageChange(page - 1)} aria-label={t("ui.pagination.previous_aria", "Go to previous page")}>
          <ChevronLeft className="h-4 w-4" /> {t("ui.pagination.previous", "Previous")}
        </Button>
        <Button variant="ghost" size="sm" className="h-8 gap-1 px-2" disabled={page >= pages - 1} onClick={() => onPageChange(page + 1)} aria-label={t("ui.pagination.next_aria", "Go to next page")}>
          {t("ui.pagination.next", "Next")} <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
