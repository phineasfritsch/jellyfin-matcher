import { AuthGate } from '../../../src/ui/AuthGate';
import { RoomClient } from '../../../src/ui/RoomClient';

export default async function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  return (
    <AuthGate>
      <RoomClient roomId={roomId.toUpperCase()} />
    </AuthGate>
  );
}
