'use client';

import { Header } from '@/components/layout/Header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatDateTime } from '@/lib/utils';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Globe,
  History,
  Loader2,
  MapPin,
  Phone,
  Search,
  Star,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

interface AnalyzedBusiness {
  id: string;
  businessName: string;
  location: string;
  googleMapsUrl: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  googleRating: number | null;
  reviewCount: number | null;
  category: string | null;
  websiteQuality: number | null;
  isGoodProspect: boolean;
  skipReason: string | null;
  wasConverted: boolean;
  leadId: string | null;
  analyzedAt: string;
}

interface Statistics {
  total: number;
  prospects: number;
  skipped: number;
  converted: number;
}

interface Pagination {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
}

type FilterType = 'all' | 'prospects' | 'skipped' | 'converted';

export default function HistoryPage() {
  const [businesses, setBusinesses] = useState<AnalyzedBusiness[]>([]);
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isClearing, setIsClearing] = useState(false);

  // Filters
  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);

  const fetchHistory = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '25',
        filter,
      });
      if (search) {
        params.set('search', search);
      }

      const response = await fetch(`/api/history?${params}`);
      const data = await response.json();

      setBusinesses(data.businesses || []);
      setStatistics(data.statistics || null);
      setPagination(data.pagination || null);
    } catch (error) {
      console.error('Error fetching history:', error);
    } finally {
      setIsLoading(false);
    }
  }, [page, filter, search]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const handleClearHistory = async (olderThanDays?: number) => {
    const message = olderThanDays
      ? `Are you sure you want to clear history older than ${olderThanDays} days?`
      : 'Are you sure you want to clear ALL history? This cannot be undone.';
    
    if (!confirm(message)) return;

    setIsClearing(true);
    try {
      const params = olderThanDays ? `?olderThan=${olderThanDays}` : '';
      const response = await fetch(`/api/history${params}`, { method: 'DELETE' });
      const data = await response.json();
      
      if (data.success) {
        alert(`Cleared ${data.deletedCount} records from history.`);
        fetchHistory();
      }
    } catch (error) {
      console.error('Error clearing history:', error);
    } finally {
      setIsClearing(false);
    }
  };

  const getProspectBadge = (business: AnalyzedBusiness) => {
    if (business.wasConverted) {
      return (
        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Converted
        </Badge>
      );
    }
    if (business.isGoodProspect) {
      return (
        <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
          <Star className="h-3 w-3 mr-1" />
          Prospect
        </Badge>
      );
    }
    return (
      <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400">
        <XCircle className="h-3 w-3 mr-1" />
        Skipped
      </Badge>
    );
  };

  const getQualityBadge = (score: number | null) => {
    if (score === null) {
      return <Badge variant="outline">No website</Badge>;
    }
    if (score < 40) {
      return (
        <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
          Poor ({score})
        </Badge>
      );
    }
    if (score < 60) {
      return (
        <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
          Fair ({score})
        </Badge>
      );
    }
    return (
      <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
        Good ({score})
      </Badge>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Analysis History"
        description="View all businesses that have been analyzed by the scraper"
      />

      <div className="flex-1 p-6 overflow-y-auto space-y-6">
        {/* Statistics Cards */}
        {statistics && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900/50 dark:to-slate-800/50">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Analyzed</p>
                    <p className="text-2xl font-bold">{statistics.total.toLocaleString()}</p>
                  </div>
                  <History className="h-8 w-8 text-slate-500" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Good Prospects</p>
                    <p className="text-2xl font-bold text-blue-600">{statistics.prospects.toLocaleString()}</p>
                  </div>
                  <Star className="h-8 w-8 text-blue-500" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900/20 dark:to-gray-800/20">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Skipped</p>
                    <p className="text-2xl font-bold text-gray-600">{statistics.skipped.toLocaleString()}</p>
                  </div>
                  <XCircle className="h-8 w-8 text-gray-500" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Converted to Leads</p>
                    <p className="text-2xl font-bold text-green-600">{statistics.converted.toLocaleString()}</p>
                  </div>
                  <CheckCircle2 className="h-8 w-8 text-green-500" />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Filters and Search */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Analyzed Businesses
            </CardTitle>
            <CardDescription>
              Businesses are cached to avoid re-analyzing them on future scrapes
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4 mb-6">
              {/* Search */}
              <form onSubmit={handleSearch} className="flex-1 flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, location, or category..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Button type="submit" variant="secondary">
                  Search
                </Button>
              </form>

              {/* Filter */}
              <Select value={filter} onValueChange={(v) => { setFilter(v as FilterType); setPage(1); }}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Businesses</SelectItem>
                  <SelectItem value="prospects">Good Prospects</SelectItem>
                  <SelectItem value="skipped">Skipped</SelectItem>
                  <SelectItem value="converted">Converted to Leads</SelectItem>
                </SelectContent>
              </Select>

              {/* Clear History Dropdown */}
              <Select onValueChange={(v) => handleClearHistory(v === 'all' ? undefined : parseInt(v))}>
                <SelectTrigger className="w-[180px]" disabled={isClearing}>
                  {isClearing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Clear History
                    </>
                  )}
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">Older than 30 days</SelectItem>
                  <SelectItem value="60">Older than 60 days</SelectItem>
                  <SelectItem value="90">Older than 90 days</SelectItem>
                  <SelectItem value="all">Clear All</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Results */}
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : businesses.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No analyzed businesses found</p>
                <p className="text-sm mt-2">Run the scraper to start building history</p>
              </div>
            ) : (
              <div className="space-y-3">
                {businesses.map((business) => (
                  <div
                    key={business.id}
                    className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-medium truncate">{business.businessName}</h3>
                          {getProspectBadge(business)}
                          {getQualityBadge(business.websiteQuality)}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" />
                            {business.location}
                          </span>
                          
                          {business.category && (
                            <span className="flex items-center gap-1">
                              <Building2 className="h-3.5 w-3.5" />
                              {business.category}
                            </span>
                          )}
                          
                          {business.googleRating && (
                            <span className="flex items-center gap-1">
                              <Star className="h-3.5 w-3.5 text-yellow-500" />
                              {business.googleRating} ({business.reviewCount || 0} reviews)
                            </span>
                          )}
                          
                          {business.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3.5 w-3.5" />
                              {business.phone}
                            </span>
                          )}
                          
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {formatDateTime(business.analyzedAt)}
                          </span>
                        </div>

                        {business.skipReason && (
                          <p className="text-sm mt-2 text-muted-foreground">
                            <AlertTriangle className="h-3.5 w-3.5 inline mr-1" />
                            {business.skipReason}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {business.website && (
                          <Button
                            variant="ghost"
                            size="sm"
                            asChild
                          >
                            <a href={business.website} target="_blank" rel="noopener noreferrer">
                              <Globe className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                        {business.googleMapsUrl && (
                          <Button
                            variant="ghost"
                            size="sm"
                            asChild
                          >
                            <a href={business.googleMapsUrl} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && (
              <div className="flex items-center justify-between mt-6 pt-6 border-t">
                <p className="text-sm text-muted-foreground">
                  Showing {((pagination.page - 1) * pagination.limit) + 1} - {Math.min(pagination.page * pagination.limit, pagination.totalCount)} of {pagination.totalCount}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground px-2">
                    Page {pagination.page} of {pagination.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                    disabled={page === pagination.totalPages}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
