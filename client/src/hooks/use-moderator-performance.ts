import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export function useModeratorLeaderboard(period: string = '7d', sortBy: string = 'score') {
  return useQuery({
    queryKey: ["/api/admin/performance/leaderboard", period, sortBy],
    queryFn: async () => {
      const res = await fetch(`/api/admin/performance/leaderboard?period=${period}&sortBy=${sortBy}`);
      if (!res.ok) throw new Error("Failed to fetch leaderboard");
      return res.json();
    }
  });
}

export function useTeamOverview() {
  return useQuery({
    queryKey: ["/api/admin/performance/team-overview"],
    queryFn: async () => {
      const res = await fetch("/api/admin/performance/team-overview");
      if (!res.ok) throw new Error("Failed to fetch team overview");
      return res.json();
    }
  });
}

// Logic preserved but export removed for Knip compliance
function useModeratorDetail(moderatorId: number | null, period: string = '30d') {
  return useQuery({
    queryKey: ["/api/admin/performance/moderator", moderatorId, period],
    queryFn: async () => {
      if (!moderatorId) return null;
      const res = await fetch(`/api/admin/performance/moderator/${moderatorId}?period=${period}`);
      if (!res.ok) throw new Error("Failed to fetch moderator detail");
      return res.json();
    },
    enabled: !!moderatorId
  });
}

export function useTriggerSnapshot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (date?: string) => {
      const res = await fetch("/api/admin/performance/snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date })
      });
      if (!res.ok) throw new Error("Failed to trigger snapshot");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/performance"] });
    }
  });
}
