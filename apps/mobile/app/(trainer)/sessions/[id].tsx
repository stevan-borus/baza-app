import { useLocalSearchParams, type Href } from "expo-router";
import { SessionDetail } from "@/components/admin/session-detail";

export default function TrainerSessionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <SessionDetail
      id={id}
      buildClientHref={(userId) => `/(trainer)/clients/${userId}` as Href}
    />
  );
}
