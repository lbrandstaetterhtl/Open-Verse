import { useEffect, useRef } from "react";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

export function useWebSocket() {
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const { user, logoutMutation } = useAuth();
  const { toast } = useToast();

  const logoutRef = useRef(logoutMutation);
  const toastRef = useRef(toast);

  useEffect(() => {
    logoutRef.current = logoutMutation;
  }, [logoutMutation]);

  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  useEffect(() => {
    if (!user) return;

    const connect = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      if (socketRef.current) {
        socketRef.current.close();
      }

      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        console.log("[WS] Connected");
        reconnectAttemptsRef.current = 0;
        window.dispatchEvent(new CustomEvent("open-verse-ws-status", { detail: "connected" }));
      };

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          switch (message.type) {
            case "new_post":
            case "new_comment":
            case "new_reaction":
              queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
              break;
            case "new_follower":
              queryClient.invalidateQueries({ queryKey: ["/api/followers"] });
              queryClient.invalidateQueries({ queryKey: ["/api/following"] });
              break;
            case "notification":
            case "new_notification":
              queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
              queryClient.invalidateQueries({ queryKey: ["/api/notifications/counts"] });
              break;
            case "banned":
              toastRef.current({
                title: "Account Banned",
                description: message.message,
                variant: "destructive",
              });
              logoutRef.current.mutate();
              break;
          }
        } catch (error) {
          console.error("[WS] Message error:", error);
        }
      };

      socket.onclose = (event) => {
        console.log("[WS] Disconnected", event.code);
        window.dispatchEvent(new CustomEvent("open-verse-ws-status", { detail: "disconnected" }));
        
        // LEAK-002 FIX: Exponential Backoff Reconnection
        if (user && event.code !== 1000) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          reconnectAttemptsRef.current++;
          console.log(`[WS] Reconnecting in ${delay}ms...`);
          reconnectTimeoutRef.current = setTimeout(connect, delay);
        }
      };

      socket.onerror = (error) => {
        console.error("[WS] Error:", error);
      };
    };

    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (socketRef.current) {
        socketRef.current.close(1000); // Normal closure
        socketRef.current = null;
      }
    };
  }, [user]);
}
