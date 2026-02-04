'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import type { AppEvent, EventType } from '@/lib/events';

interface UseRealtimeOptions {
  onEvent?: (event: AppEvent) => void;
  eventTypes?: EventType[];
  enabled?: boolean;
}

interface RealtimeState {
  isConnected: boolean;
  hasRedis: boolean;
  lastEvent: AppEvent | null;
  error: string | null;
}

// Minimum time between reconnection attempts after an error (30 seconds)
const MIN_RECONNECT_DELAY = 30000;
// Maximum time between reconnection attempts (5 minutes)
const MAX_RECONNECT_DELAY = 300000;

export function useRealtime(options: UseRealtimeOptions = {}) {
  const { onEvent, eventTypes, enabled = true } = options;
  const [state, setState] = useState<RealtimeState>({
    isConnected: false,
    hasRedis: false,
    lastEvent: null,
    error: null,
  });
  
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const hadSuccessfulConnection = useRef(false); // Track if we ever connected successfully
  const onEventRef = useRef(onEvent);
  const eventTypesRef = useRef(eventTypes);
  const enabledRef = useRef(enabled);
  const isMountedRef = useRef(true);
  
  // Keep refs updated
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);
  
  useEffect(() => {
    eventTypesRef.current = eventTypes;
  }, [eventTypes]);
  
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const cleanup = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!enabledRef.current || typeof window === 'undefined' || !isMountedRef.current) {
      return;
    }
    
    // Close existing connection
    cleanup();

    try {
      const eventSource = new EventSource('/api/events');
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        if (!isMountedRef.current) {
          eventSource.close();
          return;
        }
        setState((prev) => ({ ...prev, isConnected: true, error: null }));
        reconnectAttempts.current = 0;
        hadSuccessfulConnection.current = true;
      };

      eventSource.onmessage = (event) => {
        if (!isMountedRef.current) return;
        
        try {
          const data = JSON.parse(event.data) as AppEvent | { 
            type: 'connected' | 'heartbeat' | 'redis_connected' | 'redis_unavailable';
            timestamp: number;
          };
          
          // Handle internal messages
          if (data.type === 'connected') {
            setState((prev) => ({ ...prev, isConnected: true }));
            return;
          }
          if (data.type === 'heartbeat') {
            // Heartbeat received - connection is healthy
            return;
          }
          if (data.type === 'redis_connected') {
            setState((prev) => ({ ...prev, hasRedis: true }));
            return;
          }
          if (data.type === 'redis_unavailable') {
            setState((prev) => ({ ...prev, hasRedis: false }));
            return;
          }

          const appEvent = data as AppEvent;
          
          // Filter by event types if specified (use ref to avoid dependency issues)
          const currentEventTypes = eventTypesRef.current;
          if (currentEventTypes && !currentEventTypes.includes(appEvent.type)) {
            return;
          }

          setState((prev) => ({ ...prev, lastEvent: appEvent }));
          
          if (onEventRef.current) {
            onEventRef.current(appEvent);
          }
        } catch (error) {
          console.error('[Realtime] Failed to parse event:', error);
        }
      };

      eventSource.onerror = () => {
        if (!isMountedRef.current) return;
        
        setState((prev) => ({ ...prev, isConnected: false, hasRedis: false }));
        eventSource.close();
        eventSourceRef.current = null;

        reconnectAttempts.current++;

        // After 5 failed attempts, stop trying
        if (reconnectAttempts.current > 5) {
          setState((prev) => ({
            ...prev,
            error: 'Connection lost. Click refresh to reconnect.',
          }));
          return;
        }

        // Only apply delay if we had a successful connection before (actual reconnection)
        // For initial connection failures, retry quickly
        let delay: number;
        if (hadSuccessfulConnection.current) {
          // Exponential backoff for reconnections: 30s, 45s, 67s, 100s, 150s
          delay = Math.min(
            MIN_RECONNECT_DELAY * Math.pow(1.5, reconnectAttempts.current - 1),
            MAX_RECONNECT_DELAY
          );
        } else {
          // Quick retry for initial connection: 1s, 2s, 4s, 8s, 16s
          delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current - 1), 16000);
        }

        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, delay);
      };
    } catch (error) {
      console.error('[Realtime] Failed to create EventSource:', error);
      setState((prev) => ({
        ...prev,
        isConnected: false,
        error: 'Failed to connect',
      }));
    }
  }, [cleanup]);

  const disconnect = useCallback(() => {
    cleanup();
    setState({ isConnected: false, hasRedis: false, lastEvent: null, error: null });
  }, [cleanup]);

  const manualReconnect = useCallback(() => {
    // Reset state for manual reconnect
    reconnectAttempts.current = 0;
    hadSuccessfulConnection.current = false;
    disconnect();
    // Small delay to ensure cleanup is complete
    setTimeout(() => connect(), 100);
  }, [connect, disconnect]);

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    isMountedRef.current = true;
    connect();
    
    return () => {
      isMountedRef.current = false;
      cleanup();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle enabled changes
  useEffect(() => {
    if (!enabled && eventSourceRef.current) {
      disconnect();
    } else if (enabled && !eventSourceRef.current && isMountedRef.current) {
      connect();
    }
  }, [enabled, connect, disconnect]);

  return {
    ...state,
    reconnect: manualReconnect,
    disconnect,
  };
}

