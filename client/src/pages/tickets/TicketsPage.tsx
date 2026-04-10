import { useState } from "react";
import { useTickets, type TicketFilters } from "@/hooks/use-tickets";
import { TicketCard } from "@/components/tickets/TicketCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { Search, Plus, Loader2, RefreshCcw, Filter } from "lucide-react";
import { BackButton } from "@/components/ui/back-button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function TicketsPage() {
  const { t } = useTranslation("tickets");
  const { user } = useAuth();
  const [filters, setFilters] = useState<TicketFilters>({ status: undefined, search: "" });
  const [searchInput, setSearchInput] = useState("");

  const { data, isLoading, isError, error, refetch } = useTickets(filters);

  const isOwner = user?.role === "owner";

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setFilters(f => ({ ...f, search: searchInput, page: 1 }));
  };

  const handleStatusChange = (status: string) => {
    setFilters(f => ({ ...f, status: status === "all" ? undefined : status, page: 1 }));
  };

  return (
    <div className="container max-w-5xl mx-auto py-8 px-4 h-full flex flex-col pt-20">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <BackButton fallback="/feed" className="mb-2 -ml-4" />
          <h1 className="text-3xl font-bold tracking-tight">{isOwner ? t("allTickets") : t("myTickets")}</h1>
          <p className="text-muted-foreground mt-1">Manage and track support issues</p>
        </div>
        <Link href="/tickets/new">
          <Button className="font-bold">
            <Plus className="w-4 h-4 mr-2" />
            {t("createTicket")}
          </Button>
        </Link>
      </div>

      <div className="bg-card border rounded-lg p-3 mb-6 shadow-sm flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row justify-between gap-3">
          <Tabs defaultValue="all" className="w-full sm:w-auto overflow-x-auto" onValueChange={handleStatusChange}>
            <TabsList className="bg-transparent space-x-1 p-0 h-9">
              <TabsTrigger value="all" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary font-medium">{t("filters.allStatus")}</TabsTrigger>
              <TabsTrigger value="open" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary font-medium">{t("status.open")}</TabsTrigger>
              <TabsTrigger value="in_progress" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary font-medium">{t("status.in_progress")}</TabsTrigger>
              <TabsTrigger value="resolved" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary font-medium">{t("status.resolved")}</TabsTrigger>
            </TabsList>
          </Tabs>

          <form onSubmit={handleSearch} className="relative w-full sm:w-64 flex-shrink-0">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              type="search" 
              placeholder={t("filters.search")} 
              className="pl-9 h-9" 
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </form>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border/50">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mr-2">
            <Filter className="w-4 h-4" />
            <span>Filters:</span>
          </div>

          <Select value={filters.sortBy || "newest"} onValueChange={(val) => setFilters(f => ({ ...f, sortBy: val, page: 1 }))}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue placeholder="Sort By" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest First</SelectItem>
              <SelectItem value="oldest">Oldest First</SelectItem>
              <SelectItem value="updated">Recently Updated</SelectItem>
              <SelectItem value="priority">Highest Priority</SelectItem>
            </SelectContent>
          </Select>

          {isOwner && (
            <Select value={filters.assignedTo ? "me" : filters.createdBy ? "created" : "all"} onValueChange={(val) => {
              if (val === "all") setFilters(f => ({ ...f, assignedTo: undefined, createdBy: undefined, page: 1 }));
              if (val === "me") setFilters(f => ({ ...f, assignedTo: user?.id, createdBy: undefined, page: 1 }));
              if (val === "created") setFilters(f => ({ ...f, assignedTo: undefined, createdBy: user?.id, page: 1 }));
            }}>
              <SelectTrigger className="w-[160px] h-8 text-xs">
                <SelectValue placeholder="Ownership" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tickets</SelectItem>
                <SelectItem value="me">Assigned to Me</SelectItem>
                <SelectItem value="created">Created by Me</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto rounded-lg">
        {isLoading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <p className="text-red-500 mb-2">{(error as any)?.message || "Failed to load"}</p>
            <Button variant="outline" onClick={() => refetch()}>Try Again</Button>
          </div>
        ) : data?.tickets?.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center bg-card border rounded-lg border-dashed">
            <RefreshCcw className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <h3 className="font-semibold text-lg">{t("noTickets")}</h3>
            <p className="text-muted-foreground">{t("noTicketsDescription")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {data?.tickets.map(ticket => (
              <TicketCard key={ticket.id} ticket={ticket} showOwnerFeatures={isOwner} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
