// Keep the real geometry, surface colours and textures for the first desk view.
// Vertex lighting avoids compiling the detailed room's PBR shaders on the first draw.
export function useDeskPreviewMaterials(group, BasicMaterial) {
 const originals = new Map();
 const previews = new Map();
 function preview(source) {
  if (!source?.isMeshStandardMaterial) return source;
  if (previews.has(source)) return previews.get(source);
  const material = new BasicMaterial({
   color: source.color, map: source.map, side: source.side, vertexColors: source.vertexColors,
   transparent: source.transparent, opacity: source.opacity, depthWrite: source.depthWrite,
   alphaTest: source.alphaTest
  });
  material.onBeforeCompile = shader => {
   shader.vertexShader = 'varying float deskLight;\n' + shader.vertexShader.replace('#include <begin_vertex>',
    '#include <begin_vertex>\n deskLight = 0.67 + 0.33 * max(dot(normalize(normalMatrix * normal), normalize(vec3(-0.4,0.7,0.6))),0.0);');
   shader.fragmentShader = 'varying float deskLight;\n' + shader.fragmentShader.replace('#include <color_fragment>',
    '#include <color_fragment>\n diffuseColor.rgb *= deskLight;');
  };
  previews.set(source, material);
  return material;
 }
 group.traverse(mesh => {
  if (!mesh.isMesh || !mesh.material) return;
  originals.set(mesh, mesh.material);
  mesh.material = Array.isArray(mesh.material) ? mesh.material.map(preview) : preview(mesh.material);
 });
 return () => {
  for (const [mesh, source] of originals) mesh.material = source;
  for (const material of previews.values()) material.dispose();
 };
}
