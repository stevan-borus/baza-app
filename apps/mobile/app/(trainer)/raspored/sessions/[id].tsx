import { useLocalSearchParams, type Href } from "expo-router";
import { SessionDetail } from "@/components/admin/session-detail";

export default function TrainerSessionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <SessionDetail
      id={id}
      // Push to the sessions-stack variant of the client profile so the
      // back button returns to THIS session detail, not the Clients tab.
      buildClientHref={(userId) =>
        `/(trainer)/raspored/sessions/clients/${userId}` as Href
      }
    />
  );
}
