import { useLocalSearchParams } from "expo-router";
import { ClientDetail } from "@/components/admin/client-detail";

export default function PregledClientDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ClientDetail id={id} />;
}
