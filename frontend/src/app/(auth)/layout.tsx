export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="surface-page relative min-h-screen overflow-hidden">
      <div className="relative min-h-screen">{children}</div>
    </div>
  );
}
