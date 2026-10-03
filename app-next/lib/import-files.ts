// Limits for the any-file imports (roster, schedule). Safe for client and server.

// Vercel caps request bodies at ~4.5 MB; the client shrinks photos first.
export const MAX_IMPORT_BYTES = 4 * 1024 * 1024

export const IMPORT_ACCEPT =
  '.pdf,.jpg,.jpeg,.png,.webp,.gif,.csv,.txt,.tsv,.xlsx,.xls,.docx,application/pdf,image/jpeg,image/png,image/webp,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export const IMPORT_TYPES_LABEL = 'PDF, photo or screenshot, Excel, CSV, Word (.docx) or text'

/** Browser only. Phone photos are often 3-8 MB; shrink big images so they fit the upload cap. */
export async function shrinkImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.size <= 1.5 * 1024 * 1024) return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', 0.85))
    if (!blob) return file
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}
