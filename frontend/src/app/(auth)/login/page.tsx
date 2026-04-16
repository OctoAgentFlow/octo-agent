import { AuthCard } from "@/components/auth/auth-card";
import { BrandPanel } from "@/components/auth/brand-panel";

export default function LoginPage() {
  return (
    <div className="mx-auto grid min-h-screen w-full max-w-6xl items-center gap-6 px-6 py-10 md:grid-cols-2 md:px-8">
      <BrandPanel />
      <AuthCard />
    </div>
  );
}
