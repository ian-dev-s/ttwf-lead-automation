'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Loader2, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface ClearNewLeadsButtonProps {
  initialCount: number;
}

export function ClearNewLeadsButton({ initialCount }: ClearNewLeadsButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [count, setCount] = useState(initialCount);
  const router = useRouter();

  const handleClear = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/leads/clear-new', {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to clear leads');
      }

      setCount(0);
      setIsOpen(false);
      
      // Refresh the page to update the kanban board
      router.refresh();
    } catch (error) {
      console.error('Error clearing leads:', error);
      alert(error instanceof Error ? error.message : 'Failed to clear leads');
    } finally {
      setIsLoading(false);
    }
  };

  // Don't show button if no NEW leads
  if (count === 0) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="text-red-600 hover:text-red-700 hover:bg-red-50">
          <Trash2 className="h-4 w-4 mr-2" />
          Clear NEW ({count})
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Clear All NEW Leads?</DialogTitle>
          <DialogDescription>
            This will permanently delete <strong>{count}</strong> lead{count !== 1 ? 's' : ''} with 
            NEW status, along with their messages and history. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleClear} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete {count} Lead{count !== 1 ? 's' : ''}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
