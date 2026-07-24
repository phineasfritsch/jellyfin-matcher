import { RoomClient } from '../../../src/ui/RoomClient';

export default async function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  return <RoomClient roomId={roomId.toUpperCase()} />;
}
