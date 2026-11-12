import type {Page} from '@playwright/test';

// Wrap the tour's per-frame metrics callback so the tests count completed scene
// draws even when movement is idle. Keep its normal diagnostics running.
export async function observeTourFrames(page:Page, collectTimings=false) {
 await page.route('**/tour/frame-metrics.mjs', route => route.fulfill({
  contentType:'text/javascript',
  body:`import {previewFrameMetrics as original} from './frame-metrics.mjs?original';
   export function previewFrameMetrics(root,renderer,enabled) {
    const record=original(root,renderer,enabled);
    window.__tourDraws=0;
    return (start,end,moving)=>{
     window.__tourDraws++;
     ${collectTimings ? `root.dataset.gpuCalls=String(renderer.info.render.calls);
      (window.__qaCosts ||= []).push(end-start);
      (window.__qaFrames ||= []).push(end);
      if(window.__qaFrames.length>600)window.__qaFrames.shift();` : ''}
     record(start,end,moving);
    };
   }`
 }));
}
