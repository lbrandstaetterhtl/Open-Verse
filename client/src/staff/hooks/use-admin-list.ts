import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { apiErrorFrom } from "@/lib/server-messages";

/** Rows per page of the admin lists (the server allows up to 500 per request). */
export const ADMIN_PAGE_SIZE = 100;

export type AdminPage<T> = { rows: T[]; total: number };

/**
 * One page of a server-paged admin list (/api/admin/users, /reports, /bans): ?limit=&offset= plus filters,
 * the number of matching rows comes in the X-Total-Count header. The query key starts with `path`, so
 * invalidateQueries({ queryKey: [path] }) refreshes every page.
 */
export function useAdminList<T>(path: string, page: number, filters: Record<string, string | undefined> = {}, pageSize = ADMIN_PAGE_SIZE) {
  const params = new URLSearchParams({ limit: String(pageSize), offset: String(page * pageSize) });
  for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
  const url = `${path}?${params}`;
  return useQuery<AdminPage<T>>({
    queryKey: [path, { page, pageSize, ...filters }],
    queryFn: async () => {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw apiErrorFrom(res.status, res.statusText, await res.text());
      const rows = (await res.json()) as T[];
      const total = Number(res.headers.get("X-Total-Count"));
      return { rows, total: Number.isFinite(total) && res.headers.has("X-Total-Count") ? total : rows.length };
    },
    placeholderData: keepPreviousData,
  });
}

/** `value`, updated only after it has not changed for `ms` (search fields that query the server). */
export function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/** All admins and owners (group members, ticket assignees): /api/admin/users?role=staff, one page of up to 500. */
export function useStaffUsers<T = any>() {
  const query = useAdminList<T>("/api/admin/users", 0, { role: "staff" }, 500);
  return { ...query, data: query.data?.rows };
}
