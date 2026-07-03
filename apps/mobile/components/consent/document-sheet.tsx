import { useQuery } from "@tanstack/react-query";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { AppSheet } from "@/components/ui/sheet";
import { LegalDocumentViewer } from "./legal-document-viewer";
import { legalQueries } from "@/lib/queries/legal-queries-factory";
import type { ConsentDocumentKey } from "@baza/types/consent";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentKey: ConsentDocumentKey | null;
  locale: "sr" | "en";
  /** Optional `{{key}}` substitutions applied to the markdown source. */
  substitutions?: Record<string, string>;
};

/**
 * Single bottom-sheet that opens whichever legal doc is requested. Caller
 * controls which doc via `documentKey` (null = closed). Opens to a fixed
 * 90% snap point because legal docs are long and dynamic sizing collapses
 * to a peek before content settles. The doc title is rendered by the
 * markdown body itself (every doc starts with an `#` heading) — we don't
 * add a sheet-level title to avoid a duplicate.
 */
export function DocumentSheet({
  open,
  onOpenChange,
  documentKey,
  locale,
  substitutions,
}: Props) {
  const { t } = useTranslation();
  const query = useQuery({
    ...legalQueries.byKey(documentKey ?? "tos", locale),
    enabled: open && documentKey !== null,
  });

  return (
    <AppSheet open={open} onOpenChange={onOpenChange} snapPoints={["90%"]}>
      {query.data ? (
        <LegalDocumentViewer
          body={query.data.body}
          substitutions={substitutions}
        />
      ) : query.isError ? (
        <Text className="text-danger py-4">{t("legal.loadError")}</Text>
      ) : (
        <View className="py-4">
          <Text className="text-muted">…</Text>
        </View>
      )}
    </AppSheet>
  );
}
