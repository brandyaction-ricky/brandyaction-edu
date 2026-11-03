import {getCampusRoom, pointInPolygon} from './vendor/campus-plan.js';

const room = getCampusRoom('study');
const bounds = room.bounds;
const finite = Number.isFinite;
// EDU's existing wire coordinates remain 0..24 / 0..22. Renderer coordinates
// never widen the server contract, and private-office movement is not shared.
export function toWire(point) {
  if (!point || !finite(point.x) || !finite(point.y) || !pointInPolygon(point, room.outline)) return null;
  return {x: (point.x-bounds.minX)/(bounds.maxX-bounds.minX)*24,
    y: (point.y-bounds.minY)/(bounds.maxY-bounds.minY)*22,
    sitting: point.studyPose === 'sit', wave: point.studyPose === 'wave'};
}
export function fromWire(point) {
  if (!point || !finite(point.x) || !finite(point.y) || point.x<0 || point.x>24 || point.y<0 || point.y>22) return null;
  const value = {x: bounds.minX+point.x/24*(bounds.maxX-bounds.minX), y: bounds.minY+point.y/22*(bounds.maxY-bounds.minY)};
  return pointInPolygon(value, room.outline) ? value : null;
}
export const COMMANDS = new Set(['init','profile','progress','peers','camera','zone','seat','stand','wave','controls','speech','focus-status','desk-seat','presentation','exhibition','launch','cohort-launch']);
export function acceptsHost(event, origin, parent, token) {
  const value=event.data;
  return token.length>=32 && event.origin===origin && event.source===parent && !!value && value.source==='moonshot-host' && value.token===token && COMMANDS.has(value.type);
}
export function visiblePeers(items) {
  const seen=new Set();
  return (Array.isArray(items)?items:[]).flatMap(item=>{
    if (!item || typeof item.id!=='string' || seen.has(item.id) || seen.size>=24) return [];
    const position=fromWire(item);if(!position)return [];
    seen.add(item.id);
    return [{id:item.id.slice(0,80),name:String(item.name||'문샷 동료').slice(0,24),...position,
      gender:item.gender==='female'?'female':'male',coat:/^#[0-9a-f]{6}$/i.test(item.coat)?item.coat:'#527086',
      pose:item.sitting?'sit':item.wave?'wave':'stand',moving:false}];
  });
}
