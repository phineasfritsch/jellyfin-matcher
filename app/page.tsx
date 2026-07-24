import { Clapperboard } from 'lucide-react';
import { AuthGate } from '../src/ui/AuthGate';
import { HomeActions } from '../src/ui/HomeActions';

export default function HomePage() {
  return (
    <AuthGate>
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-10 px-6 py-12">
      <header className="flex flex-col items-center gap-4 text-center">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-secondary">
          <Clapperboard aria-hidden className="size-8 text-on-primary" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Jellyfin Matcher</h1>
        <p className="max-w-xs text-base leading-relaxed text-muted-fg">
          Swipe together. Watch tonight. Zero stalemates.
        </p>
      </header>
        <HomeActions />
      </main>
    </AuthGate>
  );
}
