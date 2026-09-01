import type { Metadata } from 'next';
import { RoomClient } from '../../../src/ui/RoomClient';

/**
 * The shape of a room code, for display only.
 *
 * Deliberately a SUPERSET of the alphabet `server/validate.ts` issues and
 * accepts: four alphanumerics, not the unambiguous-characters set. A guard that
 * narrowed the server's rule would drop the code out of the tab for a room the
 * server was perfectly happy with, and it would do it silently, the next time
 * somebody changed the alphabet in one file and not the other. Widening cannot
 * fail that way, and the server is still the only thing that decides whether a
 * room exists — this decides what a tab is allowed to say.
 *
 * It exists at all because `roomId` is a path segment, which is to say it is
 * whatever anybody typed. Without a bound, `/room/<four kilobytes>` becomes a
 * four-kilobyte document title. Nothing is injected — the title is text, not
 * markup — but a tab is a place a screen reader user is trying to read quickly,
 * and an unbounded string is the wrong thing to put in one.
 */
const ROOM_CODE = /^[A-Z0-9]{4}$/;

/*
  WCAG 2.2 A 2.4.2 — the F9 half of B1 in docs/PLAN-1.1.md.

  This route exported no metadata, so a room's tab read "Jellyfin Matcher", the
  same as the home screen it was opened from and the same as the guide. The room
  code is the one thing that distinguishes one of these tabs from another, and
  it is also what the room is about: the code is how five phones found each
  other. So it leads, and the root layout's template appends the app name.

  A path that is not a code gets the bare word instead. "Room" is honest about a
  page that is about to tell you it could not join one; a title claiming
  `Room <whatever was typed>` would say a room by that name exists, which is
  precisely what the screen underneath is about to deny.
*/
export async function generateMetadata({
  params,
}: {
  params: Promise<{ roomId: string }>;
}): Promise<Metadata> {
  const { roomId } = await params;
  const code = roomId.toUpperCase();
  return { title: ROOM_CODE.test(code) ? `Room ${code}` : 'Room' };
}

export default async function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  return <RoomClient roomId={roomId.toUpperCase()} />;
}
