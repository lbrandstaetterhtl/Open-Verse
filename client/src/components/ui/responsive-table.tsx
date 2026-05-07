import { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * RESPONSIVE-TABLE [UI-R-001]: Table to Cards
 * Automatically switches between a traditional table on desktop 
 * and a card-based layout on mobile.
 */

export interface Column<T> {
  key: string;
  label: string;
  render?: (row: T) => ReactNode;
}

interface ResponsiveTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyField: keyof T;
  renderMobileCard: (row: T) => ReactNode;
  className?: string;
  onRowClick?: (row: T) => void;
}

export function ResponsiveTable<T>({ 
  columns, 
  data, 
  keyField, 
  renderMobileCard,
  className,
  onRowClick
}: ResponsiveTableProps<T>) {
  return (
    <div className={cn("w-full", className)}>
      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              {columns.map(col => (
                <th 
                  key={col.key} 
                  className="text-left px-4 py-3.5 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-muted-foreground italic">
                  No data available
                </td>
              </tr>
            ) : (
              data.map((row, idx) => (
                <tr 
                  key={String(row[keyField]) || idx} 
                  className={cn(
                    "hover:bg-muted/30 transition-colors",
                    onRowClick && "cursor-pointer"
                  )}
                  onClick={() => onRowClick?.(row)}
                >
                  {columns.map(col => (
                    <td key={col.key} className="px-4 py-3 text-sm">
                      {col.render ? col.render(row) : String(row[col.key as keyof T] ?? '')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden flex flex-col gap-3">
        {data.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground italic border rounded-xl bg-card">
            No data available
          </div>
        ) : (
          data.map((row, idx) => (
            <div 
              key={String(row[keyField]) || idx} 
              className={cn(
                "rounded-xl border bg-card p-4 active:scale-[0.98] transition-transform",
                onRowClick && "cursor-pointer"
              )}
              onClick={() => onRowClick?.(row)}
            >
              {renderMobileCard(row)}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
