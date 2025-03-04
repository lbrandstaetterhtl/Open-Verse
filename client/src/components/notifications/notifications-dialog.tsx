import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useState } from "react";
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
import { Bell, MessageCircle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Notification, Message } from "@shared/schema";
import { useLocation, Link } from "wouter";

type NotificationWithUser = Notification & {
  fromUser: {
    username: string;
  };
};

// Update the MessageWithUser type
type MessageWithUser = {
  id: number;
  content: string;
  senderId: number;
  receiverId: number;
  createdAt: string;
  read: boolean;
  sender: {
    username: string;
  };
  receiver: {
    username: string;
  };
};

export function NotificationsDialog() {
  const [open, setOpen] = useState(false);
  const [location] = useLocation();
  const isOnChatPage = location === '/chat';

  const { data: notifications } = useQuery<NotificationWithUser[]>({
    queryKey: ["/api/notifications"],
    queryFn: async () => {
      const res = await fetch("/api/notifications");
      if (!res.ok) throw new Error("Failed to fetch notifications");
      return res.json();
    },
  });

  const { data: unreadCount } = useQuery<{ count: number }>({
    queryKey: ["/api/messages/unread/count"],
    queryFn: async () => {
      const res = await fetch("/api/messages/unread/count");
      if (!res.ok) throw new Error("Failed to fetch unread count");
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

  // Filter out message notifications if on chat page and only show unread ones
  const filteredNotifications = notifications?.filter(notification => {
    if (isOnChatPage && notification.type === 'new_message') return false;
    return !notification.read;
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {(filteredNotifications?.length || (!isOnChatPage && unreadCount?.count)) && (
            <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-[10px] font-medium text-white flex items-center justify-center">
              {(filteredNotifications?.length || 0) + (!isOnChatPage ? (unreadCount?.count || 0) : 0)}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Notifications</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="notifications" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="messages">Messages</TabsTrigger>
          </TabsList>
          <TabsContent value="notifications" className="mt-4 space-y-4">
            {filteredNotifications?.length === 0 && (
              <p className="text-center text-muted-foreground">No new notifications</p>
            )}
            {filteredNotifications?.map((notification) => (
              <div
                key={notification.id}
                className={`flex items-start gap-3 p-3 rounded-lg ${
                  notification.read ? "bg-muted/50" : "bg-muted"
                }`}
                onClick={() => {
                  if (!notification.read) {
                    markAsReadMutation.mutate(notification.id);
                  }
                }}
              >
                <UserAvatar user={{ username: notification.fromUser.username }} size="sm" />
                <div className="flex-1">
                  <p className="text-sm">
                    <span className="font-medium">{notification.fromUser.username}</span>{" "}
                    {notification.type === "new_follower"
                      ? "started following you"
                      : "sent you a message"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(notification.createdAt), "PPp")}
                  </p>
                </div>
              </div>
            ))}
          </TabsContent>
          <TabsContent value="messages" className="mt-4">
            <Link href="/chat" className="block w-full">
              <Button variant="outline" className="w-full">
                <MessageCircle className="mr-2 h-4 w-4" />
                Open Chat
              </Button>
            </Link>
            {unreadCount?.count ? (
              <p className="text-sm text-center mt-2 text-muted-foreground">
                You have {unreadCount.count} unread message{unreadCount.count !== 1 ? 's' : ''}
              </p>
            ) : (
              <p className="text-sm text-center mt-2 text-muted-foreground">
                No unread messages
              </p>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}