/** Deterministic walking surface, shared by local and remote avatars. */
export function atriumHeightAt(x,y){
 if(x>=-3.5&&x<=3.5&&y>=4&&y<=18.3)return 4.2*(18.3-y)/14.3;
 if(x>=-6.8&&x<=18&&y>=-1&&y<4)return 4.2;
 return 0;
}
export function canWalkAtrium(from,to){return Math.abs(atriumHeightAt(to.x,to.y)-atriumHeightAt(from.x,from.y))<=.25;}
/** Nearest visible walking surface: ground, stair incline or gallery deck. */
export function intersectAtriumRay(near,far){
 const d={x:far.x-near.x,y:far.y-near.y,z:far.z-near.z},slope=4.2/14.3,candidates=[];
 for(const [den,num]of [[d.y,-near.y],[d.y,4.2-near.y],[d.y+slope*d.z,slope*(18.3-near.z)-near.y]]){
  if(Math.abs(den)<1e-8)continue;const t=num/den;if(t<0||t>1)continue;
  const x=near.x+d.x*t,y=near.z+d.z*t,h=near.y+d.y*t;
  if(Math.abs(atriumHeightAt(x,y)-h)<.03)candidates.push({x,y,t});
 }
 candidates.sort((a,b)=>a.t-b.t);return candidates[0]||null;
}
