import { redirect } from "next/navigation";

import { FAQSection } from "@/components/marketing/faq-section";
import { FeatureCardsSection } from "@/components/marketing/feature-cards-section";
import { MarketingFooter } from "@/components/marketing/footer";
import { HeroSection } from "@/components/marketing/hero-section";
import { MobileCtaBar } from "@/components/marketing/mobile-cta-bar";
import { MarketingNavbar } from "@/components/marketing/navbar";
import { PricingSection } from "@/components/marketing/pricing-section";
import { DashboardPreviewSection } from "@/components/marketing/dashboard-preview-section";
import { WorkflowSection } from "@/components/marketing/workflow-section";
import { OAFBotSection } from "@/components/marketing/oaf-bot-section";
import { AutoPostSection } from "@/components/marketing/auto-post-section";
import { ComparisonSection } from "@/components/marketing/comparison-section";
import { OperatingLoopSection } from "@/components/marketing/operating-loop-section";

export default function Home() {
  if (process.env.NEXT_PUBLIC_FRONTEND_ROLE === "admin") {
    redirect("/admin");
  }

  return (
    <div className="surface-page relative min-h-screen overflow-hidden">
      <MarketingNavbar />
      <main className="pb-20 md:pb-0">
        <HeroSection />
        <OAFBotSection />
        <FeatureCardsSection />
        <WorkflowSection />
        <AutoPostSection />
        <OperatingLoopSection />
        <ComparisonSection />
        <DashboardPreviewSection />
        <PricingSection />
        <FAQSection />
      </main>
      <MarketingFooter />
      <MobileCtaBar />
    </div>
  );
}
