export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center bg-surface px-4 py-16">
      <div className="w-full max-w-sm rounded-lg border border-surface-border bg-background p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-accent" />
          <span className="text-lg font-semibold tracking-tight">BusinessOps</span>
        </div>
        {children}
      </div>
    </div>
  );
}
