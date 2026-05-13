import { useLocalSearchParams, type Href } from "expo-router";
import { SessionDetail } from "@/components/admin/session-detail";

export default function PregledSessionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <SessionDetail
      id={id}
      buildClientHref={(userId) =>
        `/(admin)/pregled/klijenti/${userId}` as Href
      }
    />
  );
}
