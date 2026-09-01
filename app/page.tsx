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
          {/*
            The page's only <h1>, and the only one it should ever have (WCAG 2.2
            A 1.3.1). It says the same words the tab says, which is `default` in
            the root layout's title — deliberately written once, there, rather
            than exported again from this file.
          */}
          <h1 className="text-display font-semibold leading-none tracking-[-0.02em]">Jellyfin Matcher</h1>
          <p className="mt-1.5 text-label text-muted-fg">
            Everyone swipes the same deck. First film you all like wins.
          </p>
        </div>
      </header>
      <HomeActions />
    </main>
  );
}
