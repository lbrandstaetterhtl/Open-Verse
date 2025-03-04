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
import { Loader2 } from "lucide-react";

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

export default function ChatPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [messageInput, setMessageInput] = useState("");

  const { data: following } = useQuery({
    queryKey: ["/api/following"],
    queryFn: async () => {
      const res = await fetch("/api/following");
      if (!res.ok) throw new Error("Failed to fetch following");
      return res.json();
    },
  });

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
          <h1 className="text-4xl font-bold mb-8">Messages</h1>
          <div className="grid grid-cols-4 gap-6">
            {/* Users List */}
            <Card className="col-span-1">
              <CardHeader>
                <CardTitle>Contacts</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {following?.map((followedUser: any) => (
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
                {!following?.length && (
                  <p className="text-muted-foreground text-center">
                    Follow users to start messaging
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Chat Area */}
            <Card className="col-span-3">
              <CardHeader>
                <CardTitle>
                  {selectedUserId
                    ? following?.find((u: any) => u.id === selectedUserId)?.username
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
                      Send
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
