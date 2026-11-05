// Used only by build-event-preview.mjs: a simulated upload never leaves the browser.
export const createClient=()=>({storage:{from:()=>({uploadToSignedUrl:async()=>({error:null})})}});
