"use client";

import { useEffect, useState } from "react";

import { useT } from "@/i18n/use-t";
import { publicService, type SiteLinksApi } from "@/services/public.service";

export function MarketingFooter() {
  const { t } = useT();
  const [siteLinks, setSiteLinks] = useState<SiteLinksApi | null>(null);

  useEffect(() => {
    let cancelled = false;
    publicService
      .siteLinks()
      .then((data) => {
        if (!cancelled) setSiteLinks(data);
      })
      .catch(() => {
        if (!cancelled) setSiteLinks(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <footer className="border-t border-white/10 py-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-6 text-sm text-white/50 md:flex-row md:items-center md:justify-between md:px-8">
        <p>© {new Date().getFullYear()} {t("marketing.footer.copyright")}</p>
        <div className="flex flex-wrap gap-4">
          {siteLinks?.official_x_url ? (
            <a href={siteLinks.official_x_url} target="_blank" rel="noopener noreferrer" className="hover:text-white/80">
              {t("marketing.footer.officialX")}
            </a>
          ) : null}
          {siteLinks?.telegram_url ? (
            <a href={siteLinks.telegram_url} target="_blank" rel="noopener noreferrer" className="hover:text-white/80">
              {t("marketing.footer.telegram")}
            </a>
          ) : null}
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
