let sensitiveWords: string[] = []

export function setSensitiveWords(words: string[]) {
  sensitiveWords = words
}

export function filterSensitiveWords(text: string): string {
  if (sensitiveWords.length === 0) return text
  let result = text
  for (const word of sensitiveWords) {
    if (!word) continue
    const replacement = '*'.repeat(word.length)
    result = result.replaceAll(word, replacement)
  }
  return result
}

export function hasSensitiveWord(text: string): boolean {
  return sensitiveWords.some(w => w && text.includes(w))
}
