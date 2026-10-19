import { useState } from "react";
import { motion } from "framer-motion";
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
import { PageHeader } from "@/components/layout/page-header";

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
        className="mb-8"
      >
        <PageHeader
          eyebrow={t("subtitle", "Support Hub")}
          title={
            <>
              {isOwner ? t("allTickets", "All Tickets") : t("myTickets", "My Tickets")} <span className="text-primary">Verse</span>
            </>
          }
          description={t("pageDescription", "Manage and track support issues across the platform in zero-gravity.")}
          actions={
            <Link href="/tickets/new" className="w-full md:w-auto">
              <Button className="w-full md:w-auto">
                <Plus className="h-4 w-4" />
                {t("createTicket")}
              </Button>
            </Link>
          }
        />
      </motion.div>

      <div className="ov-panel p-5 md:p-6 mb-8 flex flex-col gap-5">
        <div className="flex flex-col lg:flex-row justify-between gap-5">
          <Tabs defaultValue="all" className="w-full lg:w-auto" onValueChange={handleStatusChange}>
            <TabsList className="h-11 w-full sm:w-auto">
              {["all", "open", "in_progress", "resolved"].map((status) => (
                <TabsTrigger
                  key={status}
                  value={status}
                  aria-controls="ticket-results"
                  className="flex-1 sm:flex-none gap-2 px-4 h-9"
                >
                  {t(status === "all" ? "filters.allStatus" : `status.${status}`)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <form onSubmit={handleSearch} className="relative w-full lg:w-96 flex-shrink-0 group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <Input
              type="search"
              placeholder={t("filters.search")}
              className="h-11 pl-10"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </form>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-5 border-t border-border">
          <div className="ov-label flex items-center gap-2 mr-2">
            <Filter className="w-3.5 h-3.5" />
            <span>{t("filters.refine", "Refine Signal:")}</span>
          </div>

          <Select value={filters.sortBy || "newest"} onValueChange={(val) => setFilters(f => ({ ...f, sortBy: val, page: 1 }))}>
            <SelectTrigger className="w-[200px] h-10" aria-label={t("filters.sortAria", "Sort tickets")}>
              <SelectValue placeholder={t("filters.sortPlaceholder", "Sort Projection")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">{t("filters.newest", "Newest first")}</SelectItem>
              <SelectItem value="oldest">{t("filters.oldest", "Oldest first")}</SelectItem>
              <SelectItem value="updated">{t("filters.lastUpdated", "Last updated")}</SelectItem>
              <SelectItem value="priority">{t("filters.priority", "Priority (Critical first)")}</SelectItem>
            </SelectContent>
          </Select>

          {isOwner && (
            <Select value={filters.assignedTo ? "me" : filters.createdBy ? "created" : "all"} onValueChange={(val) => {
              if (val === "all") setFilters(f => ({ ...f, assignedTo: undefined, createdBy: undefined, page: 1 }));
              if (val === "me") setFilters(f => ({ ...f, assignedTo: user?.id, createdBy: undefined, page: 1 }));
              if (val === "created") setFilters(f => ({ ...f, assignedTo: undefined, createdBy: user?.id, page: 1 }));
            }}>
              <SelectTrigger className="w-[220px] h-10" aria-label={t("filters.ownerAria", "Filter tickets")}>
                <SelectValue placeholder={t("filters.sourcePlaceholder", "Signal Source")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("filters.allSources", "All Projections")}</SelectItem>
                <SelectItem value="me">{t("filters.assignedToMe", "Assigned to me")}</SelectItem>
                <SelectItem value="created">{t("filters.createdByMe", "Initiated by me")}</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <div className="flex-1" id="ticket-results">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             {[1,2,3,4].map(i => <div key={i} className="ov-panel h-48 animate-pulse" />)}
          </div>
        ) : isError ? (
          <div className="ov-panel flex flex-col items-center justify-center p-10 text-center [--ov-line:hsl(var(--destructive)/0.4)]">
            <p className="text-destructive font-semibold mb-4">{(error as any)?.message || t("errors.loadFailed", "Failed to load tickets")}</p>
            <Button variant="outline" onClick={() => refetch()}>{t("actions.tryAgain", "Try again")}</Button>
          </div>
        ) : data?.tickets?.length === 0 ? (
          <div className="ov-panel flex flex-col items-center justify-center p-12 text-center">
            <RefreshCcw className="w-12 h-12 text-muted-foreground/40 mb-5" />
            <h3 className="font-display text-xl font-semibold">{t("noTickets")}</h3>
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
