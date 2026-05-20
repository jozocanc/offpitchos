/**
 * Client-side PDF rendering for the Tactics Board "Import PDF" flow.
 * Renders each page to a PNG data URL + extracts the selectable text layer,
 * then the result is POSTed to the generateDrillFromPdf server action.
 *
 * Runs in the browser only — pdf.js needs canvas + a web worker.
 */
import * as pdfjsLib from 'pdfjs-dist'

// Worker is copied into /public at the pinned pdfjs-dist version.
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

export type ExtractedPage = {
  pageNumber: number
  pngDataUrl: string // "data:image/png;base64,..."
  text: string
}

export class PdfExtractError extends Error {}

export async function extractPdfPages(
  file: File,
  opts: { maxPages?: number; scale?: number } = {},
): Promise<ExtractedPage[]> {
  const maxPages = opts.maxPages ?? 5
  const scale = opts.scale ?? 2

  let doc
  try {
    const buf = await file.arrayBuffer()
    doc = await pdfjsLib.getDocument({ data: buf }).promise
  } catch {
    throw new PdfExtractError("Couldn't open that file — make sure it's a valid PDF.")
  }

  const pages: ExtractedPage[] = []
  const count = Math.min(maxPages, doc.numPages)

  for (let i = 1; i <= count; i++) {
    const page = await doc.getPage(i)
    const viewport = page.getViewport({ scale })

    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')!

    await page.render({
      canvasContext: ctx,
      viewport,
      canvas,
    } as Parameters<typeof page.render>[0]).promise

    const pngDataUrl = canvas.toDataURL('image/png')

    const textContent = await page.getTextContent()
    const text = textContent.items
      .map((it: unknown) => (it as { str?: string }).str ?? '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()

    pages.push({ pageNumber: i, pngDataUrl, text })
  }

  if (pages.length === 0) {
    throw new PdfExtractError('That PDF has no readable pages.')
  }
  return pages
}
