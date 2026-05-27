export type MediaPreviewFileKind = 'pdf' | 'docx' | 'excel'

const FILE_PREVIEW_KIND_BY_EXT: Record<string, MediaPreviewFileKind> = {
  '.pdf': 'pdf',
  '.doc': 'docx',
  '.docx': 'docx',
  '.xls': 'excel',
  '.xlsx': 'excel',
}

export function getFileExtension(input = ''): string {
  if (!input || typeof input !== 'string') return ''
  const normalized = input.split('?')[0]?.split('#')[0] || ''
  const fileName = normalized.split(/[\\/]/).pop() || ''
  const dotIndex = fileName.lastIndexOf('.')
  if (dotIndex < 0) return ''
  return fileName.slice(dotIndex).toLowerCase()
}

export function resolveMediaPreviewFileKind(input: {
  fileName?: string
  fileUrl?: string
  localPath?: string
}): MediaPreviewFileKind | null {
  const candidates = [input.fileName, input.fileUrl, input.localPath]
  for (const candidate of candidates) {
    const ext = getFileExtension(String(candidate || ''))
    const kind = FILE_PREVIEW_KIND_BY_EXT[ext]
    if (kind) return kind
  }
  return null
}
