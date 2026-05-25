export const markdownToHtml = (text: any): string => {
    if (!text) return ''

    // Safety check: ensure we are working with a string
    const safeText = typeof text === 'string' ? text : JSON.stringify(text)

    let html = safeText
        // 1. Escape HTML special characters
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')

    // 1.1 Unescape specifically allowed tags (b, i, code, a, u, s)
    html = html.replace(/&lt;(\/?(b|i|code|a|u|s)( [^>]*)?)&gt;/gi, '<$1>')

    // 2. Bold: **text** or __text__
    html = html.replace(/(\*\*|__)(.*?)\1/g, '<b>$2</b>')

    // 3. Italic: *text* or _text_
    // Note: Careful with underscores in URLs, but here we assume simple markdown
    html = html.replace(/(\*|_)(.*?)\1/g, '<i>$2</i>')

    // 4. Inline code: `text`
    html = html.replace(/`(.*?)`/g, '<code>$1</code>')

    // 5. Links: [text](url)
    html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>')

    // 6. Lists: Start of line with - or *
    html = html
        .split('\n')
        .map((line) => {
            if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
                return '• ' + line.trim().substring(2)
            }
            return line
        })
        .join('\n')

    return html
}
