import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Newspaper, Film, MessageCircle, ArrowRight, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

interface CreatePostSelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultType?: "media" | "discussion";
}

export function CreatePostSelectorDialog({
  open,
  onOpenChange,
  defaultType,
}: CreatePostSelectorDialogProps) {
  const { t } = useTranslation();

  const options = [
    {
      id: "news",
      href: "/post/news",
      icon: Newspaper,
      label: t("create_post.news.title", "News"),
      description: t("create_post.news.selector_desc", "Share breaking news and informational updates."),
      color: "from-blue-500/20 to-cyan-500/20",
      iconColor: "text-blue-400",
      group: "media",
    },
    {
      id: "entertainment",
      href: "/post/entertainment",
      icon: Film,
      label: t("create_post.entertainment.title", "Entertainment"),
      description: t("create_post.entertainment.selector_desc", "Fun, creative, and engaging visual content."),
      color: "from-purple-500/20 to-pink-500/20",
      iconColor: "text-purple-400",
      group: "media",
    },
    {
      id: "discussion",
      href: "/post/discussion",
      icon: MessageCircle,
      label: t("create_post.discussion.title", "Discussion"),
      description: t("create_post.discussion.selector_desc", "Start a deep conversation or ask the community."),
      color: "from-emerald-500/20 to-teal-500/20",
      iconColor: "text-emerald-400",
      group: "discussion",
    },
  ];

  // If we're in Media Feed, we might want to emphasize Media options
  // If we're in Discussions, we might just want to show Discussion or all.
  // The user said: "im media feed ob man news oder entertainment posted"
  // and "bei discussion gibt es ja keine unter feed"

  const filteredOptions = defaultType === "media" 
    ? options.filter(o => o.group === "media")
    : options;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] p-0 overflow-hidden bg-background/95 backdrop-blur-2xl border-white/10 shadow-2xl rounded-[2.5rem]">
        <div className="relative p-8 md:p-12 overflow-hidden">
          {/* Background Glows */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-[100px] -mr-32 -mt-32" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-accent/10 rounded-full blur-[100px] -ml-32 -mb-32" />

          <DialogHeader className="relative z-10 mb-10 text-center sm:text-left">
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 w-fit mb-4 mx-auto sm:mx-0"
            >
              <Sparkles className="h-3 w-3 text-primary" />
              <span className="text-[10px] font-black uppercase tracking-widest text-primary">
                {t("create_post.selector.subtitle", "New Creation")}
              </span>
            </motion.div>
            <DialogTitle className="text-3xl md:text-4xl font-black tracking-tighter uppercase italic">
              {t("create_post.selector.title", "What's the Universe saying?")}
            </DialogTitle>
            <DialogDescription className="text-base md:text-lg text-muted-foreground font-medium mt-2">
              {t("create_post.selector.description", "Choose a dimension for your story to resonate in.")}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 relative z-10">
            {filteredOptions.map((option, idx) => (
              <Link key={option.id} href={option.href} onClick={() => onOpenChange(false)}>
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className={cn(
                    "group relative overflow-hidden rounded-[1.5rem] p-6 border border-white/5 transition-all duration-500",
                    "hover:border-primary/50 hover:shadow-xl hover:shadow-primary/10 hover:-translate-y-1 cursor-pointer",
                    "bg-gradient-to-br",
                    option.color
                  )}
                >
                  <div className="flex items-center gap-6">
                    <div className={cn(
                      "h-14 w-14 rounded-2xl bg-black/20 flex items-center justify-center transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3",
                      option.iconColor
                    )}>
                      <option.icon className="h-7 w-7" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xl font-black tracking-tight uppercase group-hover:text-primary transition-colors">
                        {option.label}
                      </h4>
                      <p className="text-sm text-muted-foreground font-medium line-clamp-1 opacity-80 group-hover:opacity-100 transition-opacity">
                        {option.description}
                      </p>
                    </div>
                    <ArrowRight className="h-5 w-5 text-muted-foreground opacity-0 -translate-x-4 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0" />
                  </div>
                </motion.div>
              </Link>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
