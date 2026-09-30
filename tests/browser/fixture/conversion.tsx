import { ConversionReview } from '../../../app/ui/conversion-review';

// Render the real screen. Playwright supplies synthetic transport responses;
// the fixture HTTP server continues to reject every unmocked write.
export function ConversionFixture() {
  const search = new URLSearchParams(location.search);
  return <ConversionReview workspace={search.has('workspace')} initialView={search.get('view') === 'inquiries' ? 'inquiries' : 'recruitment'} userId="fixture-user" />;
}
