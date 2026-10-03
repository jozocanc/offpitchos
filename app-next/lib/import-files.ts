// Limits for the any-file imports (roster, schedule). Safe for client and server.

// Vercel caps request bodies at ~4.5 MB; the client shrinks photos first.
export const MAX_IMPORT_BYTES = 4 * 1024 * 1024

export const IMPORT_ACCEPT =
  '.pdf,.jpg,.jpeg,.png,.webp,.gif,.csv,.txt,.tsv,.xlsx,.xls,.docx,application/pdf,image/jpeg,image/png,image/webp,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export const IMPORT_TYPES_LABEL = 'PDF, photo or screenshot, Excel, CSV, Word (.docx) or text'
