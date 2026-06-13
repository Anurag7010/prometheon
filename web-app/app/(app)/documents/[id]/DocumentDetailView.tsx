"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { DocumentStatusBadge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { Table } from "@/components/ui/Table";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import type { Document, Query } from "@/types";

interface DocumentDetailViewProps {
  document: Document;
  initialQueries: Query[];
}

export function DocumentDetailView({
  document,
  initialQueries,
}: DocumentDetailViewProps) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleteLoading(true);
    setDeleteError(null);

    try {
      const res = await fetch(`/api/documents/${document.id}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error(`Delete failed with status ${res.status}`);

      // Use router.push not router.back() — back() goes to wherever the user came from,
      // which might not be /documents (could be search results, external link, etc.)
      // push('/documents') guarantees we land on a known valid page.
      router.push("/documents");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed");
      setDeleteLoading(false);
    }
  }

  // Table column definitions — typed to Query
  const queryColumns = [
    {
      key: "queryText" as keyof Query,
      header: "Query",
      render: (q: Query) => (
        <p className="text-sm text-foreground line-clamp-2 max-w-xs">
          {q.queryText}
        </p>
      ),
    },
    {
      key: "answerText" as keyof Query,
      header: "Answer",
      render: (q: Query) => (
        <p className="text-sm text-muted-foreground">
          {q.answerText ? (
            q.answerText.slice(0, 100) +
            (q.answerText.length > 100 ? "..." : "")
          ) : (
            <span className="italic text-muted-foreground/60">
              No answer yet
            </span>
          )}
        </p>
      ),
    },
    {
      key: "createdAt" as keyof Query,
      header: "Date",
      render: (q: Query) => <RelativeTime date={q.createdAt} />,
      width: "140px",
    },
  ];

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      {/* Page header */}
      <div className="space-y-4">
        {/* Back navigation */}
        <Link
          href="/documents"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="h-4 w-4"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
            />
          </svg>
          Documents
        </Link>

        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-display-sm text-foreground font-bold leading-tight">
              {document.filename}
            </h1>
            <div className="flex items-center gap-3">
              <DocumentStatusBadge status={document.status} />
              <span className="text-xs text-muted-foreground">
                Uploaded <RelativeTime date={document.createdAt} />
              </span>
            </div>
          </div>

          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDeleteOpen(true)}
          >
            Delete
          </Button>
        </div>
      </div>

      {/* Failed ingestion alert */}
      {document.status === "failed" && (
        <Alert variant="error" title="Ingestion failed">
          This document failed to ingest. Try uploading it again or contact
          support.
        </Alert>
      )}

      {/* Document info card */}
      <Card>
        <Card.Header>
          <Card.Title>Document Details</Card.Title>
        </Card.Header>
        <Card.Content>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
            {[
              {
                label: "Status",
                value: <DocumentStatusBadge status={document.status} />,
              },
              { label: "Chunks", value: document.chunkCount ?? "—" },
              {
                label: "Created",
                value: <RelativeTime date={document.createdAt} />,
              },
              {
                label: "Last updated",
                value: <RelativeTime date={document.updatedAt} />,
              },
            ].map(({ label, value }) => (
              <div key={label}>
                <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {label}
                </dt>
                <dd className="mt-1 text-sm text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
        </Card.Content>
      </Card>

      {/* Query history section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            Query History
          </h2>
          <Link href={`/chat?documentId=${document.id}`}>
            <Button size="sm" variant="primary">
              Ask about this document
            </Button>
          </Link>
        </div>

        {initialQueries.length === 0 ? (
          <EmptyState
            title="No queries yet"
            description="Start asking questions about this document."
            action={{
              label: "Ask a question",
              onClick: () => router.push(`/chat?documentId=${document.id}`),
            }}
          />
        ) : (
          <Table
            columns={queryColumns}
            data={initialQueries}
            keyExtractor={(q) => String(q.id)}
          />
        )}
      </div>

      {/* Delete confirmation modal */}
      <ConfirmModal
        open={deleteOpen}
        onClose={() => {
          if (!deleteLoading) {
            setDeleteOpen(false);
            setDeleteError(null);
          }
        }}
        onConfirm={handleDelete}
        title="Delete Document"
        description="This will permanently delete the document and all associated queries. This cannot be undone."
        confirmLabel="Delete"
        confirmVariant="destructive"
        loading={deleteLoading}
      />

      {/* Delete error shown as Alert outside modal (modal may have closed) */}
      {deleteError && (
        <Alert
          variant="error"
          dismissible
          onDismiss={() => setDeleteError(null)}
        >
          {deleteError}
        </Alert>
      )}
    </div>
  );
}
