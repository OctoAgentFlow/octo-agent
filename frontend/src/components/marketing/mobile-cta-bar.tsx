"use client";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/use-t";

export function MobileCtaBar() {
  const { t } = useT();
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-white/15 bg-[#070b17]/90 p-3 backdrop-blur md:hidden">
      <Button className="h-11 w-full bg-gradient-to-r from-blue-500 to-violet-500 text-white hover:opacity-90">
        {t("marketing.hero.primaryCta")}
      </Button>
    </div>
  );
}
