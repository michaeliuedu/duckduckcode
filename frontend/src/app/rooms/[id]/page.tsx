import { RoomView } from "@/components/RoomView";

export default async function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RoomView roomId={id} />;
}
