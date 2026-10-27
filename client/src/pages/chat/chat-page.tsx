import { useQuery, useMutation } from "@tanstack/react-query";
import { LIMITS } from "@/lib/input-limits";
import { useParams } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useRef, useEffect, useLayoutEffect, useMemo } from "react";
import { Loader2, Info, Menu, Send } from "lucide-react";
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

// Messages per request of GET /api/messages/:userId (server/routes/messages.ts)
const PAGE_SIZE = 100;

export default function ChatPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { userId: urlUserId } = useParams<{ userId?: string }>();
  const [selectedUserId, setSelectedUserId] = useState<number | null>(
    urlUserId ? parseInt(urlUserId) : null
  );
  const [messageInput, setMessageInput] = useState("");
  const [showUserList, setShowUserList] = useState(urlUserId ? false : true); // For mobile toggle
  const scrollRef = useRef<HTMLDivElement>(null);

  // Update selectedUserId when URL parameter changes
  useEffect(() => {
    if (urlUserId) {
      setSelectedUserId(parseInt(urlUserId));
      setShowUserList(false);
    }
  }, [urlUserId]);

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

  // The query holds the newest PAGE_SIZE messages; older pages are loaded on demand (?before=<oldest id>)
  // and kept here, together with the messages shown when they were loaded, so no gap opens when new
  // messages push older ones out of the newest page.
  const [older, setOlder] = useState<Message[]>([]);
  const [olderDone, setOlderDone] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const keepScroll = useRef<{ height: number; top: number } | null>(null);
  const conversationRef = useRef(selectedUserId);
  conversationRef.current = selectedUserId;

  useEffect(() => {
    setOlder([]);
    setOlderDone(false);
  }, [selectedUserId]);

  const allMessages = useMemo(() => {
    const byId = new Map<number, Message>();
    for (const m of older) byId.set(m.id, m);
    for (const m of messages ?? []) byId.set(m.id, m);
    return Array.from(byId.values()).sort((a, b) => a.id - b.id);
  }, [older, messages]);

  const canLoadOlder = !olderDone && (older.length > 0 || (messages?.length ?? 0) >= PAGE_SIZE);

  const loadOlder = async () => {
    const conversation = selectedUserId;
    if (!conversation || !allMessages.length || loadingOlder) return;
    const el = scrollRef.current;
    keepScroll.current = el ? { height: el.scrollHeight, top: el.scrollTop } : null;
    setLoadingOlder(true);
    try {
      const res = await fetch(`/api/messages/${conversation}?before=${allMessages[0].id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const page: Message[] = await res.json();
      if (conversationRef.current !== conversation) return; // another chat was opened meanwhile
      if (page.length < PAGE_SIZE) setOlderDone(true);
      setOlder((prev) => [...page, ...prev, ...(messages ?? [])]);
    } catch {
      keepScroll.current = null;
      toast({ title: t("common.error"), description: t("chat.load_older_failed", "Older messages could not be loaded."), variant: "destructive" });
    } finally {
      setLoadingOlder(false);
    }
  };

  // Keep the messages that were on screen in place when older ones are prepended
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const kept = keepScroll.current;
    if (!el || !kept) return;
    keepScroll.current = null;
    const behavior = el.style.scrollBehavior;
    el.style.scrollBehavior = "auto";
    el.scrollTop = el.scrollHeight - kept.height + kept.top;
    el.style.scrollBehavior = behavior;
  }, [older]);

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
        title: t("common.success", "Success"),
        description: t("chat.message_sent", "Message sent successfully"),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t("common.error"),
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
    <div className="w-full flex flex-col h-[calc(100vh-theme(spacing.14))] md:h-screen overflow-hidden">
      <main className="flex-1 flex flex-col min-h-0 bg-background">
        <div className="w-full flex items-center justify-between px-4 h-16 border-b bg-background">
          <div className="flex items-center gap-4">
            <BackButton fallback="/feed" className="h-10 px-3" />
            <h1 className="font-display text-xl md:text-2xl font-semibold">{t("navbar.messages")}</h1>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden hover:bg-muted"
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
              <h3 className="ov-label">{t("chat.mutual_connections", "Mutual Connections")}</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {mutualFollowers?.length === 0 && (
                <div className="p-6 text-center">
                  <Info className="h-10 w-10 mx-auto text-muted-foreground/20 mb-3" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {t("chat.mutual_only", "Chat is exclusive to mutual followers. Follow more users to start conversations!")}
                  </p>
                </div>
              )}
              {mutualFollowers?.map((followedUser) => (
                <div
                  key={followedUser.id}
                  className={cn(
                    "ov-cut flex items-center gap-3 p-3 rounded-sm cursor-pointer transition-colors group",
                    selectedUserId === followedUser.id ? "ov-nav-active" : "hover:bg-accent/50"
                  )}
                  onClick={() => {
                    setSelectedUserId(followedUser.id);
                    setShowUserList(false);
                  }}
                >
                  <UserAvatar user={followedUser} size="sm" className="h-10 w-10" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{followedUser.username}</p>
                    <p className="ov-label">{t("chat.active_now", "Active now")}</p>
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
                <div className="px-6 h-16 border-b flex items-center justify-between bg-background/50">
                   <div className="flex items-center gap-3">
                      <UserAvatar 
                        user={mutualFollowers?.find(u => u.id === selectedUserId)!} 
                        size="sm" 
                        className="h-9 w-9"
                      />
                      <span className="font-semibold text-sm">
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
                  ) : allMessages.length ? (
                    <>
                    {canLoadOlder && (
                      <div className="flex justify-center">
                        <Button variant="outline" size="sm" onClick={loadOlder} disabled={loadingOlder}>
                          {loadingOlder && <Loader2 className="h-4 w-4 animate-spin" />}
                          {t("chat.load_older", "Load older messages")}
                        </Button>
                      </div>
                    )}
                    {allMessages.map((message) => {
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
                              "rounded-sm px-4 py-3 max-w-[85%] md:max-w-[70%]",
                              isMe
                                ? "ov-cut bg-primary text-primary-foreground"
                                : "bg-secondary text-secondary-foreground"
                            )}
                          >
                            <p className="text-sm leading-relaxed break-words">{message.content}</p>
                            <p className="ov-data text-[11px] mt-1.5 opacity-60">
                              {format(new Date(message.createdAt), "HH:mm")}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                      <p className="text-sm">{t("chat.conversation_start", "Start of conversation")}</p>
                    </div>
                  )}
                </div>

                {/* Input Field */}
                <div className="p-4 md:p-6 bg-background border-t">
                  <div className="flex gap-3 max-w-4xl mx-auto">
                    <Input
                      placeholder={t("chat.input_placeholder", "Share your thoughts...")}
                      value={messageInput}
                      maxLength={LIMITS.chatMessage}
                      onChange={(e) => setMessageInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && messageInput.trim()) handleSendMessage();
                      }}
                      className="h-12 px-4 bg-muted/30 focus:bg-background transition-colors"
                    />
                    <Button
                      onClick={handleSendMessage}
                      disabled={!messageInput.trim() || sendMessageMutation.isPending}
                      className="h-12 w-12 px-0 md:w-auto md:px-6"
                    >
                      {sendMessageMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("chat.send", "Send")}
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-12 text-center">
                 <div className="ov-panel p-8">
                    <Send className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
                    <h2 className="font-display text-xl font-semibold mb-2">{t("chat.none_selected", "No Chat Selected")}</h2>
                    <p className="text-sm text-muted-foreground max-w-xs">
                      {t("chat.none_selected_desc", "Pick a friend from the list and start vibing.")}
                    </p>
                    <Button 
                      variant="outline" 
                      className="mt-6 lg:hidden"
                      onClick={() => setShowUserList(true)}
                    >
                      {t("chat.view_connections", "View Connections")}
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
