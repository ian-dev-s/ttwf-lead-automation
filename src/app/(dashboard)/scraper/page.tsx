'use client';

import { Header } from '@/components/layout/Header';
import { JobLogViewer } from '@/components/scraper/JobLogViewer';
import { ProcessManager } from '@/components/scraper/ProcessManager';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { formatDateTime } from '@/lib/utils';
import { Activity, AlertTriangle, CheckCircle, Clock, Loader2, Play, Plus, Save, Search, Settings, Sparkles, StopCircle, Trash2, X, XCircle } from 'lucide-react';
import Link from 'next/link';
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

export default function ScraperPage() {
  const [jobs, setJobs] = useState<ScrapingJob[]>([]);
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [, setDefaultCountry] = useState<string>('ZA');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state - default to 1 lead
  const [selectedCountry, setSelectedCountry] = useState<string>('ZA');
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null);
  const [stoppingJobId, setStoppingJobId] = useState<string | null>(null);
  const [viewingJobId, setViewingJobId] = useState<string | null>(null);
  const [isDeletingAll, setIsDeletingAll] = useState(false);

  // AI readiness state
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [hasActiveConfig, setHasActiveConfig] = useState<boolean | null>(null);

  // Scraping configuration state (moved from Settings)
  const [scrapingSettings, setScrapingSettings] = useState({
    dailyLeadTarget: 10,
    leadGenerationEnabled: true,
    scrapeDelayMs: 2000,
    maxLeadsPerRun: 20,
    minEmailLeadsPerRun: 5,
    searchRadiusKm: 50,
    minGoogleRating: 4.0,
    targetIndustries: [] as string[],
    targetCities: [] as string[],
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [newIndustry, setNewIndustry] = useState('');
  const [newCity, setNewCity] = useState('');

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
      const [scraperRes, aiRes, settingsRes] = await Promise.all([
        fetch('/api/scraper'),
        fetch('/api/ai/config'),
        fetch('/api/settings'),
      ]);

      const data = await scraperRes.json();
      setJobs(data.jobs || []);
      setCountries(data.availableCountries || []);
      if (data.defaultCountry) {
        setDefaultCountry(data.defaultCountry);
        if (!selectedCountry || selectedCountry === 'ZA') {
          setSelectedCountry(data.defaultCountry);
        }
      }

      // Check AI readiness
      if (aiRes.ok) {
        const aiData = await aiRes.json();
        const configs = aiData.configs || [];
        const statuses = aiData.providerStatuses || [];
        setHasApiKey(statuses.some((s: { isAvailable: boolean }) => s.isAvailable));
        setHasActiveConfig(configs.some((c: { isActive: boolean }) => c.isActive));
      }

      // Load scraping settings
      if (settingsRes.ok) {
        const settingsData = await settingsRes.json();
        setScrapingSettings({
          dailyLeadTarget: settingsData.dailyLeadTarget ?? 10,
          leadGenerationEnabled: settingsData.leadGenerationEnabled ?? true,
          scrapeDelayMs: settingsData.scrapeDelayMs ?? 2000,
          maxLeadsPerRun: settingsData.maxLeadsPerRun ?? 20,
          minEmailLeadsPerRun: settingsData.minEmailLeadsPerRun ?? 5,
          searchRadiusKm: settingsData.searchRadiusKm ?? 50,
          minGoogleRating: settingsData.minGoogleRating ?? 4.0,
          targetIndustries: settingsData.targetIndustries ?? [],
          targetCities: settingsData.targetCities ?? [],
        });
      }
    } catch (error) {
      console.error('Error fetching jobs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const aiReady = hasApiKey === true && hasActiveConfig === true;

  const handleSaveScrapingSettings = async () => {
    setIsSavingSettings(true);
    try {
      const response = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scrapingSettings),
      });
      if (!response.ok) throw new Error('Failed to save scraping settings');
      setSettingsDialogOpen(false);
    } catch (error) {
      console.error('Error saving scraping settings:', error);
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleAddIndustry = () => {
    const trimmed = newIndustry.trim();
    if (trimmed && !scrapingSettings.targetIndustries.includes(trimmed)) {
      setScrapingSettings((prev) => ({
        ...prev,
        targetIndustries: [...prev.targetIndustries, trimmed],
      }));
    }
    setNewIndustry('');
  };

  const handleRemoveIndustry = (industry: string) => {
    setScrapingSettings((prev) => ({
      ...prev,
      targetIndustries: prev.targetIndustries.filter((i) => i !== industry),
    }));
  };

  const handleAddCity = () => {
    const trimmed = newCity.trim();
    if (trimmed && !scrapingSettings.targetCities.includes(trimmed)) {
      setScrapingSettings((prev) => ({
        ...prev,
        targetCities: [...prev.targetCities, trimmed],
      }));
    }
    setNewCity('');
  };

  const handleRemoveCity = (city: string) => {
    setScrapingSettings((prev) => ({
      ...prev,
      targetCities: prev.targetCities.filter((c) => c !== city),
    }));
  };

  const handleStartScraping = async () => {
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/scraper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadsRequested: scrapingSettings.dailyLeadTarget,
          categories: scrapingSettings.targetIndustries,
          locations: scrapingSettings.targetCities,
          country: selectedCountry,
          minRating: scrapingSettings.minGoogleRating,
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
        {/* AI Readiness Warning */}
        {hasApiKey !== null && !aiReady && (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="py-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <h4 className="font-medium text-sm text-amber-700 dark:text-amber-400">
                    AI Configuration Required
                  </h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    {!hasApiKey
                      ? 'No API key configured. The scraper needs an AI provider to enrich and generate messages for scraped leads.'
                      : 'No active AI model configured. Add an AI configuration to enable lead enrichment and message generation.'}
                  </p>
                  <Link href="/settings">
                    <Button variant="outline" size="sm" className="mt-2 border-amber-500/50 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10">
                      <Settings className="h-4 w-4 mr-1" />
                      {!hasApiKey ? 'Add API Key' : 'Configure AI Model'}
                    </Button>
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Find New Leads */}
        <Card>
          <CardHeader>
            <CardTitle>Find New Leads</CardTitle>
            <CardDescription>
              Search Google Maps for businesses matching your configured criteria. Each lead is enriched from multiple sources.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Current search summary */}
            <div className="bg-muted/50 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Search className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <h4 className="font-medium text-sm mb-2">Current search configuration</h4>
                  <div className="flex flex-wrap gap-1.5 items-center">
                    <span className="text-sm text-muted-foreground">Finding</span>
                    <Badge variant="secondary">{scrapingSettings.dailyLeadTarget} {scrapingSettings.dailyLeadTarget === 1 ? 'lead' : 'leads'}</Badge>
                    <span className="text-sm text-muted-foreground">in</span>
                    {scrapingSettings.targetIndustries.length > 0 ? (
                      scrapingSettings.targetIndustries.slice(0, 5).map((industry) => (
                        <Badge key={industry} variant="secondary" className="text-xs">
                          {industry}
                        </Badge>
                      ))
                    ) : (
                      <Badge variant="outline" className="text-xs">All industries</Badge>
                    )}
                    {scrapingSettings.targetIndustries.length > 5 && (
                      <span className="text-xs text-muted-foreground">+{scrapingSettings.targetIndustries.length - 5} more</span>
                    )}
                    <span className="text-sm text-muted-foreground">from</span>
                    {scrapingSettings.targetCities.length > 0 ? (
                      scrapingSettings.targetCities.slice(0, 3).map((city) => (
                        <Badge key={city} variant="outline" className="text-xs">
                          {city}
                        </Badge>
                      ))
                    ) : (
                      <Badge variant="outline" className="text-xs">All cities</Badge>
                    )}
                    {scrapingSettings.targetCities.length > 3 && (
                      <span className="text-xs text-muted-foreground">+{scrapingSettings.targetCities.length - 3} more</span>
                    )}
                    <span className="text-sm text-muted-foreground">•</span>
                    <span className="text-xs text-muted-foreground">{scrapingSettings.minGoogleRating}+ rating</span>
                  </div>
                </div>
              </div>
            </div>

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

            {/* Action buttons */}
            <div className="flex items-center gap-3">
              <Button
                onClick={handleStartScraping}
                disabled={isSubmitting || !aiReady}
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                Start Scraping
              </Button>

              <Dialog open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Settings className="h-4 w-4 mr-2" />
                    Configure
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Settings className="h-5 w-5" />
                      Scraping Configuration
                    </DialogTitle>
                    <DialogDescription>
                      Configure what leads to search for and automation settings
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-6 pt-4">
                    {/* Country Selection */}
                    <div className="space-y-2">
                      <Label>Country</Label>
                      <Select 
                        value={selectedCountry} 
                        onValueChange={setSelectedCountry}
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

                    <hr />

                    {/* Target Industries */}
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">Target Industries</Label>
                      <p className="text-xs text-muted-foreground">
                        The types of businesses the scraper will search for on Google Maps
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {scrapingSettings.targetIndustries.map((industry) => (
                          <Badge
                            key={industry}
                            variant="secondary"
                            className="pl-2.5 pr-1 py-1 flex items-center gap-1"
                          >
                            {industry}
                            <button
                              type="button"
                              onClick={() => handleRemoveIndustry(industry)}
                              className="ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20 transition-colors"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                        {scrapingSettings.targetIndustries.length === 0 && (
                          <span className="text-sm text-muted-foreground italic">No industries configured - will search all</span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Input
                          placeholder="Add industry (e.g. Plumber, Dentist)"
                          value={newIndustry}
                          onChange={(e) => setNewIndustry(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddIndustry();
                            }
                          }}
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={handleAddIndustry}
                          disabled={!newIndustry.trim()}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Target Cities */}
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">Target Cities</Label>
                      <p className="text-xs text-muted-foreground">
                        Locations the scraper will focus on when searching for leads
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {scrapingSettings.targetCities.map((city) => (
                          <Badge
                            key={city}
                            variant="outline"
                            className="pl-2.5 pr-1 py-1 flex items-center gap-1"
                          >
                            {city}
                            <button
                              type="button"
                              onClick={() => handleRemoveCity(city)}
                              className="ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20 transition-colors"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                        {scrapingSettings.targetCities.length === 0 && (
                          <span className="text-sm text-muted-foreground italic">No cities configured - will search all</span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Input
                          placeholder="Add city (e.g. Johannesburg, Cape Town)"
                          value={newCity}
                          onChange={(e) => setNewCity(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddCity();
                            }
                          }}
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={handleAddCity}
                          disabled={!newCity.trim()}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <hr />

                    {/* Automation Settings */}
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Enable Automatic Lead Generation</Label>
                        <p className="text-sm text-muted-foreground">
                          Automatically find and add new leads daily
                        </p>
                      </div>
                      <Switch
                        checked={scrapingSettings.leadGenerationEnabled}
                        onCheckedChange={(checked) =>
                          setScrapingSettings((prev) => ({ ...prev, leadGenerationEnabled: checked }))
                        }
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label>Daily Lead Target</Label>
                        <div className="flex items-center gap-4">
                          <Slider
                            value={[scrapingSettings.dailyLeadTarget]}
                            onValueChange={(v) =>
                              setScrapingSettings((prev) => ({ ...prev, dailyLeadTarget: v[0] }))
                            }
                            min={5}
                            max={50}
                            step={5}
                            className="flex-1"
                          />
                          <span className="w-12 text-center font-medium">
                            {scrapingSettings.dailyLeadTarget}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Min Google Rating</Label>
                        <div className="flex items-center gap-4">
                          <Slider
                            value={[scrapingSettings.minGoogleRating]}
                            onValueChange={(v) =>
                              setScrapingSettings((prev) => ({ ...prev, minGoogleRating: v[0] }))
                            }
                            min={3}
                            max={5}
                            step={0.5}
                            className="flex-1"
                          />
                          <span className="w-12 text-center font-medium">
                            {scrapingSettings.minGoogleRating}+
                          </span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Search Radius (km)</Label>
                        <div className="flex items-center gap-4">
                          <Slider
                            value={[scrapingSettings.searchRadiusKm]}
                            onValueChange={(v) =>
                              setScrapingSettings((prev) => ({ ...prev, searchRadiusKm: v[0] }))
                            }
                            min={10}
                            max={100}
                            step={10}
                            className="flex-1"
                          />
                          <span className="w-12 text-center font-medium">
                            {scrapingSettings.searchRadiusKm}km
                          </span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Delay Between Requests (ms)</Label>
                        <div className="flex items-center gap-4">
                          <Slider
                            value={[scrapingSettings.scrapeDelayMs]}
                            onValueChange={(v) =>
                              setScrapingSettings((prev) => ({ ...prev, scrapeDelayMs: v[0] }))
                            }
                            min={1000}
                            max={5000}
                            step={500}
                            className="flex-1"
                          />
                          <span className="w-16 text-center font-medium">
                            {scrapingSettings.scrapeDelayMs}ms
                          </span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Min Email Leads Per Run</Label>
                        <div className="flex items-center gap-4">
                          <Slider
                            value={[scrapingSettings.minEmailLeadsPerRun]}
                            onValueChange={(v) =>
                              setScrapingSettings((prev) => ({ ...prev, minEmailLeadsPerRun: v[0] }))
                            }
                            min={0}
                            max={20}
                            step={1}
                            className="flex-1"
                          />
                          <span className="w-12 text-center font-medium">
                            {scrapingSettings.minEmailLeadsPerRun}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Keep searching until at least this many leads with email are found. Set to 0 to disable.
                        </p>
                      </div>
                    </div>

                    <div className="flex justify-end pt-2">
                      <Button onClick={handleSaveScrapingSettings} disabled={isSavingSettings}>
                        {isSavingSettings && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        <Save className="h-4 w-4 mr-2" />
                        Save Settings
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              {!aiReady && hasApiKey !== null && (
                <span className="text-xs text-amber-600 dark:text-amber-400">
                  AI provider must be configured first
                </span>
              )}
            </div>
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
