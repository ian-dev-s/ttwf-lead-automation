'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Activity, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Info,
  Loader2,
  ArrowDown,
  Pause,
  Play,
} from 'lucide-react';

interface JobLogEntry {
  timestamp: string;
  level: 'info' | 'success' | 'warning' | 'error' | 'progress';
  message: string;
  details?: Record<string, unknown>;
}

interface JobInfo {
  id: string;
  status: string;
  leadsRequested: number;
  leadsFound: number;
  categories: string[];
  locations: string[];
  startedAt: string | null;
}

interface JobLogViewerProps {
  jobId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function JobLogViewer({ jobId, isOpen, onClose }: JobLogViewerProps) {
  const [logs, setLogs] = useState<JobLogEntry[]>([]);
  const [jobInfo, setJobInfo] = useState<JobInfo | null>(null);
  const [connected, setConnected] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [paused, setPaused] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const pausedLogsRef = useRef<JobLogEntry[]>([]);

  useEffect(() => {
    if (!isOpen || !jobId) return;

    // Reset state
    setLogs([]);
    setJobInfo(null);
    setConnected(false);
    pausedLogsRef.current = [];

    // Connect to SSE endpoint
    const eventSource = new EventSource(`/api/scraper/${jobId}/logs`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setConnected(true);
    };

    eventSource.addEventListener('job', (event) => {
      const data = JSON.parse(event.data);
      setJobInfo(data);
    });

    eventSource.addEventListener('log', (event) => {
      const log = JSON.parse(event.data) as JobLogEntry;
      
      if (paused) {
        pausedLogsRef.current.push(log);
      } else {
        setLogs((prev) => [...prev, log]);
      }
    });

    eventSource.addEventListener('heartbeat', () => {
      // Keep-alive, no action needed
    });

    eventSource.onerror = () => {
      setConnected(false);
    };

    return () => {
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [isOpen, jobId, paused]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [logs, autoScroll]);

  // Handle pause/resume
  const togglePause = () => {
    if (paused) {
      // Resume: add all paused logs
      setLogs((prev) => [...prev, ...pausedLogsRef.current]);
      pausedLogsRef.current = [];
    }
    setPaused(!paused);
  };

  const scrollToBottom = () => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
    setAutoScroll(true);
  };

  const getLogIcon = (level: string) => {
    switch (level) {
      case 'success':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'progress':
        return <Activity className="h-4 w-4 text-blue-500" />;
      default:
        return <Info className="h-4 w-4 text-gray-500" />;
    }
  };

  const getLogClass = (level: string) => {
    switch (level) {
      case 'success':
        return 'bg-green-500/10 border-l-green-500';
      case 'error':
        return 'bg-red-500/10 border-l-red-500';
      case 'warning':
        return 'bg-yellow-500/10 border-l-yellow-500';
      case 'progress':
        return 'bg-blue-500/10 border-l-blue-500';
      default:
        return 'bg-gray-500/5 border-l-gray-500';
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-3">
            <Activity className="h-5 w-5" />
            Live Scraper Activity
            {connected ? (
              <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">
                <span className="relative flex h-2 w-2 mr-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                Live
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-gray-500/10 text-gray-500">
                <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                Connecting...
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Job Info Header */}
        {jobInfo && (
          <div className="flex-shrink-0 bg-muted/50 rounded-lg p-4 mb-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Status:</span>
                <Badge 
                  variant="outline" 
                  className={`ml-2 ${
                    jobInfo.status === 'RUNNING' 
                      ? 'bg-blue-500/10 text-blue-600' 
                      : jobInfo.status === 'COMPLETED'
                      ? 'bg-green-500/10 text-green-600'
                      : 'bg-gray-500/10'
                  }`}
                >
                  {jobInfo.status}
                </Badge>
              </div>
              <div>
                <span className="text-muted-foreground">Progress:</span>
                <span className="ml-2 font-mono font-semibold">
                  {jobInfo.leadsFound} / {jobInfo.leadsRequested}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Categories:</span>
                <span className="ml-2 text-xs">{jobInfo.categories.length > 0 ? jobInfo.categories.slice(0, 2).join(', ') + (jobInfo.categories.length > 2 ? '...' : '') : 'All'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Locations:</span>
                <span className="ml-2 text-xs">{jobInfo.locations.length > 0 ? jobInfo.locations.slice(0, 2).join(', ') + (jobInfo.locations.length > 2 ? '...' : '') : 'All'}</span>
              </div>
            </div>
          </div>
        )}

        {/* Log Controls */}
        <div className="flex-shrink-0 flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={togglePause}
              className="gap-2"
            >
              {paused ? (
                <>
                  <Play className="h-4 w-4" />
                  Resume
                  {pausedLogsRef.current.length > 0 && (
                    <Badge variant="secondary" className="ml-1">
                      +{pausedLogsRef.current.length}
                    </Badge>
                  )}
                </>
              ) : (
                <>
                  <Pause className="h-4 w-4" />
                  Pause
                </>
              )}
            </Button>
            <span className="text-sm text-muted-foreground">
              {logs.length} log entries
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={scrollToBottom}
            className="gap-2"
          >
            <ArrowDown className="h-4 w-4" />
            Scroll to bottom
          </Button>
        </div>

        {/* Log Area */}
        <ScrollArea 
          ref={scrollAreaRef} 
          className="flex-1 border rounded-lg bg-black/5 dark:bg-white/5"
          onScrollCapture={() => {
            // Disable auto-scroll if user scrolls up
            const scrollContainer = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
            if (scrollContainer) {
              const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
              const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
              setAutoScroll(isAtBottom);
            }
          }}
        >
          <div className="p-2 space-y-1 font-mono text-sm">
            {logs.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground">
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Waiting for logs...
              </div>
            ) : (
              logs.map((log, index) => (
                <div
                  key={index}
                  className={`flex items-start gap-3 px-3 py-2 rounded border-l-2 ${getLogClass(log.level)}`}
                >
                  <span className="flex-shrink-0 text-xs text-muted-foreground font-mono">
                    {formatTime(log.timestamp)}
                  </span>
                  <span className="flex-shrink-0 mt-0.5">
                    {getLogIcon(log.level)}
                  </span>
                  <span className="flex-1 break-words whitespace-pre-wrap">
                    {log.message}
                  </span>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
