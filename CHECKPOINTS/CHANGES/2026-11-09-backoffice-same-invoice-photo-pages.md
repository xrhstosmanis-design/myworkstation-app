# Separate invoice photos from invoice pages

Hosted #3778 showed that the batch upload intentionally queues each JPEG as a separate invoice. Add a dedicated same-invoice photo selector that forwards all selected files to the existing page-aware draft path. Keep the batch control and single-file reader.

Local syntax and dispatch checks passed. Hosted end-to-end reopen remains pending. No incomplete LAB order was created.
