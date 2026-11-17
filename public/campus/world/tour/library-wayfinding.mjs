// Floor-level wayfinding follows the open aisle, clear of the tower and displays.
export const libraryPortal={x:-11.5,y:20.5,w:3,d:2,height:2.6};
export const libraryTrail=Array.from({length:6},(_,i)=>({x:-.8-i*1.65,y:27-i*.94}));
export function buildLibraryTrail(a){
 const vertices=[],indices=[],angle=Math.atan2(-.94,-1.65),c=Math.cos(angle),s=Math.sin(angle);
 for(const {x,y}of libraryTrail){
  // Two solid chevron arms, combined into one mesh with no animation or shadows.
  for(const side of [-1,1]){
   const n=vertices.length/3;
   for(const [u,v]of [[.52,0],[-.18,side*.5],[-.39,side*.31],[.16,0]])vertices.push(x+u*c-v*s,.035,y+u*s+v*c);
   indices.push(n,n+1,n+2,n,n+2,n+3);
  }
 }
 const mesh=a.raw(vertices,indices,0x225cdd,'glow');mesh.name='library-floor-arrows';mesh.castShadow=false;mesh.receiveShadow=false;
 a.label('문샷 자료실',-10,20.2,2.2,4.6,.6);
 a.label('무료 자료 · 다시보기',-10,20.21,1.48,4.6,.36,{color:'#b7d6ff'});
 a.rounded(-12.6,20,.2,5.2,.12,2.6,.15,0x102c48);
 return mesh;
}
