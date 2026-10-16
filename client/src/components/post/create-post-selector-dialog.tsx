import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Newspaper, Film, MessagesSquare, ArrowRight } from "lucide-react";
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
      label: t("create_post.news.title", "Share News"),
      description: t("create_post.news.selector_desc", "Share breaking news and informational updates."),
      iconColor: "bg-primary/10 text-primary",
      group: "media",
    },
    {
      id: "entertainment",
      href: "/post/entertainment",
      icon: Film,
      label: t("create_post.entertainment.title", "Share Something Fun"),
      description: t("create_post.entertainment.selector_desc", "Fun, creative, and engaging visual content."),
      iconColor: "bg-star/10 text-star",
      group: "media",
    },
    {
      id: "discussion",
      href: "/post/discussions",
      icon: MessagesSquare,
      label: t("create_post.discussion.title", "Start a Discussion"),
      description: t("create_post.discussion.selector_desc", "Start a deep conversation or ask the community."),
      iconColor: "bg-primary/10 text-primary",
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
      <DialogContent className="sm:max-w-[600px] p-0 overflow-hidden">
        <div className="relative p-6 md:p-8">
          <DialogHeader className="relative mb-6 text-center sm:text-left">
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="ov-label mb-1"
            >
              {t("create_post.selector.subtitle", "New Creation")}
            </motion.div>
            <DialogTitle className="font-display text-2xl md:text-3xl font-semibold leading-tight tracking-[-0.01em]">
              {t("create_post.selector.title", "What's the Universe saying?")}
            </DialogTitle>
            <DialogDescription className="text-[15px] text-muted-foreground mt-1">
              {t("create_post.selector.description", "Choose a dimension for your story to resonate in.")}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 relative">
            {filteredOptions.map((option, idx) => (
              <Link key={option.id} href={option.href} onClick={() => onOpenChange(false)}>
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className="ov-panel ov-panel-hover group cursor-pointer p-4 md:p-5"
                >
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "ov-cut flex h-12 w-12 shrink-0 items-center justify-center rounded-sm",
                      option.iconColor
                    )}>
                      <option.icon className="h-6 w-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-display text-lg font-semibold group-hover:text-primary transition-colors">
                        {option.label}
                      </h4>
                      <p className="text-sm text-muted-foreground line-clamp-1">
                        {option.description}
                      </p>
                    </div>
                    <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground transition-colors duration-150 group-hover:text-primary" />
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
