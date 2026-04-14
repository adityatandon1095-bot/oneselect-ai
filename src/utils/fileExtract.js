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
 */
export async function extractContent(file) {
  const ext = fileExt(file)

  if (ext === 'txt') {
    return { kind: 'text', text: await file.text() }
  }

  if (ext === 'pdf') {
    return { kind: 'text', text: await extractPdf(file) }
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
    // Items can be TextItem (has .str) or TextMarkedContent (no .str)
    const text = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
    if (text) pages.push(text)
  }

  return pages.join('\n\n')
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
