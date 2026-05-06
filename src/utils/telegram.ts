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
