import React, { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

/**
 * RESPONSIVE-MODAL [UI-R-002]: Dialog to Bottom Sheet
 * Mobile: Slides up from bottom like a native app.
 * Desktop: Centered dialog.
 */

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
  hideClose?: boolean;
}

export function ResponsiveModal({ open, onClose, title, children, className, hideClose }: ModalProps) {
  return (
    <>
      {/* Mobile Bottom Sheet */}
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 md:hidden flex items-end justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={onClose}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className={cn(
                "relative w-full bg-background rounded-t-[2.5rem] shadow-2xl border-t border-border/40",
                "pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] overflow-hidden flex flex-col max-h-[92vh]",
                className
              )}
            >
              {/* Handle Bar */}
              <div className="flex justify-center py-4 flex-shrink-0">
                <div className="w-12 h-1.5 rounded-full bg-muted-foreground/20" />
              </div>

              {title && (
                <div className="px-6 pb-4 flex items-center justify-between border-b border-border/40 flex-shrink-0">
                  <h2 className="font-black text-xl tracking-tight">{title}</h2>
                  {!hideClose && (
                    <button 
                      onClick={onClose}
                      className="p-2 rounded-full hover:bg-muted transition-colors active:scale-90"
                    >
                      <X className="h-5 w-5 opacity-60" />
                    </button>
                  )}
                </div>
              )}

              <div className="flex-1 overflow-y-auto p-6 scrollbar-none">
                {children}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Desktop Dialog */}
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className={cn(
          "hidden md:flex flex-col gap-6 max-w-lg p-8 rounded-[2rem] glass-premium border-border/40",
          className
        )}>
          {title && (
            <DialogHeader className="space-y-1">
              <DialogTitle className="text-2xl font-black tracking-tight">{title}</DialogTitle>
            </DialogHeader>
          )}
          <div className="relative">
            {children}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
