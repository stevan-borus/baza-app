import { useLocalSearchParams } from "expo-router";
import { SessionDetail } from "@/components/admin/session-detail";

export default function KlijentiSessionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SessionDetail id={id} />;
}
