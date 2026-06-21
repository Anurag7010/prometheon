"use client";

import { useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { FileUpload } from "@/components/ui/FileUpload";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { useUpload } from "@/hooks/useUpload";
import { useAbortController } from "@/hooks/useAbortController";
import { useToastContext } from "@/hooks/useToast";

interface DocumentUploadModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function DocumentUploadModal({
  open,
  onClose,
  onSuccess,
}: DocumentUploadModalProps) {
  const { state, upload, reset } = useUpload();
  const abortCtrl = useAbortController();
  const { toast } = useToastContext();

  // Close modal and show success toast after successful upload
  useEffect(() => {
    if (state.status !== "success") return;

    toast.success("Document uploaded", "Your document is being ingested.");

    const timer = setTimeout(() => {
      onSuccess?.();
      onClose();
      reset();
    }, 1500);

    return () => clearTimeout(timer);
  }, [state.status]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleFile(file: File) {
    abortCtrl.reset();
    upload(file, abortCtrl.signal);
  }

  function handleCancel() {
    abortCtrl.abort();
    reset();
    onClose();
  }

  function handleClose() {
    // Do not allow closing during active upload — use Cancel instead
    if (state.status === "uploading" || state.status === "processing") return;
    reset();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Upload Document"
      description="Upload a PDF to ingest it into your knowledge base."
      size="md"
      // Prevent accidental close during upload
      closeOnBackdrop={
        state.status !== "uploading" && state.status !== "processing"
      }
    >
      <div className="space-y-4">
        {/* File upload zone */}
        <FileUpload
          onFile={handleFile}
          state={state}
          accept="application/pdf"
        />

        {/* Success message */}
        {state.status === "success" && (
          <Alert variant="success" title="Upload complete">
            Your document has been ingested and is ready to query.
          </Alert>
        )}

        {/* Error message with retry */}
        {state.status === "error" && (
          <Alert variant="error" title="Upload failed">
            {state.error}
          </Alert>
        )}

        {/* Footer actions */}
        <div className="flex justify-end gap-3 pt-2">
          <Button
            variant="secondary"
            onClick={handleCancel}
            disabled={state.status === "success"}
          >
            {state.status === "uploading" || state.status === "processing"
              ? "Cancel upload"
              : "Cancel"}
          </Button>

          {state.status === "error" && (
            <Button variant="primary" onClick={() => reset()}>
              Try again
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
