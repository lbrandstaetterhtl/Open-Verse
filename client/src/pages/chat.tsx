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
import { useState } from "react";
import { Loader2, Info, Menu } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

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
  const [showUserList, setShowUserList] = useState(true); // For mobile toggle

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

  const { data: messages, isLoading: messagesLoading } = useQuery<Message[]>({
    queryKey: ["/api/messages", selectedUserId],
    queryFn: async () => {
      if (!selectedUserId) return [];
      const res = await fetch(`/api/messages/${selectedUserId}`);
      if (!res.ok) throw new Error("Failed to fetch messages");
      return res.json();
    },
    enabled: !!selectedUserId,
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

  return (
    <>
      <Navbar />
      <main className="container mx-auto px-4 pt-24">
        <div className="max-w-4xl mx-auto">
          {/* Mobile Header */}
          <div className="flex items-center justify-between mb-4 lg:mb-8">
            <h1 className="text-2xl lg:text-4xl font-bold">Messages</h1>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setShowUserList(!showUserList)}
            >
              <Menu className="h-5 w-5" />
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 lg:gap-6">
            {/* Users List - Collapsible on mobile */}
            <Card className={`lg:block ${showUserList ? 'block' : 'hidden'}`}>
              <CardHeader>
                <CardTitle className="text-lg">Mutual Followers</CardTitle>
              </CardHeader>
              <CardContent className="p-2">
                {mutualFollowers?.length === 0 && (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription className="text-sm">
                      You can only chat with users who follow you back.
                    </AlertDescription>
                  </Alert>
                )}
                <div className="space-y-1">
                  {mutualFollowers?.map((followedUser) => (
                    <div
                      key={followedUser.id}
                      className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer hover:bg-muted transition-colors ${
                        selectedUserId === followedUser.id ? "bg-muted" : ""
                      }`}
                      onClick={() => {
                        setSelectedUserId(followedUser.id);
                        setShowUserList(false); // Hide user list on mobile after selection
                      }}
                    >
                      <UserAvatar user={followedUser} size="sm" />
                      <span className="text-sm">{followedUser.username}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Chat Area */}
            <Card className={`lg:col-span-3 ${showUserList ? 'hidden' : 'block'} lg:block`}>
              <CardHeader className="border-b">
                <CardTitle className="text-lg">
                  {selectedUserId
                    ? mutualFollowers?.find((u) => u.id === selectedUserId)?.username
                    : "Select a user to start chatting"}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {/* Messages */}
                <div className="h-[calc(100vh-400px)] lg:h-[400px] overflow-y-auto p-4 space-y-4">
                  {messagesLoading ? (
                    <div className="flex justify-center py-4">
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
                          user={
                            message.senderId === user?.id ? message.sender : message.receiver
                          }
                          size="sm"
                        />
                        <div
                          className={`rounded-lg p-3 max-w-[70%] ${
                            message.senderId === user?.id
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted"
                          }`}
                        >
                          <p className="text-sm break-words">{message.content}</p>
                          <p className="text-[10px] mt-1 opacity-70">
                            {format(new Date(message.createdAt), "PPp")}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-center text-sm text-muted-foreground">
                      {selectedUserId
                        ? "No messages yet. Start the conversation!"
                        : "Select a user to view messages"}
                    </p>
                  )}
                </div>

                {/* Message Input */}
                {selectedUserId && (
                  <div className="border-t p-4">
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
                        className="text-sm"
                      />
                      <Button
                        onClick={handleSendMessage}
                        disabled={!messageInput.trim() || sendMessageMutation.isPending}
                        size="sm"
                      >
                        {sendMessageMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Send"
                        )}
                      </Button>
                    </div>
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