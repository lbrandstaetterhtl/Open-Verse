import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { Button, buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-[60vh] w-full flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="ov-data text-4xl text-star">404</p>
      <h1 className="font-display text-2xl font-semibold text-foreground">{t("not_found.title", "Page not found")}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        {t("not_found.hint", "The link is outdated or mistyped, or the content was deleted.")}
      </p>
      <div className="mt-3 flex gap-2">
        <Link href="/" className={buttonVariants()}>
          {t("not_found.home", "Go to feed")}
        </Link>
        <Button variant="ghost" onClick={() => window.history.back()}>
          {t("not_found.back", "Back")}
        </Button>
      </div>
    </div>
  );
}
