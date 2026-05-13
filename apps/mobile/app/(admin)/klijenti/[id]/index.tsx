import { useLocalSearchParams } from "expo-router";
import { ClientDetail } from "@/components/admin/client-detail";

export default function KlijentiClientDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ClientDetail id={id} />;
}
