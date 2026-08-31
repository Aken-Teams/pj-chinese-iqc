/**
 * Hand a blob to the browser as a file download.
 *
 * The obvious version of this — create an object URL, click a detached anchor,
 * revoke the URL — saves empty files. `revokeObjectURL` runs synchronously
 * after `click()`, before the browser has finished reading the blob, so the
 * download ends up pointing at a URL that no longer resolves. Firefox
 * additionally ignores a click on an anchor that is not in the document.
 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName || 'download'
  anchor.rel = 'noopener'
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  // Long enough for even a slow disk write to finish; the URL is released when
  // the tab closes regardless.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
