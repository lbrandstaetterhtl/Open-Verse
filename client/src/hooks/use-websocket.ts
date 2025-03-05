import { useEffect, useRef } from 'react';
import { queryClient } from '@/lib/queryClient';
import { useAuth } from './use-auth';
import { useToast } from './use-toast';

export function useWebSocket() {
  const socketRef = useRef<WebSocket | null>(null);
  const { user, logoutMutation } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (!user) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        switch (message.type) {
          case 'new_post':
            queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
            toast({
              title: "New Post",
              description: "Someone just shared a new post!",
            });
            break;
          case 'updated_post':
            queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
            break;
          case 'deleted_post':
            queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
            break;
          case 'new_message':
            queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
            if (message.data?.from !== user.username) {
              toast({
                title: "New Message",
                description: `New message from ${message.data.from}`,
              });
            }
            break;
          case 'new_comment':
            queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
            toast({
              title: "New Comment",
              description: "Someone commented on a post you're following",
            });
            break;
          case 'new_reaction':
            queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
            break;
          case 'new_follower':
            queryClient.invalidateQueries({ queryKey: ["/api/followers"] });
            queryClient.invalidateQueries({ queryKey: ["/api/following"] });
            toast({
              title: "New Follower",
              description: `${message.data.username} started following you!`,
            });
            break;
          case 'new_notification':
            queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
            break;
          case 'banned':
            toast({
              title: "Account Banned",
              description: message.message,
              variant: "destructive",
            });
            logoutMutation.mutate();
            break;
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
      }
    };

    socket.onerror = (error) => {
      console.error('WebSocket error:', error);
      toast({
        title: "Connection Error",
        description: "Failed to connect to real-time updates",
        variant: "destructive",
      });
    };

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [user, logoutMutation, toast, queryClient]);
}