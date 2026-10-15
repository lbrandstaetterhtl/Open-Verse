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
  render?: (row: T, index: number) => ReactNode;
}

interface ResponsiveTableProps<T> {
  columns: Column<T>[];
  data: T[];
  /** Field holding a unique id, or a function returning one for nested rows. */
  keyField: keyof T | ((row: T) => string | number);
  renderMobileCard: (row: T, index: number) => ReactNode;
  className?: string;
  onRowClick?: (row: T) => void;
  isLoading?: boolean;
}

export function ResponsiveTable<T>({ 
  columns, 
  data, 
  keyField, 
  renderMobileCard,
  className,
  onRowClick,
  isLoading,
}: ResponsiveTableProps<T>) {
  const rowKey = (row: T, idx: number) => {
    const value = typeof keyField === "function" ? keyField(row) : row[keyField];
    return value === undefined || value === null ? idx : String(value);
  };
  const emptyText = isLoading ? "Loading..." : "No data available";

  return (
    <div className={cn("w-full", className)}>
      {/* Desktop Table View */}
      <div className="hidden md:block ov-panel">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {columns.map(col => (
                  <th
                    key={col.key}
                    className="ov-label text-left px-4 py-3.5"
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {data.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-12 text-center text-muted-foreground">
                    {emptyText}
                  </td>
                </tr>
              ) : (
                data.map((row, idx) => (
                  <tr 
                    key={rowKey(row, idx)}
                    className={cn(
                      "hover:bg-muted/30 transition-colors",
                      onRowClick && "cursor-pointer"
                    )}
                    onClick={(e) => {
                      const target = e.target as HTMLElement;
                      // Ignore row click if clicking a button, link, or any interactive element
                      if (target.closest('button') || target.closest('a') || target.closest('[role="button"]')) {
                        return;
                      }
                      onRowClick?.(row);
                    }}
                  >
                    {columns.map(col => (
                      <td key={col.key} className="px-4 py-3 text-sm">
                        {col.render ? col.render(row, idx) : String(row[col.key as keyof T] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden flex flex-col gap-3">
        {data.length === 0 ? (
          <div className="ov-panel p-8 text-center text-muted-foreground">
            {emptyText}
          </div>
        ) : (
          data.map((row, idx) => (
            <div
              key={rowKey(row, idx)}
              className={cn(
                "ov-panel p-4",
                onRowClick && "ov-panel-hover cursor-pointer"
              )}
              onClick={(e) => {
                const target = e.target as HTMLElement;
                if (target.closest('button') || target.closest('a') || target.closest('[role="button"]')) {
                  return;
                }
                onRowClick?.(row);
              }}
            >
              {renderMobileCard(row, idx)}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
