"use client";

import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";

export function MobileCtaBar() {
  const { t } = useT();
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-white/15 bg-[#070b17]/90 p-3 backdrop-blur md:hidden">
      <Link
        href="/login"
        className={cn(
          buttonVariants({ variant: "default" }),
          "h-11 w-full bg-gradient-to-r from-blue-500 to-violet-500 text-white hover:opacity-90"
        )}
      >
        {t("marketing.hero.primaryCta")}
      </Link>
    </div>
  );
}
