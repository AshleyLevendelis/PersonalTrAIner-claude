// A PHOTO FOR THE COACH, MADE SMALL ON THE PHONE (17 Nov 2026, his "Read it, then discard"). The picture is shrunk to
// at most 1024px on its longest side and sent once as a JPEG; it is never uploaded anywhere else or kept.
const PHOTO_MAX_SIDE = 1024
export const PHOTO_DEFAULT_ASK = "What's in this photo?"
/** The text of his message as it is kept in the chat: the photo itself never is, so the line says one was sent. */
export function photoMessageText(text: string): string {
  return `[Photo] ${text.trim() || PHOTO_DEFAULT_ASK}`
}
export function scaledSize(w: number, h: number, max = PHOTO_MAX_SIDE): { w: number; h: number } {
  const k = Math.min(1, max / Math.max(w, h))
  return { w: Math.round(w * k), h: Math.round(h * k) }
}
export async function preparePhoto(file: File): Promise<{ mime: 'image/jpeg'; data: string } | null> {
  try {
    const bitmap = await createImageBitmap(file)
    const { w, h } = scaledSize(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, w, h)
    const url = canvas.toDataURL('image/jpeg', 0.8)
    const data = url.split(',')[1] ?? ''
    return data ? { mime: 'image/jpeg', data } : null
  } catch {
    return null
  }
}
