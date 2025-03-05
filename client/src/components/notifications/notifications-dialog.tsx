import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Button } from "@/components/ui/button";
import { Bell, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useLocation } from "wouter";

type NotificationWithUser = {
  id: number;
  type: string;
  fromUser: {
    username: string;
  };
  message: string;
  read: boolean;
  createdAt: string;
  postId?: number;
  commentId?: number;
};

export function NotificationsDialog() {
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();

  const { data: notifications, isLoading } = useQuery<NotificationWithUser[]>({
    queryKey: ["/api/notifications"],
    queryFn: async () => {
      const res = await fetch("/api/notifications");
      if (!res.ok) throw new Error("Failed to fetch notifications");
      return res.json();
    },
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: number) => {
      const res = await apiRequest("POST", `/api/notifications/${notificationId}/read`);
      if (!res.ok) throw new Error("Failed to mark as read");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });

  // Calculate unread notifications count
  const unreadCount = notifications?.filter(n => !n.read).length || 0;

  const handleNotificationClick = (notification: NotificationWithUser) => {
    if (notification.postId) {
      setOpen(false);
      if (!notification.read) {
        markAsReadMutation.mutate(notification.id);
      }
      // Navigate to the post
      setLocation(`/post/${notification.postId}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-[10px] font-medium text-white flex items-center justify-center">
              {unreadCount}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Notifications</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : notifications?.length === 0 ? (
          <Alert>
            <AlertDescription>No notifications yet</AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-4 mt-4">
            {notifications?.map((notification) => (
              <div
                key={notification.id}
                className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-accent transition-colors ${
                  !notification.read ? "bg-accent/50" : ""
                }`}
                onClick={() => handleNotificationClick(notification)}
              >
                <UserAvatar user={{ username: notification.fromUser.username }} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-tight">
                    <span className="font-medium">{notification.fromUser.username}</span>{" "}
                    {notification.message}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {format(new Date(notification.createdAt), "PPp")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}