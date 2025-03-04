import { useEffect, useRef } from 'react';
import { queryClient } from '@/lib/queryClient';

export function useWebSocket() {
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
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
            break;
          case 'new_comment':
            queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
            break;
          case 'new_reaction':
            queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
            break;
          case 'new_follower':
            queryClient.invalidateQueries({ queryKey: ["/api/followers"] });
            queryClient.invalidateQueries({ queryKey: ["/api/following"] });
            break;
          case 'new_notification':
            queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
            break;
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
      }
    };

    socket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, []);
}
