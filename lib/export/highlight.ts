/**
 * Minimal JSON syntax colouring for the export preview.
 *
 * Returns HTML, so escaping is not optional: class names, enum options and text
 * attribute values are all user-authored and end up in this document. Anything
 * that could open a tag is neutralised BEFORE tokens are wrapped, so no input
 * can survive as markup.
 *
 * Quotes are deliberately left alone. The result is inserted as element content,
 * never into an attribute, where a quote carries no meaning.
 */
export function highlightJson(json: string): string {
  const escaped = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  return escaped.replace(
    /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (match, str: string, colon: string, literal: string, num: string) => {
      if (str !== undefined) {
        return colon
          ? `<span class="jk">${str}</span>${colon}`
          : `<span class="js">${str}</span>`
      }
      if (literal !== undefined) return `<span class="jl">${literal}</span>`
      if (num !== undefined) return `<span class="jn">${num}</span>`
      return match
    },
  )
}
