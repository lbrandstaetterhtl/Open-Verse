import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Notification, NotificationPreferences, User } from "@shared/schema";

export type NotificationWithActor = Notification & {
  actor?: Partial<User> | null;
};

export function useNotifications(options: { 
  limit?: number; 
  offset?: number; 
  unreadOnly?: boolean;
  type?: string[];
} = {}) {
  const queryKey = ["/api/notifications", options];

  const query = useQuery<NotificationWithActor[]>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (options.limit) params.set("limit", options.limit.toString());
      if (options.offset) params.set("offset", options.offset.toString());
      if (options.unreadOnly) params.set("unreadOnly", "true");
      if (options.type) params.set("type", options.type.join(","));

      const res = await fetch(`/api/notifications?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch notifications");
      return res.json();
    },
  });

  return query;
}

export function useNotificationCounts() {
  return useQuery<{ unread: number; unseen: number }>({
    queryKey: ["/api/notifications/counts"],
    queryFn: async () => {
      const res = await fetch("/api/notifications/counts");
      if (!res.ok) throw new Error("Failed to fetch notification counts");
      return res.json();
    },
    refetchInterval: 30000, // Fallback polling if WS fails
  });
}

export function useNotificationMutations() {
  const markAsRead = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/notifications/${id}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/counts"] });
    },
  });

  const markAllAsRead = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/notifications/read-all");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/counts"] });
    },
  });

  const markAsSeen = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/notifications/seen");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/counts"] });
    },
  });

  const deleteNotification = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/notifications/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/counts"] });
    },
  });

  return { markAsRead, markAllAsRead, markAsSeen, deleteNotification };
}

export function useNotificationPreferences() {
  const query = useQuery<NotificationPreferences>({
    queryKey: ["/api/notifications/preferences"],
    queryFn: async () => {
      const res = await fetch("/api/notifications/preferences");
      if (!res.ok) throw new Error("Failed to fetch notification preferences");
      return res.json();
    },
  });

  const updatePreferences = useMutation({
    mutationFn: async (prefs: Partial<NotificationPreferences>) => {
      const res = await apiRequest("PATCH", "/api/notifications/preferences", prefs);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/preferences"] });
    },
  });

  return { ...query, updatePreferences };
}
