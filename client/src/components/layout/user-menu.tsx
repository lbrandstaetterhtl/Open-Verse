import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";
import {
  User,
  Settings,
  Shield,
  Palette,
  ShieldAlert,
  Ticket,
  Bot,
  LogOut,
  ChevronDown,
  Sparkles,
  Zap,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { Community } from "@shared/schema";
import { Separator } from "@/components/ui/separator";
import { motion, AnimatePresence } from "framer-motion";

export function UserMenu() {
  const { t } = useTranslation();
  const { user, logoutMutation } = useAuth();
  
  const { data: moderatedCommunities } = useQuery<Community[]>({
    queryKey: ["/api/user/moderated-communities"],
    enabled: !!user,
  });

  const isModerator = (moderatedCommunities && moderatedCommunities.length > 0) || user?.isAdmin;

  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-10 flex items-center gap-3 pl-1 pr-3 rounded-full hover:bg-muted/50 transition-all duration-300 border border-transparent hover:border-border/40 group">
          <div className="relative">
            <UserAvatar user={user} size="sm" />
            <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-emerald-500 border-2 border-background rounded-full ring-1 ring-emerald-500/20" />
          </div>
          <div className="hidden sm:flex flex-col items-start leading-none gap-0.5">
            <span className="text-[11px] font-black uppercase tracking-wider truncate max-w-[90px]">
              {user.username}
            </span>
            <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-tight">
              {user.role}
            </span>
          </div>
          <ChevronDown className="h-3 w-3 opacity-30 group-hover:opacity-100 transition-opacity" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64 mt-2 p-2 glass-premium rounded-2xl border-border/40 shadow-2xl" align="end" forceMount>
        <DropdownMenuLabel className="font-normal px-2 py-3">
          <div className="flex items-center gap-4">
            <div className="relative">
              <UserAvatar user={user} size="md" />
              <div className="absolute -top-1 -right-1 p-0.5 bg-primary text-primary-foreground rounded-full shadow-sm">
                <Zap className="h-2.5 w-2.5 fill-current" />
              </div>
            </div>
            <div className="flex flex-col space-y-0.5">
              <p className="text-sm font-black tracking-tight">{user.username}</p>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                {user.email || t("user.no_email", "No email verified")}
              </p>
            </div>
          </div>
        </DropdownMenuLabel>
        
        <DropdownMenuSeparator className="opacity-40" />
        
        <DropdownMenuGroup className="space-y-1">
          <Link href="/profile">
            <DropdownMenuItem className="cursor-pointer rounded-xl h-10 focus:bg-primary/5 transition-colors">
              <User className="mr-3 h-4 w-4 text-blue-500" />
              <span className="text-sm font-semibold">{t("navbar.profile")}</span>
            </DropdownMenuItem>
          </Link>
          <Link href="/ai-generator">
            <DropdownMenuItem className="cursor-pointer rounded-xl h-10 focus:bg-primary/5 transition-colors">
              <Bot className="mr-3 h-4 w-4 text-purple-500" />
              <div className="flex items-center justify-between w-full">
                <span className="text-sm font-semibold">{t("navbar.ai_generator")}</span>
                <Sparkles className="h-3 w-3 text-purple-400 animate-pulse" />
              </div>
            </DropdownMenuItem>
          </Link>
          <Link href="/theme-builder">
            <DropdownMenuItem className="cursor-pointer rounded-xl h-10 focus:bg-primary/5 transition-colors">
              <Palette className="mr-3 h-4 w-4 text-pink-500" />
              <span className="text-sm font-semibold">{t("navbar.theme_builder")}</span>
            </DropdownMenuItem>
          </Link>
        </DropdownMenuGroup>

        <DropdownMenuSeparator className="opacity-40" />

        <DropdownMenuGroup className="space-y-1">
          <Link href="/tickets">
            <DropdownMenuItem className="cursor-pointer rounded-xl h-10 focus:bg-primary/5 transition-colors">
              <Ticket className="mr-3 h-4 w-4 text-emerald-500" />
              <span className="text-sm font-semibold">{t("navbar.support", "Support Tickets")}</span>
            </DropdownMenuItem>
          </Link>
        </DropdownMenuGroup>

        {(isModerator || user.isAdmin) && (
          <>
            <DropdownMenuSeparator className="opacity-40" />
            <DropdownMenuGroup className="space-y-1">
              {isModerator && (
                <Link href="/mod-panel">
                  <DropdownMenuItem className="cursor-pointer rounded-xl h-10 focus:bg-amber-500/5 transition-colors">
                    <ShieldAlert className="mr-3 h-4 w-4 text-amber-500" />
                    <span className="text-sm font-black text-amber-600 dark:text-amber-400 uppercase tracking-tight">
                      {t("navbar.mod_panel")}
                    </span>
                  </DropdownMenuItem>
                </Link>
              )}
              {(user.isAdmin || user.role === "admin" || user.role === "owner") && (
                <Link href="/admin">
                  <DropdownMenuItem className="cursor-pointer rounded-xl h-10 focus:bg-primary/5 transition-colors">
                    <Shield className="mr-3 h-4 w-4 text-primary" />
                    <span className="text-sm font-black text-primary uppercase tracking-tight">
                      {t("navbar.admin")}
                    </span>
                  </DropdownMenuItem>
                </Link>
              )}
            </DropdownMenuGroup>
          </>
        )}

        <DropdownMenuSeparator className="opacity-40" />
        
        <DropdownMenuItem 
          className="cursor-pointer rounded-xl h-10 text-destructive focus:text-destructive focus:bg-destructive/5 transition-colors"
          onClick={() => logoutMutation.mutate()}
          disabled={logoutMutation.isPending}
        >
          <LogOut className="mr-3 h-4 w-4" />
          <span className="text-sm font-bold">{t("navbar.logout")}</span>
        </DropdownMenuItem>
        
        <div className="p-2 pt-2">
          <Separator className="my-2 opacity-30" />
          <p className="text-[9px] text-center text-muted-foreground uppercase tracking-[0.3em] font-black opacity-40 py-1">
            Open Verse v0.1.2
          </p>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
