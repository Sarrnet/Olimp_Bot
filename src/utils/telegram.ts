/**
 * Splits a long text into chunks that fit within Telegram's message limit (4096 chars).
 * Tries to split by double newline (paragraphs) or single newline.
 */
export function splitMessage(text: string, limit: number = 4000): string[] {
    if (text.length <= limit) return [text]

    const chunks: string[] = []
    let currentText = text

    while (currentText.length > 0) {
        if (currentText.length <= limit) {
            chunks.push(currentText)
            break
        }

        // Try to find a good split point (paragraph or newline)
        let splitIndex = currentText.lastIndexOf('\n\n', limit)
        if (splitIndex === -1) splitIndex = currentText.lastIndexOf('\n', limit)
        if (splitIndex === -1) splitIndex = currentText.lastIndexOf(' ', limit)
        if (splitIndex === -1) splitIndex = limit

        chunks.push(currentText.slice(0, splitIndex).trim())
        currentText = currentText.slice(splitIndex).trim()
    }

    return chunks
}

/**
 * Safely splits HTML text into chunks, ensuring that tags are closed at chunk boundaries
 * and reopened in the next chunk.
 */
export function splitHtmlMessage(html: string, limit: number): string[] {
  if (html.length <= limit) return [html]

  const chunks: string[] = []
  let remaining = html

  while (remaining.length > 0) {
    if (remaining.length <= limit) {
      chunks.push(remaining)
      break
    }

    let splitIndex = remaining.lastIndexOf('\n\n', limit)
    if (splitIndex === -1) splitIndex = remaining.lastIndexOf('\n', limit)
    if (splitIndex === -1) splitIndex = remaining.lastIndexOf(' ', limit)
    if (splitIndex === -1) splitIndex = limit

    let chunk = remaining.slice(0, splitIndex)
    let nextPart = remaining.slice(splitIndex)

    // Find all open tags in this chunk
    const openTags: string[] = []
    const tagRegex = /<(\/?[a-z1-6-]+)([^>]*)>/gi
    let match
    while ((match = tagRegex.exec(chunk)) !== null) {
      const isClosing = match[1].startsWith('/')
      const tagName = isClosing ? match[1].slice(1) : match[1]

      if (isClosing) {
        // Find last matching open tag and remove it
        const index = openTags.lastIndexOf(tagName)
        if (index !== -1) openTags.splice(index, 1)
      } else {
        openTags.push(tagName)
      }
    }

    // Close tags in reverse order
    const closingTags = openTags.reverse().map(tag => `</${tag}>`).join('')
    // Reopen tags in original order
    const reopeningTags = openTags.reverse().map(tag => `<${tag}>`).join('')

    chunks.push(chunk + closingTags)
    remaining = reopeningTags + nextPart.trim()
  }

  return chunks
}
