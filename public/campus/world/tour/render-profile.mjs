/** Keep original models/materials; only expensive live shadows and pixel density adapt. */
export function renderProfile({coarse=false,width=1440,height=1000,ratio=1,renderer=''}){
 const software=/SwiftShader|llvmpipe|software/i.test(renderer),touch=coarse||width<=600;
 const softwareRatio=Math.min(1,Math.sqrt(200000/(Math.max(1,width)*Math.max(1,height))));
 return {name:software?'compatibility':touch?'touch':'desktop',shadows:!software&&!touch,pixelRatio:Math.min(software?softwareRatio:touch?1.25:1.5,Math.max(1,ratio||1))};
}
export function applyRenderProfile(renderer,root){
 const gl=renderer.getContext(),extension=gl.getExtension('WEBGL_debug_renderer_info');
 const name=extension?String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)):String(gl.getParameter(gl.RENDERER));
 const profile=renderProfile({coarse:matchMedia('(pointer:coarse)').matches,width:innerWidth,height:innerHeight,ratio:devicePixelRatio,renderer:name});
 renderer.setPixelRatio(profile.pixelRatio);renderer.shadowMap.enabled=profile.shadows;root.dataset.renderProfile=profile.name;
 return profile;
}
