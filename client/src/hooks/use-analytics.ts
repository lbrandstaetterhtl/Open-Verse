import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { type AnalyticsSnapshot } from "@shared/schema";

export type AnalyticsOverview = {
    latest: AnalyticsSnapshot | null;
    history: AnalyticsSnapshot[];
};

export type LeaderboardCommunity = {
    id: number;
    name: string;
    slug: string;
    imageUrl: string | null;
    newPosts: number;
    activeMembers: number;
    engagementScore: number;
};

export type LeaderboardCreator = {
    id: number;
    username: string;
    profilePictureUrl: string | null;
    newPosts: number;
    newFollowers: number;
    engagementScore: number;
};

export function useAnalyticsOverview(days = 30) {
    return useQuery<AnalyticsOverview>({
        queryKey: ["/api/admin/analytics/overview", { days }],
        queryFn: async () => {
            const res = await fetch(`/api/admin/analytics/overview?days=${days}`);
            if (!res.ok) throw new Error("Failed to fetch analytics");
            return res.json();
        }
    });
}

export function useHotCommunities() {
    return useQuery<LeaderboardCommunity[]>({
        queryKey: ["/api/admin/analytics/hot-communities"],
        queryFn: async () => {
            const res = await fetch("/api/admin/analytics/hot-communities");
            if (!res.ok) throw new Error("Failed to fetch hot communities");
            return res.json();
        }
    });
}

export function useTopCreators() {
    return useQuery<LeaderboardCreator[]>({
        queryKey: ["/api/admin/analytics/top-creators"],
        queryFn: async () => {
            const res = await fetch("/api/admin/analytics/top-creators");
            if (!res.ok) throw new Error("Failed to fetch top creators");
            return res.json();
        }
    });
}

export function useComputeAnalytics() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (date?: string) => {
            const res = await apiRequest("POST", "/api/admin/analytics/compute", { date });
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/admin/analytics"] });
        }
    });
}
