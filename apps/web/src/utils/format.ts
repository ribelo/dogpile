export const capitalizeWords = (text: string): string => {
  if (!text) return ""

  return text
    .trim()
    .split(/([\s\-'’]+)/)
    .map(word => {
      if (word.match(/^[\s\-'’]+$/)) return word
      if (word.length === 0) return word

      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join("")
}
