import { useStaffUsers } from "@/staff/hooks/use-admin-list";
import { useTranslation } from "react-i18next";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Owner-only assignee picker on the ticket page (needs the staff user list from the admin API). */
export function TicketAssignSelect({ assignedTo, disabled, onChange }: {
  assignedTo: number | null | undefined;
  disabled?: boolean;
  onChange: (assignedTo: number | null) => void;
}) {
  const { t } = useTranslation("tickets");
  // Only admins and owners can be assigned; the server filters (the full user list is paged)
  const { data: usersData } = useStaffUsers();
  const staffUsers = usersData?.filter((u) => u.role === "admin" || u.role === "owner") || [];

  return (
    <Select value={assignedTo ? String(assignedTo) : "unassigned"} onValueChange={(v) => onChange(v === "unassigned" ? null : parseInt(v))} disabled={disabled}>
      <SelectTrigger className="h-10">
        <SelectValue placeholder={t("staff:tickets.detail.selectStaff", "Select staff")} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="unassigned">{t("assignment.unassigned", "Awaiting Pilot")}</SelectItem>
        {staffUsers.map((admin) => (
          <SelectItem key={admin.id} value={String(admin.id)}>
            {admin.username}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
