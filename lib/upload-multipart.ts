type UploadMultipartMode = 'chunked' | 'fixed'

declare const FixedLengthStream: undefined | (new (length: number) => {
  readable: ReadableStream<Uint8Array>
  writable: WritableStream<Uint8Array>
})

export function createUploadMultipart(
  file: ReadableStream<Uint8Array>,
  { fileName, fileType, folder, size }: {
    fileName: string
    fileType: string
    folder: string
    size: number
  },
) {
  if (!Number.isSafeInteger(size) || size < 0) throw new RangeError('Invalid declared file size.')
  const boundary = `----CraneMail-${crypto.randomUUID()}`
  const encoder = new TextEncoder()
  const dispositionName = fileName
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A')
    .replaceAll('"', '%22')
  const head = encoder.encode(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${dispositionName}"\r\n` +
    `Content-Type: ${fileType}\r\n\r\n`,
  )
  const tail = encoder.encode(
    `\r\n--${boundary}\r\nContent-Disposition: form-data; name="folder"\r\n\r\n` +
    `${folder}\r\n--${boundary}--\r\n`,
  )
  const contentLength = head.byteLength + size + tail.byteLength
  if (!Number.isSafeInteger(contentLength)) throw new RangeError('Invalid multipart request size.')
  const reader = file.getReader()
  let remaining = size
  let canceled = false

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(head)
    },
    async pull(controller) {
      try {
        const { value, done } = await reader.read()
        if (canceled) return
        if (done) {
          if (remaining !== 0) throw new Error('The upload ended before its declared file size.')
          controller.enqueue(tail)
          controller.close()
          reader.releaseLock()
          return
        }

        if (value.byteLength > remaining) throw new Error('The upload exceeded its declared file size.')
        remaining -= value.byteLength
        controller.enqueue(value)
      } catch (error) {
        if (canceled) return
        controller.error(error)
        await reader.cancel(error).catch(() => {})
        reader.releaseLock()
      }
    },
    async cancel(reason) {
      canceled = true
      try {
        await reader.cancel(reason)
      } finally {
        reader.releaseLock()
      }
    },
  })

  return {
    body,
    contentType: `multipart/form-data; boundary=${boundary}`,
    contentLength,
  }
}

export function createUploadMultipartRequest(
  file: ReadableStream<Uint8Array>,
  metadata: Parameters<typeof createUploadMultipart>[1],
  mode: UploadMultipartMode,
  signal: AbortSignal,
) {
  if (mode === 'fixed' && typeof FixedLengthStream === 'undefined') {
    throw new Error('Fixed-length multipart uploads require the Workers runtime.')
  }
  const multipart = createUploadMultipart(file, metadata)
  const headers = { 'Content-Type': multipart.contentType }
  const duplex = 'half' as const
  if (mode === 'fixed' && typeof FixedLengthStream !== 'undefined') {
    const fixed = new FixedLengthStream(multipart.contentLength)
    void multipart.body.pipeTo(fixed.writable, { signal }).catch(() => {})
    return { body: fixed.readable, headers, duplex, signal }
  }
  return { body: multipart.body, headers, duplex, signal }
}
