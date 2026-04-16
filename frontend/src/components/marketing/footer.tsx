"use client";

import { useT } from "@/i18n/use-t";

export function MarketingFooter() {
  const { t } = useT();
  return (
    <footer className="border-t border-white/10 py-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-6 text-sm text-white/50 md:flex-row md:items-center md:justify-between md:px-8">
        <p>© {new Date().getFullYear()} {t("marketing.footer.copyright")}</p>
        <div className="flex gap-4">
          <a href="#" className="hover:text-white/80">
            {t("marketing.footer.terms")}
          </a>
          <a href="#" className="hover:text-white/80">
            {t("marketing.footer.privacy")}
          </a>
          <a href="#" className="hover:text-white/80">
            {t("marketing.footer.contact")}
          </a>
        </div>
      </div>
    </footer>
  );
}
