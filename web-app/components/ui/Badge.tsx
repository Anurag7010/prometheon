import { getBadgeClasses, documentStatusVariant } from "@/lib/variants";
import type { DocumentStatus } from "@/types";

interface BadgeProps {
  variant?: "success" | "warning" | "error" | "neutral" | "brand";
  children: React.ReactNode;
  className?: string;
}

export function Badge({
  variant = "neutral",
  children,
  className,
}: BadgeProps) {
  return (
    <span className={getBadgeClasses({ variant, className })}>{children}</span>
  );
}

interface DocumentStatusBadgeProps {
  status: DocumentStatus;
  className?: string;
}

// documentStatusVariant is Record<DocumentStatus, BadgeVariant> —
// TypeScript guarantees every DocumentStatus has a mapping.
// If 'archived' is added to DocumentStatus without updating the Record,
// TypeScript errors: "Property 'archived' is missing in type..."
export function DocumentStatusBadge({
  status,
  className,
}: DocumentStatusBadgeProps) {
  return (
    <Badge variant={documentStatusVariant[status]} className={className}>
      {status}
    </Badge>
  );
}
