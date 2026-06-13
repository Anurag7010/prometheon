import { cn } from "@/lib/cn";
import { EmptyState } from "./EmptyState";

interface Column<T> {
  key: keyof T | string;
  header: string;
  render?: (row: T) => React.ReactNode;
  width?: string;
  align?: "left" | "center" | "right";
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T) => string;
  loading?: boolean;
  emptyState?: React.ReactNode;
  className?: string;
}

const alignClass = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

export function Table<T>({
  columns,
  data,
  keyExtractor,
  loading = false,
  emptyState,
  className,
}: TableProps<T>) {
  return (
    <div
      className={cn(
        "w-full overflow-x-auto rounded-lg border border-border",
        className,
      )}
    >
      <table className="w-full text-sm">
        <thead>
          <tr className="sticky top-0 z-sticky bg-card border-b border-border">
            {columns.map((col) => (
              <th
                key={String(col.key)}
                style={col.width ? { width: col.width } : undefined}
                className={cn(
                  "px-4 py-3 font-medium text-muted-foreground",
                  alignClass[col.align ?? "left"],
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {loading ? (
            // 5 skeleton rows — one per expected data row
            Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="border-b border-border last:border-0">
                {columns.map((col) => (
                  <td key={String(col.key)} className="px-4 py-3">
                    <div className="h-4 rounded bg-muted animate-pulse" />
                  </td>
                ))}
              </tr>
            ))
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={columns.length}>
                {emptyState ?? (
                  <EmptyState
                    title="No data"
                    description="Nothing to display here yet."
                  />
                )}
              </td>
            </tr>
          ) : (
            data.map((row) => (
              <tr
                key={keyExtractor(row)}
                className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors"
              >
                {columns.map((col) => (
                  <td
                    key={String(col.key)}
                    className={cn(
                      "px-4 py-3 text-foreground",
                      alignClass[col.align ?? "left"],
                    )}
                  >
                    {col.render
                      ? col.render(row)
                      : // Fallback: render the field as a string
                        // render() is needed when the value is not a primitive
                        // (Date, nested object, React element)
                        String(
                          (row as Record<string, unknown>)[col.key as string] ??
                            "",
                        )}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