// Memoized event type arrays to prevent unnecessary re-renders
const LEAD_EVENT_TYPES: EventType[] = ['lead:created', 'lead:updated', 'lead:deleted', 'lead:status_changed'];
const STATS_EVENT_TYPES: EventType[] = ['stats:updated', 'lead:created', 'lead:deleted', 'lead:status_changed'];
const SCRAPER_EVENT_TYPES: EventType[] = ['scraper:started', 'scraper:progress', 'scraper:completed', 'scraper:error'];

// Hook specifically for leads updates with automatic data refresh
export function useLeadsRealtime(onLeadsChange: () => void) {
  // Use ref to store callback to avoid re-creating handleEvent
  const onLeadsChangeRef = useRef(onLeadsChange);
  useEffect(() => {
    onLeadsChangeRef.current = onLeadsChange;
  }, [onLeadsChange]);

  const handleEvent = useCallback(
    (event: AppEvent) => {
      // Trigger refresh on any lead-related event
      if (
        event.type === 'lead:created' ||
        event.type === 'lead:updated' ||
        event.type === 'lead:deleted' ||
        event.type === 'lead:status_changed'
      ) {
        onLeadsChangeRef.current();
      }
    },
    [] // No dependencies - uses ref
  );

  return useRealtime({
    onEvent: handleEvent,
    eventTypes: LEAD_EVENT_TYPES,
  });
}

// Hook specifically for stats/dashboard updates
export function useStatsRealtime(onStatsChange: () => void) {
  // Use ref to store callback to avoid re-creating handleEvent
  const onStatsChangeRef = useRef(onStatsChange);
  useEffect(() => {
    onStatsChangeRef.current = onStatsChange;
  }, [onStatsChange]);

  const handleEvent = useCallback(
    (event: AppEvent) => {
      // Trigger refresh on stats-related events
      if (
        event.type === 'stats:updated' ||
        event.type === 'lead:created' ||
        event.type === 'lead:deleted' ||
        event.type === 'lead:status_changed'
      ) {
        onStatsChangeRef.current();
      }
    },
    [] // No dependencies - uses ref
  );

  return useRealtime({
    onEvent: handleEvent,
    eventTypes: STATS_EVENT_TYPES,
  });
}

// Hook for scraper progress updates
export function useScraperRealtime(
  onProgress?: (data: { jobId: string; progress?: number; leadsFound?: number; message?: string }) => void,
  onComplete?: (jobId: string) => void,
  onError?: (jobId: string, error: string) => void
) {
  // Use refs to store callbacks to avoid re-creating handleEvent
  const onProgressRef = useRef(onProgress);
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);
  
  useEffect(() => {
    onProgressRef.current = onProgress;
    onCompleteRef.current = onComplete;
    onErrorRef.current = onError;
  }, [onProgress, onComplete, onError]);

  const handleEvent = useCallback(
    (event: AppEvent) => {
      const data = event.data as { jobId: string; progress?: number; leadsFound?: number; message?: string; error?: string };
      
      switch (event.type) {
        case 'scraper:started':
        case 'scraper:progress':
          onProgressRef.current?.(data);
          break;
        case 'scraper:completed':
          onCompleteRef.current?.(data.jobId);
          break;
        case 'scraper:error':
          onErrorRef.current?.(data.jobId, data.error || 'Unknown error');
          break;
      }
    },
    [] // No dependencies - uses refs
  );

  return useRealtime({
    onEvent: handleEvent,
    eventTypes: SCRAPER_EVENT_TYPES,
  });
}
