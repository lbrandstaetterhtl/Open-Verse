import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Ticket, TicketComment, TicketStatusHistory } from "@shared/schema";

export interface TicketFilters {
  status?: string;
  priority?: string;
  type?: string;
  assignedTo?: number;
  createdBy?: number;
  sortBy?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export type TicketWithMeta = Ticket & {
  creatorUsername?: string;
};

export type CommentWithMeta = TicketComment & {
  authorUsername?: string;
  authorRole?: string;
  authorVerified?: boolean;
};

export type HistoryWithMeta = TicketStatusHistory & {
  changedByUsername?: string;
};

export function useTickets(filters?: TicketFilters) {
  const queryParams = new URLSearchParams();
  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== "") {
        queryParams.append(key, String(value));
      }
    });
  }

  return useQuery<{ tickets: TicketWithMeta[]; total: number; page: number; totalPages: number }>({
    queryKey: ["/api/tickets", filters],
    queryFn: async () => {
      const res = await fetch(`/api/tickets?${queryParams.toString()}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    staleTime: 30_000,
  });
}

export function useTicket(id: number) {
  return useQuery<{ ticket: TicketWithMeta, comments: CommentWithMeta[], history: HistoryWithMeta[] }>({
    queryKey: ["/api/tickets", id],
    queryFn: async () => {
      const res = await fetch(`/api/tickets/${id}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    staleTime: 15_000,
  });
}

export function useTicketStats() {
  return useQuery({
    queryKey: ["/api/tickets/stats"],
    queryFn: async () => {
      const res = await fetch("/api/tickets/stats");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    staleTime: 60_000,
  });
}

export function useCreateTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<Ticket>) => {
      const res = await apiRequest("POST", "/api/tickets", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets/stats"] });
    },
  });
}

export function useUpdateTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Ticket> & { reason?: string } }) => {
      const res = await apiRequest("PATCH", `/api/tickets/${id}`, data);
      return res.json();
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets/stats"] });
    },
  });
}

export function useDeleteTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/tickets/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets/stats"] });
    },
  });
}

export function useAddComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ ticketId, content, isInternal }: { ticketId: number; content: string; isInternal?: boolean }) => {
      const res = await apiRequest("POST", `/api/tickets/${ticketId}/comments`, { content, isInternal });
      return res.json();
    },
    onSuccess: (_, { ticketId }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] }); // To update last interaction sorting if needed
    },
  });
}
