import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import mammoth from 'mammoth'

// Wire up the PDF.js worker (Vite serves the .mjs as a static asset URL)
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl

export const SUPPORTED_EXTS = ['txt', 'pdf', 'docx', 'jpg', 'jpeg', 'png']
export const ACCEPT_ATTR     = '.txt,.pdf,.docx,.jpg,.jpeg,.png'

export function fileExt(file) {
  return file.name.split('.').pop().toLowerCase()
}

export function isSupported(file) {
  return SUPPORTED_EXTS.includes(fileExt(file))
}

/**
 * Extracts content from a File object.
 * Returns { kind: 'text', text: string }
 *      or { kind: 'image', base64: string, mediaType: 'image/jpeg'|'image/png' }
 *      or { kind: 'images', pages: Array<{ base64, mediaType }> }  (scanned PDF)
 */
export async function extractContent(file) {
  const ext = fileExt(file)

  if (ext === 'txt') {
    return { kind: 'text', text: await file.text() }
  }

  if (ext === 'pdf') {
    return await extractPdf(file)
  }

  if (ext === 'docx') {
    return { kind: 'text', text: await extractDocx(file) }
  }

  if (ext === 'jpg' || ext === 'jpeg' || ext === 'png') {
    const base64    = await toBase64(file)
    const mediaType = ext === 'png' ? 'image/png' : 'image/jpeg'
    return { kind: 'image', base64, mediaType }
  }

  throw new Error(`Unsupported file type: .${ext}`)
}

// ── Private helpers ────────────────────────────────────────

async function extractPdf(file) {
  const buf = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise
  const pages = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page    = await pdf.getPage(i)
    const content = await page.getTextContent()
    const text = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
    if (text) pages.push(text)
  }

  const fullText = pages.join('\n\n')

  // Scanned (image-only) PDF: too little text extracted — render pages as images for vision parsing
  if (fullText.trim().length < 150 && pdf.numPages > 0) {
    const imagePages = await renderPdfPages(pdf)
    if (!imagePages.length) throw new Error('No content could be extracted from this PDF')
    return { kind: 'images', pages: imagePages }
  }

  return { kind: 'text', text: fullText }
}

async function renderPdfPages(pdf) {
  const result = []
  const maxPages = Math.min(pdf.numPages, 4)
  for (let i = 1; i <= maxPages; i++) {
    const page     = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: 1.8 })
    const canvas   = document.createElement('canvas')
    canvas.width   = viewport.width
    canvas.height  = viewport.height
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
    const base64 = canvas.toDataURL('image/jpeg', 0.82).split(',')[1]
    result.push({ base64, mediaType: 'image/jpeg' })
  }
  return result
}

async function extractDocx(file) {
  const buf    = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer: buf })
  return result.value
}

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader    = new FileReader()
    reader.onload   = () => resolve(reader.result.split(',')[1]) // strip "data:...;base64,"
    reader.onerror  = reject
    reader.readAsDataURL(file)
  })
}
