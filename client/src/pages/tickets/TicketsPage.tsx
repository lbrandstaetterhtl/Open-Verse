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
    <div className="w-full px-4 md:px-8 py-6 md:py-10 flex flex-col h-full min-h-screen">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 mb-10">
        <div className="space-y-1">
          <h1 className="text-4xl md:text-5xl font-black tracking-tighter uppercase italic italic">
            {isOwner ? t("allTickets") : t("myTickets")}
          </h1>
          <p className="text-muted-foreground font-medium">{t("subtitle", "Manage and track support issues across the platform")}</p>
        </div>
        <Link href="/tickets/new" className="w-full sm:w-auto">
          <Button className="w-full sm:w-auto h-14 px-8 rounded-2xl shadow-xl shadow-primary/20 gap-3 font-black uppercase tracking-widest text-[10px] md:text-xs">
            <Plus className="h-5 w-5 stroke-[3px]" />
            {t("createTicket")}
          </Button>
        </Link>
      </div>

      <div className="bg-card/50 backdrop-blur-xl border border-white/10 rounded-[2rem] p-4 md:p-6 mb-8 shadow-2xl shadow-black/5 flex flex-col gap-4">
        <div className="flex flex-col xl:flex-row justify-between gap-4">
          <Tabs defaultValue="all" className="w-full xl:w-auto" onValueChange={handleStatusChange}>
            <TabsList className="w-full sm:w-auto grid grid-cols-2 sm:flex bg-muted/20 p-1 rounded-xl h-auto sm:h-11">
              <TabsTrigger value="all" className="rounded-lg font-bold text-[10px] uppercase tracking-wider h-9 sm:h-auto">{t("filters.allStatus")}</TabsTrigger>
              <TabsTrigger value="open" className="rounded-lg font-bold text-[10px] uppercase tracking-wider h-9 sm:h-auto">{t("status.open")}</TabsTrigger>
              <TabsTrigger value="in_progress" className="rounded-lg font-bold text-[10px] uppercase tracking-wider h-9 sm:h-auto">{t("status.in_progress")}</TabsTrigger>
              <TabsTrigger value="resolved" className="rounded-lg font-bold text-[10px] uppercase tracking-wider h-9 sm:h-auto">{t("status.resolved")}</TabsTrigger>
            </TabsList>
          </Tabs>

          <form onSubmit={handleSearch} className="relative w-full xl:w-80 flex-shrink-0">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              type="search" 
              placeholder={t("filters.search")} 
              className="pl-11 h-12 rounded-xl bg-muted/30 border-transparent focus:bg-background transition-all text-sm shadow-inner" 
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </form>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-white/5">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground mr-2">
            <Filter className="w-3 h-3" />
            <span>Refine Feed:</span>
          </div>

          <Select value={filters.sortBy || "newest"} onValueChange={(val) => setFilters(f => ({ ...f, sortBy: val, page: 1 }))}>
            <SelectTrigger className="w-[160px] h-10 rounded-xl text-[10px] font-bold uppercase tracking-wider bg-muted/20 border-transparent">
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
              <SelectTrigger className="w-[180px] h-10 rounded-xl text-[10px] font-bold uppercase tracking-wider bg-muted/20 border-transparent">
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

      <div className="flex-1">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             {[1,2,3,4].map(i => <div key={i} className="h-48 rounded-[2rem] bg-muted/20 animate-pulse" />)}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center p-12 text-center rounded-[2rem] bg-red-500/5 border border-red-500/10">
            <p className="text-red-500 font-bold mb-4">{(error as any)?.message || "Failed to load"}</p>
            <Button variant="outline" onClick={() => refetch()} className="rounded-xl font-black uppercase text-[10px]">Try Again</Button>
          </div>
        ) : data?.tickets?.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-20 text-center bg-card/20 border border-dashed border-white/10 rounded-[3rem]">
            <RefreshCcw className="w-16 h-16 text-muted-foreground/10 mb-6" />
            <h3 className="font-black text-2xl uppercase tracking-tight">{t("noTickets")}</h3>
            <p className="text-muted-foreground mt-2 max-w-xs">{t("noTicketsDescription")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-6">
            {data?.tickets.map(ticket => (
              <TicketCard key={ticket.id} ticket={ticket} showOwnerFeatures={isOwner} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
  );
}
