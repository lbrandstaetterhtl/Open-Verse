import { Navbar } from "@/components/layout/navbar";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useRef } from "react";
import { Loader2, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useLocation } from "wouter";

type Message = {
  id: number;
  content: string;
  senderId: number;
  receiverId: number;
  createdAt: string;
  sender: {
    username: string;
  };
  receiver: {
    username: string;
  };
};

type User = {
  id: number;
  username: string;
};

export default function ChatPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [location] = useLocation();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  // Fetch both followers and following
  const { data: following } = useQuery<User[]>({
    queryKey: ["/api/following"],
    queryFn: async () => {
      const res = await fetch("/api/following");
      if (!res.ok) throw new Error("Failed to fetch following");
      return res.json();
    },
  });

  const { data: followers } = useQuery<User[]>({
    queryKey: ["/api/followers"],
    queryFn: async () => {
      const res = await fetch("/api/followers");
      if (!res.ok) throw new Error("Failed to fetch followers");
      return res.json();
    },
  });

  // Calculate mutual followers (users who follow each other)
  const mutualFollowers = following?.filter(
    (followedUser) => followers?.some((follower) => follower.id === followedUser.id)
  );

  // Messages
  const { data: messages, isLoading: messagesLoading } = useQuery<Message[]>({
    queryKey: ["/api/messages", selectedUserId],
    queryFn: async () => {
      if (!selectedUserId) return [];
      const res = await fetch(`/api/messages/${selectedUserId}`);
      if (!res.ok) throw new Error("Failed to fetch messages");
      return res.json();
    },
    enabled: !!selectedUserId,
    onSuccess: () => {
      // Invalidate notifications when messages are loaded
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/messages/unread/count"] });
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async ({ receiverId, content }: { receiverId: number; content: string }) => {
      const res = await apiRequest("POST", "/api/messages", { receiverId, content });
      if (!res.ok) {
        const error = await res.text();
        throw new Error(error);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages", selectedUserId] });
      setMessageInput("");
      toast({
        title: "Success",
        description: "Message sent successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSendMessage = () => {
    if (!selectedUserId || !messageInput.trim()) return;
    sendMessageMutation.mutate({
      receiverId: selectedUserId,
      content: messageInput.trim(),
    });
  };

  // Setup WebSocket connection
  useEffect(() => {
    const connectWebSocket = () => {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('WebSocket connected');
        };

        ws.onmessage = (event) => {
          const data = JSON.parse(event.data);
          if (data.type === 'new_message') {
            // Invalidate queries to refresh messages
            queryClient.invalidateQueries({ queryKey: ["/api/messages", selectedUserId] });
          }
        };

        ws.onclose = () => {
          console.log('WebSocket disconnected, attempting to reconnect...');
          wsRef.current = null;

          // Clear any existing reconnection timeout
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
          }

          // Attempt to reconnect after a delay
          reconnectTimeoutRef.current = setTimeout(() => {
            if (!wsRef.current) {
              connectWebSocket();
            }
          }, 3000);
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
        };
      } catch (error) {
        console.error('Error creating WebSocket connection:', error);
      }
    };

    connectWebSocket();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  // Clear message notifications when entering chat page
  useEffect(() => {
    if (location === '/chat') {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    }
  }, [location]);

  return (
    <>
      <Navbar />
      <main className="container mx-auto px-4 pt-24">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold mb-8">Messages</h1>
          <div className="grid grid-cols-4 gap-6">
            {/* Users List */}
            <Card className="col-span-1">
              <CardHeader>
                <CardTitle>Mutual Followers</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {mutualFollowers?.length === 0 && (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      You can only chat with users who follow you back.
                    </AlertDescription>
                  </Alert>
                )}
                {mutualFollowers?.map((followedUser) => (
                  <div
                    key={followedUser.id}
                    className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer hover:bg-muted ${
                      selectedUserId === followedUser.id ? "bg-muted" : ""
                    }`}
                    onClick={() => setSelectedUserId(followedUser.id)}
                  >
                    <UserAvatar user={followedUser} size="sm" />
                    <span>{followedUser.username}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Chat Area */}
            <Card className="col-span-3">
              <CardHeader>
                <CardTitle>
                  {selectedUserId
                    ? mutualFollowers?.find((u) => u.id === selectedUserId)?.username
                    : "Select a user to start chatting"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Messages */}
                <div className="h-[400px] overflow-y-auto space-y-4 mb-4">
                  {messagesLoading ? (
                    <div className="flex justify-center">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : messages?.length ? (
                    messages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex items-start gap-2 ${
                          message.senderId === user?.id ? "flex-row-reverse" : ""
                        }`}
                      >
                        <UserAvatar
                          user={message.senderId === user?.id ? message.sender : message.receiver}
                          size="sm"
                        />
                        <div
                          className={`rounded-lg p-3 max-w-[70%] ${
                            message.senderId === user?.id
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted"
                          }`}
                        >
                          <p>{message.content}</p>
                          <p className="text-xs mt-1 opacity-70">
                            {format(new Date(message.createdAt), "PPp")}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-center text-muted-foreground">
                      {selectedUserId
                        ? "No messages yet. Start the conversation!"
                        : "Select a user to view messages"}
                    </p>
                  )}
                </div>

                {/* Message Input */}
                {selectedUserId && (
                  <div className="flex gap-2">
                    <Input
                      placeholder="Type a message..."
                      value={messageInput}
                      onChange={(e) => setMessageInput(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === "Enter" && messageInput.trim()) {
                          handleSendMessage();
                        }
                      }}
                    />
                    <Button
                      onClick={handleSendMessage}
                      disabled={!messageInput.trim() || sendMessageMutation.isPending}
                    >
                      {sendMessageMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Send"
                      )}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </>
  );
}