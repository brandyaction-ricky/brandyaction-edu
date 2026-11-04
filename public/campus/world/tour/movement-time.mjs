/** Keep walking speed stable on slower frames, while collision checks stay small.
 * Long pauses are capped so a resumed tab cannot jump across the room. */
export function advanceMovement(elapsed,move){
 let remaining=Number.isFinite(elapsed)?Math.max(0,Math.min(.25,elapsed)):0;
 while(remaining>1e-8){const step=Math.min(.025,remaining);move(step);remaining-=step;}
}
