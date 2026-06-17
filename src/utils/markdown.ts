export const markdownToHtml = (text: any): string => {
    if (!text) return ''
    const safeText = typeof text === 'string' ? text : JSON.stringify(text)

    let html = safeText
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')

    html = html.replace(/&lt;(\/?(b|i|code|a|u|s)( [^>]*)?)&gt;/gi, '<$1>')

    // 2. Списки: обрабатываем ДО курсива и жирного шрифта, чтобы избежать конфликтов
    html = html
        .split('\n')
        .map((line) => {
            if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
                return '• ' + line.trim().substring(2)
            }
            return line
        })
        .join('\n')

    // 3. Жирный: **text** or __text__
    html = html.replace(/(\*\*|__)(.*?)\1/g, '<b>$2</b>')

    // 4. Курсив: *text* or _text_
    html = html.replace(/(\*|_)(.*?)\1/g, '<i>$2</i>')

    // 5. Inline code
    html = html.replace(/`(.*?)`/g, '<code>$1</code>')

    // 6. Ссылки
    html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>')

    return html
}
