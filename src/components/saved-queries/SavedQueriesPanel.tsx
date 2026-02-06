import { useState, useEffect, useRef } from "react";
import { formatDistanceToNow } from "date-fns";
import { MoreVertical, Bookmark, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useDuckStore } from "@/store";
import {
  getSavedQueries,
  updateSavedQuery,
  deleteSavedQuery,
  type SavedQuery,
} from "@/services/persistence/repositories/savedQueryRepository";

interface SavedQueriesPanelProps {
  onClose: () => void;
}

export default function SavedQueriesPanel({ onClose }: SavedQueriesPanelProps) {
  const { currentProfileId, createTab, savedQueriesVersion, bumpSavedQueriesVersion } =
    useDuckStore();
  const [queries, setQueries] = useState<SavedQuery[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!currentProfileId) return;
    setLoading(true);
    getSavedQueries(currentProfileId)
      .then(setQueries)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [currentProfileId, savedQueriesVersion]);

  useEffect(() => {
    if (editingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [editingId]);

  const handleOpen = (query: SavedQuery) => {
    createTab("sql", query.sql_text, query.name);
  };

  const handleStartRename = (query: SavedQuery) => {
    setEditingId(query.id);
    setEditName(query.name);
  };

  const handleFinishRename = async (id: string) => {
    if (!editName.trim()) {
      setEditingId(null);
      return;
    }
    try {
      await updateSavedQuery(id, { name: editName.trim() });
      setQueries((prev) =>
        prev.map((q) => (q.id === id ? { ...q, name: editName.trim() } : q))
      );
      bumpSavedQueriesVersion();
    } catch {
      toast.error("Failed to rename query");
    }
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteSavedQuery(id);
      setQueries((prev) => prev.filter((q) => q.id !== id));
      bumpSavedQueriesVersion();
      toast.success("Query deleted");
    } catch {
      toast.error("Failed to delete query");
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <span className="text-sm font-medium flex items-center gap-2">
          <Bookmark className="h-4 w-4" />
          Saved Queries
        </span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {loading ? (
          <div className="p-3 space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-md" />
            ))}
          </div>
        ) : queries.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            <Bookmark className="h-8 w-8 mx-auto mb-3 opacity-50" />
            <p>No saved queries yet</p>
            <p className="text-xs mt-1">Save a query from the editor toolbar</p>
          </div>
        ) : (
          <div className="space-y-2 p-3">
            {queries.map((query) => (
              <Card
                key={query.id}
                className="cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => handleOpen(query)}
              >
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0 space-y-1">
                      {editingId === query.id ? (
                        <Input
                          ref={renameInputRef}
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onBlur={() => handleFinishRename(query.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleFinishRename(query.id);
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="h-6 text-sm font-medium px-1"
                        />
                      ) : (
                        <span className="font-medium text-sm truncate block">
                          {query.name}
                        </span>
                      )}
                      <pre className="text-xs font-mono text-muted-foreground truncate">
                        {query.sql_text.length > 100
                          ? query.sql_text.slice(0, 100) + "..."
                          : query.sql_text}
                      </pre>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(query.updated_at), { addSuffix: true })}
                      </span>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpen(query);
                          }}
                        >
                          Open in new tab
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartRename(query);
                          }}
                        >
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(query.id);
                          }}
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
