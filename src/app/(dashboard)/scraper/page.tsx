'use client';

import { Header } from '@/components/layout/Header';
import { JobLogViewer } from '@/components/scraper/JobLogViewer';
import { ProcessManager } from '@/components/scraper/ProcessManager';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { formatDateTime } from '@/lib/utils';
import { Activity, CheckCircle, Clock, Loader2, Play, Search, Sparkles, StopCircle, Trash2, XCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface ScrapingJob {
  id: string;
  status: string;
  leadsRequested: number;
  leadsFound: number;
  categories: string[];
  locations: string[];
  country: string;
  scheduledFor: string;
  completedAt: string | null;
  error: string | null;
}

interface CountryOption {
  code: string;
  name: string;
  cities: string[];
}

// Preset options for number of leads
const LEAD_COUNT_OPTIONS = [1, 5, 10, 20, 50];

export default function ScraperPage() {
  const [jobs, setJobs] = useState<ScrapingJob[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [defaultCountry, setDefaultCountry] = useState<string>('ZA');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state - default to 1 lead
  const [leadsRequested, setLeadsRequested] = useState(1);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedCity, setSelectedCity] = useState<string>('all');
  const [selectedCountry, setSelectedCountry] = useState<string>('ZA');
  const [minRating, setMinRating] = useState(4.0);
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null);
  const [stoppingJobId, setStoppingJobId] = useState<string | null>(null);
  const [viewingJobId, setViewingJobId] = useState<string | null>(null);
  const [isDeletingAll, setIsDeletingAll] = useState(false);

  // Track if we had running jobs recently (to continue polling after completion)
  const [hadRunningJobsRecently, setHadRunningJobsRecently] = useState(false);
  const recentlyCompletedTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetchJobs();
  }, []);
  
  // Auto-refresh jobs list when there are running/scheduled jobs
  // Continues polling for 10 seconds after jobs complete to catch final status
  useEffect(() => {
    const hasRunningJobs = jobs.some(job => job.status === 'RUNNING');
    const hasScheduledJobs = jobs.some(job => job.status === 'SCHEDULED');
    
    // If we have running jobs, mark that we had them recently
    if (hasRunningJobs) {
      setHadRunningJobsRecently(true);
      // Clear any existing timeout
      if (recentlyCompletedTimeoutRef.current) {
        clearTimeout(recentlyCompletedTimeoutRef.current);
        recentlyCompletedTimeoutRef.current = null;
      }
    } else if (hadRunningJobsRecently) {
      // Jobs just finished - continue polling for 10 more seconds
      recentlyCompletedTimeoutRef.current = setTimeout(() => {
        setHadRunningJobsRecently(false);
      }, 10000);
    }
    
    // Determine if we should poll
    const shouldPoll = hasRunningJobs || hasScheduledJobs || hadRunningJobsRecently;
    if (!shouldPoll) return;
    
    // Use faster polling when jobs are actively running, slower otherwise
    const pollInterval = hasRunningJobs ? 3000 : 5000;
    const interval = setInterval(fetchJobs, pollInterval);
    return () => clearInterval(interval);
  }, [jobs, hadRunningJobsRecently]);
  
  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (recentlyCompletedTimeoutRef.current) {
        clearTimeout(recentlyCompletedTimeoutRef.current);
      }
    };
  }, []);

  const fetchJobs = async () => {
    try {
      const response = await fetch('/api/scraper');
      const data = await response.json();
      setJobs(data.jobs || []);
      setCategories(data.availableCategories || []);
      setCities(data.availableCities || []);
      setCountries(data.availableCountries || []);
      if (data.defaultCountry) {
        setDefaultCountry(data.defaultCountry);
        // Set selected country to default on first load
        if (!selectedCountry || selectedCountry === 'ZA') {
          setSelectedCountry(data.defaultCountry);
        }
      }
    } catch (error) {
      console.error('Error fetching jobs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartScraping = async () => {
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/scraper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadsRequested,
          categories: selectedCategory === 'all' ? [] : [selectedCategory],
          locations: selectedCity === 'all' ? [] : [selectedCity],
          country: selectedCountry,
          minRating,
          runImmediately: true,
        }),
      });

      if (!response.ok) throw new Error('Failed to start scraping');

      await fetchJobs();
    } catch (error) {
      console.error('Error starting scraping:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStopJob = async (jobId: string) => {
    if (!confirm('Are you sure you want to stop this scraping job?')) return;
    
    setStoppingJobId(jobId);
    try {
      const response = await fetch(`/api/scraper/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      });

      if (!response.ok) throw new Error('Failed to stop job');

      // Refresh immediately
      await fetchJobs();
      
      // Refresh again after a short delay to catch any async status updates
      setTimeout(() => fetchJobs(), 1000);
      setTimeout(() => fetchJobs(), 3000);
    } catch (error) {
      console.error('Error stopping job:', error);
    } finally {
      setStoppingJobId(null);
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    if (!confirm('Are you sure you want to delete this job? This cannot be undone.')) return;
    
    setDeletingJobId(jobId);
    try {
      const response = await fetch(`/api/scraper/${jobId}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete job');

      await fetchJobs();
    } catch (error) {
      console.error('Error deleting job:', error);
    } finally {
      setDeletingJobId(null);
    }
  };

  const handleDeleteAllJobs = async () => {
    const nonRunningJobs = jobs.filter(job => job.status !== 'RUNNING');
    if (nonRunningJobs.length === 0) {
      alert('No jobs to delete (running jobs cannot be deleted)');
      return;
    }
    
    if (!confirm(`Are you sure you want to delete ${nonRunningJobs.length} job(s)? This cannot be undone.`)) return;
    
    setIsDeletingAll(true);
    try {
      // Delete all non-running jobs in parallel
      const deletePromises = nonRunningJobs.map(job => 
        fetch(`/api/scraper/${job.id}`, { method: 'DELETE' })
      );
      
      await Promise.all(deletePromises);
      await fetchJobs();
    } catch (error) {
      console.error('Error deleting jobs:', error);
    } finally {
      setIsDeletingAll(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'RUNNING':
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      case 'FAILED':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">Completed</Badge>;
      case 'RUNNING':
        return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">Running</Badge>;
      case 'FAILED':
        return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">Failed</Badge>;
      case 'SCHEDULED':
        return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">Scheduled</Badge>;
      case 'CANCELLED':
        return <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400">Cancelled</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Lead Scraper"
        description="Find new businesses to contact using AI-powered search"
      />

      <div className="flex-1 p-6 overflow-y-auto space-y-6">
        {/* New Scraping Job */}
        <Card>
          <CardHeader>
            <CardTitle>Find New Leads</CardTitle>
            <CardDescription>
              Configure and start a new lead scraping job. The AI will search
              Google Maps for businesses that match your criteria.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Enrichment info banner */}
            <div className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Sparkles className="h-5 w-5 text-purple-500 mt-0.5" />
                <div>
                  <h4 className="font-medium text-sm">Multi-Source Enrichment</h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    Each lead is enriched from Google Maps, Google Search, website crawling, and Facebook 
                    to gather all available contact info, social profiles, and business details.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="space-y-2">
                <Label>Number of Leads</Label>
                <Select 
                  value={leadsRequested.toString()} 
                  onValueChange={(v) => setLeadsRequested(parseInt(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEAD_COUNT_OPTIONS.map((count) => (
                      <SelectItem key={count} value={count.toString()}>
                        {count} {count === 1 ? 'lead' : 'leads'}
                        {count === 1 && ' (recommended)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {leadsRequested === 1 
                    ? 'Full enrichment for one business' 
                    : `Enrich ${leadsRequested} businesses sequentially`}
                </p>
              </div>

              <div className="space-y-2">
                <Label>Country</Label>
                <Select 
                  value={selectedCountry} 
                  onValueChange={(value) => {
                    setSelectedCountry(value);
                    // Reset city selection when country changes
                    setSelectedCity('all');
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {countries.map((country) => (
                      <SelectItem key={country.code} value={country.code}>
                        {country.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Restricts search to this country
                </p>
              </div>

              <div className="space-y-2">
                <Label>Industry Category</Label>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>City/Location</Label>
                <Select value={selectedCity} onValueChange={setSelectedCity}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Cities</SelectItem>
                    {/* Show cities for selected country */}
                    {(countries.find(c => c.code === selectedCountry)?.cities || cities).map((city) => (
                      <SelectItem key={city} value={city}>
                        {city}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Min Google Rating</Label>
                <div className="flex items-center gap-4">
                  <Slider
                    value={[minRating]}
                    onValueChange={(v) => setMinRating(v[0])}
                    min={3}
                    max={5}
                    step={0.5}
                    className="flex-1"
                  />
                  <span className="w-12 text-center font-medium">
                    {minRating}+
                  </span>
                </div>
              </div>
            </div>

            <Button
              onClick={handleStartScraping}
              disabled={isSubmitting}
              className="w-full md:w-auto"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Start Scraping
            </Button>
          </CardContent>
        </Card>

        {/* Recent Jobs */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle>Recent Jobs</CardTitle>
              <CardDescription>
                View the status and results of your scraping jobs
              </CardDescription>
            </div>
            {jobs.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDeleteAllJobs}
                disabled={isDeletingAll || jobs.every(job => job.status === 'RUNNING')}
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                {isDeletingAll ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-2" />
                )}
                Delete All
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : jobs.length > 0 ? (
              <div className="space-y-4">
                {jobs.map((job) => (
                  <div
                    key={job.id}
                    className={`flex items-center justify-between p-4 border rounded-lg transition-colors ${
                      job.status === 'RUNNING' 
                        ? 'cursor-pointer hover:bg-blue-500/5 hover:border-blue-500/30 border-blue-500/20' 
                        : ''
                    }`}
                    onClick={() => {
                      if (job.status === 'RUNNING') {
                        setViewingJobId(job.id);
                      }
                    }}
                  >
                    <div className="flex items-center gap-4">
                      {getStatusIcon(job.status)}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {job.leadsFound} / {job.leadsRequested} leads
                          </span>
                          {getStatusBadge(job.status)}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {job.categories.length > 0
                            ? job.categories.join(', ')
                            : 'All categories'}{' '}
                          in{' '}
                          {job.locations.length > 0
                            ? job.locations.join(', ')
                            : 'All cities'}
                          {' '}
                          <span className="text-xs px-1.5 py-0.5 bg-muted rounded">
                            {countries.find(c => c.code === job.country)?.name || job.country || 'South Africa'}
                          </span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <div className="text-right text-sm text-muted-foreground mr-2">
                        <p>{formatDateTime(job.scheduledFor)}</p>
                        {job.error && (
                          <p className="text-red-500 text-xs mt-1 max-w-[200px] truncate" title={job.error}>
                            {job.error}
                          </p>
                        )}
                      </div>
                      {/* View Logs button - for running jobs */}
                      {job.status === 'RUNNING' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setViewingJobId(job.id)}
                          className="border-blue-500/50 text-blue-600 hover:bg-blue-500/10 hover:text-blue-700"
                        >
                          <Activity className="h-4 w-4 mr-1" />
                          View Live
                        </Button>
                      )}
                      {/* Stop button - only for running/scheduled jobs */}
                      {(job.status === 'RUNNING' || job.status === 'SCHEDULED') && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleStopJob(job.id)}
                          disabled={stoppingJobId === job.id || deletingJobId === job.id}
                          className="border-orange-500/50 text-orange-600 hover:bg-orange-500/10 hover:text-orange-700"
                        >
                          {stoppingJobId === job.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <StopCircle className="h-4 w-4 mr-1" />
                              Stop
                            </>
                          )}
                        </Button>
                      )}
                      {/* Delete button - available for all jobs */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteJob(job.id)}
                        disabled={deletingJobId === job.id || stoppingJobId === job.id}
                        className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      >
                        {deletingJobId === job.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No scraping jobs yet. Start one above!</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Process Manager */}
        <ProcessManager hasActiveJob={jobs.some(job => job.status === 'RUNNING')} />
      </div>

      {/* Job Log Viewer Modal */}
      {viewingJobId && (
        <JobLogViewer
          jobId={viewingJobId}
          isOpen={!!viewingJobId}
          onClose={() => setViewingJobId(null)}
        />
      )}
    </div>
  );
}
