import { Clapperboard } from 'lucide-react';
import { HomeActions } from '../src/ui/HomeActions';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      {/*
        Not a hero. A hero at the root is the single clearest signal that a
        page wants something from you before it does anything, and the first
        person through this door is usually a guest who scanned a QR.
      */}
      <header className="flex items-center gap-3.5 px-1 pb-1">
        <Clapperboard aria-hidden className="size-8 shrink-0 text-super" />
        <div>
          <h1 className="text-[26px] font-semibold leading-none tracking-[-0.02em]">Jellyfin Matcher</h1>
          <p className="mt-1.5 text-[13.5px] text-muted-fg">
            Everyone swipes the same deck. First film you all like wins.
          </p>
        </div>
      </header>
      <HomeActions />
    </main>
  );
}
