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
      <header className="flex items-center gap-3 border-b border-border pb-4">
        <Clapperboard aria-hidden className="size-7 shrink-0 text-super" />
        <div>
          <h1 className="font-display text-2xl uppercase leading-none">Jellyfin Matcher</h1>
          <p className="mt-1 text-[12.5px] text-muted-fg">
            Everyone swipes the same deck. First film you all like wins.
          </p>
        </div>
      </header>
      <HomeActions />
    </main>
  );
}
