'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useState, useEffect, useCallback, useRef } from 'react';

interface ProcessInfo {
  pid: number;
  name: string;
  commandLine?: string;
  isOurProcess: boolean;
}

interface ProcessStatus {
  osType: string;
  registeredPids: number[];
  runningProcesses: ProcessInfo[];
  summary: string;
}

interface ProcessManagerProps {
  /** Whether there's an active scraping job running */
  hasActiveJob?: boolean;
}

export function ProcessManager({ hasActiveJob = false }: ProcessManagerProps) {
  const [status, setStatus] = useState<ProcessStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [killing, setKilling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const lastFetchRef = useRef<number>(0);

  const fetchStatus = useCallback(async (force: boolean = false) => {
    // Throttle requests - don't fetch more than once every 5 seconds unless forced
    const now = Date.now();
    if (!force && now - lastFetchRef.current < 5000) {
      return;
    }
    
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/scraper/processes');
      if (!res.ok) throw new Error('Failed to fetch status');
      const data = await res.json();
      setStatus(data);
      lastFetchRef.current = now;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch process status');
    } finally {
      setLoading(false);
    }
  }, []);

  const killAllProcesses = async (killAll: boolean = false) => {
    setKilling(true);
    setError(null);
    try {
      const res = await fetch(`/api/scraper/processes${killAll ? '?all=true' : ''}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to kill processes');
      const data = await res.json();
      alert(data.message);
      await fetchStatus(true); // Force refresh after killing
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to kill processes');
    } finally {
      setKilling(false);
    }
  };

  const killProcess = async (pid: number) => {
    try {
      const res = await fetch('/api/scraper/processes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pid }),
      });
      if (!res.ok) throw new Error('Failed to kill process');
      await fetchStatus(true); // Force refresh after killing
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to kill process');
    }
  };

  useEffect(() => {
    // Only fetch on mount if expanded
    if (isExpanded) {
      fetchStatus(true);
    }
  }, [isExpanded, fetchStatus]);

  useEffect(() => {
    // Only auto-refresh if expanded AND there's an active job
    // Use a longer interval (30 seconds) to reduce API calls
    if (!isExpanded || !hasActiveJob) return;
    
    const interval = setInterval(() => fetchStatus(), 30000);
    return () => clearInterval(interval);
  }, [isExpanded, hasActiveJob, fetchStatus]);

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <button 
          className="flex items-center gap-2 text-lg font-semibold hover:text-primary transition-colors"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <span className={`transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
          Scraper Process Manager
          {status && status.registeredPids.length > 0 && (
            <span className="ml-2 px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded-full">
              {status.registeredPids.length} active
            </span>
          )}
        </button>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => fetchStatus(true)}
            disabled={loading}
          >
            {loading ? '...' : 'Refresh'}
          </Button>
          <Button 
            variant="destructive" 
            size="sm" 
            onClick={() => killAllProcesses(false)}
            disabled={killing || !status?.runningProcesses.length}
          >
            {killing ? '...' : 'Kill Scrapers'}
          </Button>
          <Button 
            variant="destructive" 
            size="sm" 
            onClick={() => killAllProcesses(true)}
            disabled={killing}
            title="Kill ALL headless Chrome processes (use with caution)"
          >
            Kill All Headless
          </Button>
        </div>
      </div>

      {isExpanded && (
        <div className="mt-4">
          {error && (
            <div className="p-2 mb-4 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded text-sm">
              {error}
            </div>
          )}

          {status && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div className="p-3 bg-muted rounded">
                  <div className="text-muted-foreground">OS Type</div>
                  <div className="font-mono font-semibold">{status.osType}</div>
                </div>
                <div className="p-3 bg-muted rounded">
                  <div className="text-muted-foreground">Registered PIDs</div>
                  <div className="font-mono font-semibold">{status.registeredPids.length}</div>
                </div>
                <div className="p-3 bg-muted rounded">
                  <div className="text-muted-foreground">Running Processes</div>
                  <div className="font-mono font-semibold">{status.runningProcesses.length}</div>
                </div>
              </div>

              {status.runningProcesses.length > 0 && (
                <div className="border rounded">
                  <div className="p-2 bg-muted text-sm font-semibold">
                    Running Scraper Processes
                  </div>
                  <div className="divide-y">
                    {status.runningProcesses.map((proc) => (
                      <div key={proc.pid} className="p-2 flex items-center justify-between text-sm">
                        <div>
                          <span className="font-mono">{proc.pid}</span>
                          <span className="text-muted-foreground ml-2">{proc.name}</span>
                          {proc.isOurProcess && (
                            <span className="ml-2 px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs rounded">
                              Our Process
                            </span>
                          )}
                        </div>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-red-500 hover:text-red-700"
                          onClick={() => killProcess(proc.pid)}
                        >
                          Kill
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {status.registeredPids.length > 0 && (
                <div className="text-xs text-muted-foreground font-mono">
                  Registered PIDs: {status.registeredPids.join(', ')}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
