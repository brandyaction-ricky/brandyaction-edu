/** Local preview diagnostics only; no logging, network or visible product UI. */
export function previewFrameMetrics(root,renderer,enabled){
 if(!enabled)return()=>{};
 const gl=renderer.getContext(),extension=gl.getExtension('WEBGL_debug_renderer_info');
 root.dataset.gpuRenderer=extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):'unavailable';
 let samples=[],lastReport=0;
 return(start,end,moving)=>{
  if(!moving){samples=[];return;}
  if(samples.length&&start-samples.at(-1).start>500)samples=[];
  samples.push({start,cost:end-start});if(samples.length>120)samples.shift();
  if(samples.length<10||start-samples[0].start<1000||start-lastReport<1000)return;
  lastReport=start;const costs=samples.map(p=>p.cost).sort((a,b)=>a-b);
  root.dataset.renderMetrics=JSON.stringify({fps:Number(((samples.length-1)*1000/(start-samples[0].start)).toFixed(1)),cpuP95Ms:Number(costs[Math.floor(costs.length*.95)].toFixed(2)),drawCalls:renderer.info.render.calls,pixelRatio:renderer.getPixelRatio()});
 };
}
