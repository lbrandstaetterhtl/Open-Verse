import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useRef, useEffect } from "react";
import { Loader2, Info, Menu, MessageSquare } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { BackButton } from "@/components/ui/back-button";
import { cn } from "@/lib/utils";

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
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch both followers and following
  const { data: following } = useQuery<User[]>({
    queryKey: ["/api/following"],
    queryFn: async () => {
      const res = await fetch("/api/following");
      if (!res.ok) throw new Error("Failed to fetch following");
      return res.json();
    },
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });

  const { data: followers } = useQuery<User[]>({
    queryKey: ["/api/followers"],
    queryFn: async () => {
      const res = await fetch("/api/followers");
      if (!res.ok) throw new Error("Failed to fetch followers");
      return res.json();
    },
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });

  // Calculate mutual followers (users who follow each other)
  const mutualFollowers = following?.filter((followedUser) =>
    followers?.some((follower) => follower.id === followedUser.id),
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
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

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
  return (
    <div className="w-full flex flex-col h-[calc(100vh-theme(spacing.14))] md:h-screen overflow-hidden">
      <main className="flex-1 flex flex-col min-h-0 bg-background">
        <div className="w-full flex items-center justify-between px-4 h-16 border-b bg-background/80 backdrop-blur-md">
          <div className="flex items-center gap-4">
            <BackButton fallback="/feed" className="h-10 w-10 rounded-full" />
            <h1 className="text-xl md:text-2xl font-black tracking-tight uppercase">Messages</h1>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden h-10 w-10 rounded-full hover:bg-muted"
            onClick={() => setShowUserList(!showUserList)}
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex-1 flex min-h-0">
          {/* Users List Sidebar */}
          <aside className={cn(
            "w-full lg:w-80 flex-shrink-0 border-r bg-card/30 flex flex-col transition-all duration-300",
            !showUserList && "hidden lg:flex"
          )}>
            <div className="p-4 border-b">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Mutual Connections</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {mutualFollowers?.length === 0 && (
                <div className="p-6 text-center">
                  <Info className="h-10 w-10 mx-auto text-muted-foreground/20 mb-3" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Chat is exclusive to mutual followers. Follow more users to start conversations!
                  </p>
                </div>
              )}
              {mutualFollowers?.map((followedUser) => (
                <div
                  key={followedUser.id}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-2xl cursor-pointer transition-all active:scale-95 group",
                    selectedUserId === followedUser.id ? "bg-primary/10 text-primary" : "hover:bg-accent/50"
                  )}
                  onClick={() => {
                    setSelectedUserId(followedUser.id);
                    setShowUserList(false);
                  }}
                >
                  <UserAvatar user={followedUser} size="sm" className="h-10 w-10 border-2 border-transparent group-hover:border-primary/20" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{followedUser.username}</p>
                    <p className="text-[10px] opacity-70 uppercase font-black">Active now</p>
                  </div>
                </div>
              ))}
            </div>
          </aside>

          {/* Chat Content Area */}
          <section className={cn(
            "flex-1 flex flex-col min-h-0 bg-background/50",
            showUserList && "hidden lg:flex"
          )}>
            {selectedUserId ? (
              <>
                {/* Chat Header */}
                <div className="px-6 h-16 border-b flex items-center justify-between bg-background/50 backdrop-blur-sm">
                   <div className="flex items-center gap-3">
                      <UserAvatar 
                        user={mutualFollowers?.find(u => u.id === selectedUserId)!} 
                        size="sm" 
                        className="h-9 w-9"
                      />
                      <span className="font-bold text-sm">
                        {mutualFollowers?.find(u => u.id === selectedUserId)?.username}
                      </span>
                   </div>
                </div>

                {/* Messages Feed */}
                <div 
                  ref={scrollRef}
                  className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth"
                >
                  {messagesLoading ? (
                    <div className="flex justify-center py-20"><Spinner size="lg" /></div>
                  ) : messages?.length ? (
                    messages.map((message) => {
                      const isMe = message.senderId === user?.id;
                      return (
                        <div
                          key={message.id}
                          className={cn(
                            "flex items-end gap-3",
                            isMe ? "flex-row-reverse" : "flex-row"
                          )}
                        >
                          <UserAvatar
                            user={isMe ? message.sender : message.receiver}
                            size="xs"
                            className="h-6 w-6 mb-1 opacity-40"
                          />
                          <div
                            className={cn(
                              "rounded-2xl p-4 max-w-[85%] md:max-w-[70%] shadow-lg transition-all hover:scale-[1.02]",
                              isMe
                                ? "bg-primary text-primary-foreground rounded-br-none shadow-primary/10"
                                : "bg-card border border-border/40 rounded-bl-none shadow-black/5"
                            )}
                          >
                            <p className="text-sm leading-relaxed break-words">{message.content}</p>
                            <p className="text-[9px] mt-2 opacity-50 font-bold uppercase tracking-widest tabular-nums">
                              {format(new Date(message.createdAt), "HH:mm")}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full opacity-30 italic">
                      <p className="text-sm">Start of conversation</p>
                    </div>
                  )}
                </div>

                {/* Input Field */}
                <div className="p-4 md:p-6 bg-background/80 backdrop-blur-xl border-t">
                  <div className="flex gap-3 max-w-4xl mx-auto">
                    <Input
                      placeholder="Share your thoughts..."
                      value={messageInput}
                      onChange={(e) => setMessageInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && messageInput.trim()) handleSendMessage();
                      }}
                      className="h-12 px-6 rounded-2xl bg-muted/30 border-transparent focus:bg-background transition-all shadow-inner"
                    />
                    <Button
                      onClick={handleSendMessage}
                      disabled={!messageInput.trim() || sendMessageMutation.isPending}
                      className="h-12 w-12 md:w-auto md:px-8 rounded-2xl font-black uppercase tracking-widest text-[10px]"
                    >
                      {sendMessageMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send"}
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                 <div className="p-8 rounded-[3rem] bg-muted/20 border-2 border-dashed border-white/10">
                    <MessageSquare className="h-20 w-20 mx-auto text-muted-foreground/10 mb-6" />
                    <h2 className="text-2xl font-black uppercase tracking-tighter mb-2">No Chat Selected</h2>
                    <p className="text-sm text-muted-foreground font-medium max-w-xs">
                      Pick a friend from the list and start vibing.
                    </p>
                    <Button 
                      variant="outline" 
                      className="mt-8 lg:hidden rounded-xl font-bold uppercase text-[10px]"
                      onClick={() => setShowUserList(true)}
                    >
                      View Connections
                    </Button>
                 </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
