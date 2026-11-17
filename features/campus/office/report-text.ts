// Keep the stored evidence intact; hide only Aside's non-portable citation wrappers.
// This is plain text passed through React, never interpreted as HTML.
export function officeReportText(text: string): string {
  return text.replace(/<citation\s+refs="[a-zA-Z0-9_, -]+">/g, '').replace(/<\/citation>/g, '')
    // Bots answer in Telegram markdown; show the words, not the markup. The stored text is unchanged.
    .replace(/^#{1,6}\s+/gm, '').replace(/\*\*([^*\n]+)\*\*/g, '$1').replace(/__([^_\n]+)__/g, '$1').replace(/`([^`\n]+)`/g, '$1')
    .replace(/^(\s*)[-*]\s+\[ \]\s*/gm, '$1☐ ').replace(/^(\s*)[-*]\s+\[x\]\s*/gim, '$1☑ ').replace(/^(\s*)[-*]\s+/gm, '$1• ').replace(/^>\s?/gm, '');
}
