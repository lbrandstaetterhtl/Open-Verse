import { useEffect } from "react";
import { useAuth } from "./use-auth";
import { useToast } from "./use-toast";

export function useWebSocket() {
  const { user, logoutMutation } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (!user) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const socket = new WebSocket(wsUrl);

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'banned') {
        // Show ban notification
        toast({
          title: "Account Banned",
          description: data.message,
          variant: "destructive",
        });
        
        // Force logout
        logoutMutation.mutate();
      }
      // Handle other message types...
    };

    socket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    return () => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
    };
  }, [user, logoutMutation, toast]);
}
