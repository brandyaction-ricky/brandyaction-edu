import { ConversionReview } from '../../../app/ui/conversion-review';

// Render the real screen. Playwright supplies synthetic transport responses;
// the fixture HTTP server continues to reject every unmocked write.
export function ConversionFixture() {
  return <ConversionReview />;
}
