import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ScrollView, Switch } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, XStack, YStack } from "tamagui";
import { ActionButton } from "@/components/ui/action-button";
import { AppSheet } from "@/components/ui/sheet";
import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Input } from "@/components/ui/input";
import { SectionLabel } from "@/components/ui/typography";
import { TAB_BAR_HEIGHT, HEADER_HEIGHT } from "@/components/ui/constants";
import { SegmentedControl } from "@/components/ui/tabs";
import { clientsQueries } from "@/lib/queries/clients-queries-factory";
import { invitesQueries, type Invite } from "@/lib/queries/invites-queries-factory";
import { packagesQueries } from "@/lib/queries/packages-queries-factory";

export default function AdminClients() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"clients" | "invites">("clients");
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [showCreateClient, setShowCreateClient] = useState(false);
  const [showEditClient, setShowEditClient] = useState<string | null>(null);
  const [showAssignPackage, setShowAssignPackage] = useState<string | null>(null);
  const [showPause, setShowPause] = useState<string | null>(null);

  const [inviteForm, setInviteForm] = useState({ email: "", fullName: "", phone: "" });
  const [clientForm, setClientForm] = useState({ email: "", fullName: "", phone: "" });
  const [editForm, setEditForm] = useState({ fullName: "", phone: "", notes: "", isActive: true });
  const [assignForm, setAssignForm] = useState({ packageTypeId: "", startsAt: "" });
  const [pauseForm, setPauseForm] = useState({ startsAt: "", endsAt: "", reason: "" });

  const clientsQuery = useQuery(clientsQueries.list());
  const invitesQuery = useQuery(invitesQueries.list());
  const packageTypesQuery = useQuery(packagesQueries.types());

  const createInviteMutation = useMutation({ ...invitesQueries.create(), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["invites"] }); setShowInviteForm(false); setInviteForm({ email: "", fullName: "", phone: "" }); } });
  const revokeMutation = useMutation({ ...invitesQueries.revoke(), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invites"] }) });
  const resendMutation = useMutation({ ...invitesQueries.resend(), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invites"] }) });

  const createClientMutation = useMutation({ ...clientsQueries.create(), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["clients"] }); setShowCreateClient(false); setClientForm({ email: "", fullName: "", phone: "" }); } });
  const updateClientMutation = useMutation({ ...clientsQueries.update(), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["clients"] }); setShowEditClient(null); } });
  const assignPackageMutation = useMutation({ ...packagesQueries.createClientPackage(), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["packages"] }); setShowAssignPackage(null); setAssignForm({ packageTypeId: "", startsAt: "" }); } });
  const pauseMutation = useMutation({ ...packagesQueries.pause(), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["packages"] }); setShowPause(null); setPauseForm({ startsAt: "", endsAt: "", reason: "" }); } });

  const clients = clientsQuery.data?.clients ?? [];
  const invites = invitesQuery.data?.invites ?? [];

  const inviteStatusKeys: Record<string, string> = { PENDING: "admin.clients.inviteStatusPending", COMPLETED: "admin.clients.inviteStatusCompleted", REVOKED: "admin.clients.inviteStatusRevoked", EXPIRED: "admin.clients.inviteStatusExpired" };
  const { t } = useTranslation();

  return (
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <YStack px="$5" gap="$6" style={{ paddingTop: insets.top + HEADER_HEIGHT + 12, paddingBottom: TAB_BAR_HEIGHT + 16 }}>
        <SegmentedControl
          segments={[
            { value: "clients" as const, label: t("admin.clients.tabClients", { count: clients.length }) },
            { value: "invites" as const, label: t("admin.clients.tabInvites", { count: invites.length }) },
          ]}
          value={tab}
          onValueChange={setTab}
        />

        {tab === "clients" ? (
          <YStack gap="$3">
            <Card>
              <YStack gap="$3">
                <SectionLabel>{t("admin.clients.title")}</SectionLabel>
                <XStack gap="$2">
                  <ActionButton icon="plus" label={t("admin.clients.newClient")} onPress={() => setShowCreateClient(true)} />
                </XStack>
              </YStack>
            </Card>
            {clientsQuery.isError ? <ErrorState message={t("admin.clients.error")} /> : null}
            {clients.length === 0 ? <EmptyState title={t("admin.clients.empty")} /> : null}
            {clients.map((client) => (
              <Card key={client.id}>
                <YStack gap="$2.5">
                  <YStack>
                    <Text fontWeight="600" fontSize="$3" color="$color">
                      {client.user.fullName}
                    </Text>
                    <Text fontSize="$2" color="$color10">
                      {client.user.email}
                      {client.user.phone ? ` · ${client.user.phone}` : ""}
                    </Text>
                  </YStack>
                  {client.notes ? (
                    <YStack
                      bg="$backgroundHover"
                      rounded={10}
                      px="$3"
                      py="$2"
                    >
                      <Text fontSize="$2" color="$color9">
                        {t("admin.clients.notes", { text: client.notes })}
                      </Text>
                    </YStack>
                  ) : null}
                  <XStack gap="$3" flexWrap="wrap">
                    <ActionButton
                      icon="pencil"
                      label={t("admin.clients.edit")}
                      onPress={() => {
                        setEditForm({ fullName: client.user.fullName, phone: client.user.phone ?? "", notes: client.notes ?? "", isActive: true });
                        setShowEditClient(client.id);
                      }}
                    />
                    <ActionButton icon="gift" label={t("admin.clients.assignPackage")} onPress={() => setShowAssignPackage(client.id)} />
                    <ActionButton icon="pause" label={t("admin.clients.pause")} onPress={() => setShowPause(client.id)} />
                  </XStack>
                </YStack>
              </Card>
            ))}
          </YStack>
        ) : (
          <YStack gap="$3">
            <Card>
              <YStack gap="$3">
                <SectionLabel>{t("admin.clients.tabInvites", { count: invites.length })}</SectionLabel>
                <Button size="small" onPress={() => setShowInviteForm(true)}>
                  {t("admin.clients.newInvite")}
                </Button>
              </YStack>
            </Card>
            {invitesQuery.isError ? <ErrorState message={t("admin.clients.invitesError")} /> : null}
            {invites.length === 0 ? <EmptyState title={t("admin.clients.invitesEmpty")} /> : null}
            {invites.map((invite: Invite) => (
              <Card key={invite.id}>
                <YStack gap="$2.5">
                  <XStack justify="space-between" items="center">
                    <YStack flex={1}>
                      <Text fontWeight="600" fontSize="$3" color="$color">{invite.fullName}</Text>
                      <Text fontSize="$2" color="$color10">{invite.email}</Text>
                    </YStack>
                    <Badge color={invite.status === "COMPLETED" ? "$accent1" : invite.status === "PENDING" ? "$accent8" : "$red10"}>
                      {inviteStatusKeys[invite.status] ? t(inviteStatusKeys[invite.status]) : invite.status}
                    </Badge>
                  </XStack>
                  {invite.status === "PENDING" ? (
                    <XStack gap="$2">
                      <ActionButton icon="refresh" label={t("admin.clients.resend")} onPress={() => resendMutation.mutate(invite.id)} disabled={resendMutation.isPending} />
                      <ActionButton icon="ban" label={t("admin.clients.revoke")} onPress={() => revokeMutation.mutate(invite.id)} disabled={revokeMutation.isPending} variant="danger" />
                    </XStack>
                  ) : null}
                </YStack>
              </Card>
            ))}
          </YStack>
        )}

        {/* Create Client Sheet */}
        <AppSheet open={showCreateClient} onOpenChange={setShowCreateClient}>
          <YStack gap="$4">
            <Text fontSize="$6" fontWeight="700" color="$color" letterSpacing={-0.3}>
              {t("admin.clients.sheetNewClient")}
            </Text>
            <Input placeholder={t("admin.clients.placeholderEmail")} autoCapitalize="none" keyboardType="email-address" value={clientForm.email} onChangeText={(v) => setClientForm((s) => ({ ...s, email: v }))} />
            <Input placeholder={t("admin.clients.placeholderFullName")} value={clientForm.fullName} onChangeText={(v) => setClientForm((s) => ({ ...s, fullName: v }))} />
            <Input placeholder={t("admin.clients.placeholderPhone")} keyboardType="phone-pad" value={clientForm.phone} onChangeText={(v) => setClientForm((s) => ({ ...s, phone: v }))} />
            <Button disabled={createClientMutation.isPending || !clientForm.email || !clientForm.fullName} onPress={() => createClientMutation.mutate({ email: clientForm.email, fullName: clientForm.fullName, phone: clientForm.phone || undefined })}>
              {t("admin.clients.createClient")}
            </Button>
            {createClientMutation.isError ? <ErrorState message={t("admin.clients.createError")} /> : null}
          </YStack>
        </AppSheet>

        {/* Edit Client Sheet */}
        <AppSheet open={!!showEditClient} onOpenChange={() => setShowEditClient(null)}>
          <YStack gap="$4">
            <Text fontSize="$6" fontWeight="700" color="$color" letterSpacing={-0.3}>
              {t("admin.clients.sheetEdit")}
            </Text>
            <Input placeholder={t("admin.clients.placeholderFullName")} value={editForm.fullName} onChangeText={(v) => setEditForm((s) => ({ ...s, fullName: v }))} />
            <Input placeholder={t("admin.clients.placeholderPhoneRequired")} keyboardType="phone-pad" value={editForm.phone} onChangeText={(v) => setEditForm((s) => ({ ...s, phone: v }))} />
            <Input placeholder={t("admin.clients.placeholderNotes")} multiline value={editForm.notes} onChangeText={(v) => setEditForm((s) => ({ ...s, notes: v }))} />
            <XStack items="center" gap="$3" py="$2">
              <Text fontSize="$3" color="$color">{t("admin.clients.active")}</Text>
              <Switch value={editForm.isActive} onValueChange={(v) => setEditForm((s) => ({ ...s, isActive: v }))} trackColor={{ false: "#404040", true: "#2e5b42" }} />
            </XStack>
            <Button disabled={updateClientMutation.isPending} onPress={() => showEditClient && updateClientMutation.mutate({ id: showEditClient, fullName: editForm.fullName, phone: editForm.phone || undefined, notes: editForm.notes || undefined, isActive: editForm.isActive })}>
              {t("admin.clients.save")}
            </Button>
            {updateClientMutation.isError ? <ErrorState message={t("admin.clients.updateError")} /> : null}
          </YStack>
        </AppSheet>

        {/* Invite Sheet */}
        <AppSheet open={showInviteForm} onOpenChange={setShowInviteForm}>
          <YStack gap="$4">
            <Text fontSize="$6" fontWeight="700" color="$color" letterSpacing={-0.3}>
              {t("admin.clients.sheetInvite")}
            </Text>
            <Input placeholder={t("admin.clients.placeholderEmail")} autoCapitalize="none" keyboardType="email-address" value={inviteForm.email} onChangeText={(v) => setInviteForm((s) => ({ ...s, email: v }))} />
            <Input placeholder={t("admin.clients.placeholderFullName")} value={inviteForm.fullName} onChangeText={(v) => setInviteForm((s) => ({ ...s, fullName: v }))} />
            <Input placeholder={t("admin.clients.placeholderPhone")} keyboardType="phone-pad" value={inviteForm.phone} onChangeText={(v) => setInviteForm((s) => ({ ...s, phone: v }))} />
            <Button disabled={createInviteMutation.isPending || !inviteForm.email || !inviteForm.fullName} onPress={() => createInviteMutation.mutate({ email: inviteForm.email, fullName: inviteForm.fullName, phone: inviteForm.phone || undefined })}>
              {t("admin.clients.sendInvite")}
            </Button>
            {createInviteMutation.isError ? <ErrorState message={t("admin.clients.inviteError")} /> : null}
          </YStack>
        </AppSheet>

        {/* Assign Package Sheet */}
        <AppSheet open={!!showAssignPackage} onOpenChange={() => setShowAssignPackage(null)}>
          <YStack gap="$4">
            <Text fontSize="$6" fontWeight="700" color="$color" letterSpacing={-0.3}>
              {t("admin.clients.sheetAssign")}
            </Text>
            <SectionLabel>{t("admin.clients.packageType")}</SectionLabel>
            {(packageTypesQuery.data?.packageTypes ?? []).map((pt) => (
              <Button
                key={pt.id}
                size="small"
                variant={assignForm.packageTypeId === pt.id ? "primary" : "secondary"}
                onPress={() => setAssignForm((s) => ({ ...s, packageTypeId: pt.id }))}
              >
                {t("admin.clients.sessionsCount", { name: pt.name, count: pt.sessionCount })}
              </Button>
            ))}
            <Input placeholder={t("admin.clients.placeholderStart")} value={assignForm.startsAt} onChangeText={(v) => setAssignForm((s) => ({ ...s, startsAt: v }))} />
            <Button disabled={assignPackageMutation.isPending || !assignForm.packageTypeId || !assignForm.startsAt} onPress={() => showAssignPackage && assignPackageMutation.mutate({ clientProfileId: showAssignPackage, packageTypeId: assignForm.packageTypeId, startsAt: assignForm.startsAt })}>
              {t("admin.clients.assign")}
            </Button>
            {assignPackageMutation.isError ? <ErrorState message={t("admin.clients.assignError")} /> : null}
          </YStack>
        </AppSheet>

        {/* Pause Package Sheet */}
        <AppSheet open={!!showPause} onOpenChange={() => setShowPause(null)}>
          <YStack gap="$4">
            <Text fontSize="$6" fontWeight="700" color="$color" letterSpacing={-0.3}>
              {t("admin.clients.sheetPause")}
            </Text>
            <Input placeholder={t("admin.clients.pauseStart")} value={pauseForm.startsAt} onChangeText={(v) => setPauseForm((s) => ({ ...s, startsAt: v }))} />
            <Input placeholder={t("admin.clients.pauseEnd")} value={pauseForm.endsAt} onChangeText={(v) => setPauseForm((s) => ({ ...s, endsAt: v }))} />
            <Input placeholder={t("admin.clients.pauseReason")} value={pauseForm.reason} onChangeText={(v) => setPauseForm((s) => ({ ...s, reason: v }))} />
            <Button disabled={pauseMutation.isPending || !pauseForm.startsAt || !pauseForm.endsAt} onPress={() => showPause && pauseMutation.mutate({ clientProfileId: showPause, startsAt: pauseForm.startsAt, endsAt: pauseForm.endsAt, reason: pauseForm.reason || undefined })}>
              {t("admin.clients.pauseSubmit")}
            </Button>
            {pauseMutation.isError ? <ErrorState message={t("admin.clients.pauseError")} /> : null}
          </YStack>
        </AppSheet>

      </YStack>
    </ScrollView>
  );
}
