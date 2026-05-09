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
    <div className="w-full px-4 md:px-8 py-6 md:py-10 flex flex-col h-full min-h-screen pb-24">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row justify-between items-start md:items-end gap-8 mb-12"
      >
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-primary">
            <RefreshCcw className="h-5 w-5 stroke-[2.5px] animate-spin-slow" />
            <span className="text-[10px] font-black uppercase tracking-[0.4em]">{t("subtitle", "Support Hub")}</span>
          </div>
          <h1 className="text-5xl md:text-7xl font-black tracking-tighter uppercase italic leading-none">
            {isOwner ? t("allTickets") : t("myTickets")} <span className="text-transparent bg-clip-text bg-gradient-to-br from-primary to-accent">Verse</span>
          </h1>
          <p className="text-lg text-muted-foreground/60 font-medium max-w-lg">Manage and track support issues across the platform in zero-gravity.</p>
        </div>
        <Link href="/tickets/new" className="w-full md:w-auto">
          <Button className="w-full md:w-auto h-16 px-12 rounded-full shadow-2xl shadow-primary/30 gap-4 font-black uppercase tracking-widest text-[11px] transition-all hover:shadow-primary/50 hover:-translate-y-2 active:translate-y-0 active:scale-95 nebula-glow">
            <Plus className="h-6 w-6 stroke-[4px]" />
            {t("createTicket")}
          </Button>
        </Link>
      </motion.div>

      <div className="glass-premium border-white/5 rounded-[3rem] p-6 md:p-10 mb-12 shadow-2xl shadow-black/20 flex flex-col gap-8 relative overflow-hidden group">
        <div className="absolute inset-0 nebula-banner opacity-5 group-hover:opacity-10 transition-opacity duration-1000" />
        
        <div className="relative z-10 flex flex-col lg:flex-row justify-between gap-8">
          <Tabs defaultValue="all" className="w-full lg:w-auto" onValueChange={handleStatusChange}>
            <TabsList className="bg-background/40 backdrop-blur-3xl p-1.5 rounded-full border border-white/10 h-14 w-full sm:w-auto">
              {["all", "open", "in_progress", "resolved"].map((status) => (
                <TabsTrigger 
                  key={status}
                  value={status} 
                  className="relative flex-1 sm:flex-none flex items-center gap-3 px-8 h-11 rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-xl data-[state=active]:shadow-primary/20 transition-all text-[10px] font-black uppercase tracking-widest z-10"
                >
                  {t(status === "all" ? "filters.allStatus" : `status.${status}`)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <form onSubmit={handleSearch} className="relative w-full lg:w-96 flex-shrink-0 group">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-all duration-300" />
            <Input 
              type="search" 
              placeholder={t("filters.search")} 
              className="glass-input pl-14 h-14 rounded-full border-white/10 focus-visible:ring-primary shadow-2xl shadow-black/10 font-bold text-xs" 
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </form>
        </div>

        <div className="relative z-10 flex flex-wrap items-center gap-4 pt-8 border-t border-white/5">
          <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.3em] text-primary/60 mr-4">
            <Filter className="w-4 h-4" />
            <span>Refine Signal:</span>
          </div>

          <Select value={filters.sortBy || "newest"} onValueChange={(val) => setFilters(f => ({ ...f, sortBy: val, page: 1 }))}>
            <SelectTrigger className="w-[200px] h-12 rounded-full text-[10px] font-black uppercase tracking-widest glass-input border-white/5">
              <SelectValue placeholder="Sort Projection" />
            </SelectTrigger>
            <SelectContent className="glass-premium border-white/10">
              <SelectItem value="newest" className="font-bold text-xs uppercase tracking-widest">Newest First</SelectItem>
              <SelectItem value="oldest" className="font-bold text-xs uppercase tracking-widest">Oldest First</SelectItem>
              <SelectItem value="updated" className="font-bold text-xs uppercase tracking-widest">Recently Updated</SelectItem>
              <SelectItem value="priority" className="font-bold text-xs uppercase tracking-widest">Highest Priority</SelectItem>
            </SelectContent>
          </Select>

          {isOwner && (
            <Select value={filters.assignedTo ? "me" : filters.createdBy ? "created" : "all"} onValueChange={(val) => {
              if (val === "all") setFilters(f => ({ ...f, assignedTo: undefined, createdBy: undefined, page: 1 }));
              if (val === "me") setFilters(f => ({ ...f, assignedTo: user?.id, createdBy: undefined, page: 1 }));
              if (val === "created") setFilters(f => ({ ...f, assignedTo: undefined, createdBy: user?.id, page: 1 }));
            }}>
              <SelectTrigger className="w-[220px] h-12 rounded-full text-[10px] font-black uppercase tracking-widest glass-input border-white/5">
                <SelectValue placeholder="Signal Source" />
              </SelectTrigger>
              <SelectContent className="glass-premium border-white/10">
                <SelectItem value="all" className="font-bold text-xs uppercase tracking-widest">All Projections</SelectItem>
                <SelectItem value="me" className="font-bold text-xs uppercase tracking-widest">Assigned to Me</SelectItem>
                <SelectItem value="created" className="font-bold text-xs uppercase tracking-widest">Initiated by Me</SelectItem>
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
