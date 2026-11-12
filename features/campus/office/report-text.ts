// Keep the stored evidence intact; hide only Aside's non-portable citation wrappers.
// This is plain text passed through React, never interpreted as HTML.
export function officeReportText(text: string): string {
  return text.replace(/<citation\s+refs="[a-zA-Z0-9_, -]+">/g, '').replace(/<\/citation>/g, '');
}
