import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";

export function PackageStatusPill({
  status,
}: {
  status: "active" | "expiring" | "paused" | "expired" | "none";
}) {
  const { t } = useTranslation();
  if (status === "active") {
    return <Badge status="success">{t("admin.clientDetail.status.active")}</Badge>;
  }
  if (status === "expiring") {
    return <Badge status="warning">{t("admin.clientDetail.status.expiring")}</Badge>;
  }
  if (status === "paused") {
    return <Badge status="neutral">{t("admin.clientDetail.status.paused")}</Badge>;
  }
  if (status === "expired") {
    return <Badge status="danger">{t("admin.clientDetail.status.expired")}</Badge>;
  }
  return <Badge status="neutral">{t("admin.clientDetail.status.none")}</Badge>;
}
