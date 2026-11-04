/** Shared furniture footprints. World x/y are the lower corner; y0 is elevation above the floor. */
const items=[
  // Office: a clear central aisle, planted corners and a compact break counter.
  {id:'office-fern-back',roomId:'office',type:'plant',name:'창가의 고사리',x:23.65,y:10.25,w:.65,d:.65,height:1.35},
  {id:'office-tree-back',roomId:'office',type:'plant',name:'창가 올리브나무',x:29.65,y:10.25,w:.7,d:.7,height:1.7},
  {id:'office-coffee',roomId:'office',type:'coffee',name:'커피 한 잔',x:25.6,y:10.2,w:2.4,d:.75,height:1.25,interactive:'coffee'},
  {id:'office-coffee-books',roomId:'office',type:'books',name:'아이디어 노트',x:27.45,y:10.38,w:.35,d:.3,height:.17,y0:.93,solid:false},
  {id:'office-plant-desk-left',roomId:'office',type:'plant',name:'책상 위 작은 선인장',x:21.98,y:12.48,w:.25,d:.25,height:.32,y0:.88,solid:false},
  {id:'office-plant-desk-right',roomId:'office',type:'plant',name:'책상 위 다육식물',x:31.68,y:20.6,w:.25,d:.25,height:.3,y0:.88,solid:false},
  {id:'office-mission-rug',roomId:'office',type:'rug',name:'미션 테이블 러그',x:24.6,y:14.75,w:4.8,d:4.5,height:.02,solid:false},
  {id:'office-globe',roomId:'office',type:'globe',name:'회전하는 지구본',x:33.25,y:16.4,w:.8,d:.8,height:1.4,interactive:'globe'},
  {id:'office-plant-front-left',roomId:'office',type:'plant',name:'입구의 몬스테라',x:24,y:23.15,w:.7,d:.7,height:1.35},
  {id:'office-plant-front-right',roomId:'office',type:'plant',name:'작은 실내 정원',x:28.35,y:23.4,w:.65,d:.65,height:1.1},
  {id:'office-mini-rocket',roomId:'office',type:'rocket',name:'미니 로켓 발사',x:29.7,y:22.8,w:.7,d:.7,height:1.55,interactive:'rocket'},
  // Study: a lounge along the left edge and curiosity objects around the perimeter.
  {id:'study-lounge-rug',roomId:'study',type:'rug',name:'독서 라운지 러그',x:-5.8,y:9.2,w:4.2,d:4.1,height:.02,solid:false},
  {id:'study-lounge-sofa',roomId:'study',type:'sofa',name:'독서 소파',x:-5.45,y:9.7,w:2.6,d:1.05,height:.9},
  {id:'study-coffee-table',roomId:'study',type:'coffee-table',name:'낮은 라운지 테이블',x:-4.8,y:11.4,w:1.45,d:.8,height:.45},
  {id:'study-lounge-books',roomId:'study',type:'books',name:'잠깐 읽는 우주 책',x:-4.55,y:11.56,w:.45,d:.32,height:.15,y0:.47,solid:false},
  {id:'study-reading-light',roomId:'study',type:'lamp',name:'독서 스탠드',x:-2.15,y:10.05,w:.45,d:.45,height:1.7},
  {id:'study-water-plant',roomId:'study',type:'plant',name:'식물에 물 주기',x:-5.45,y:12.9,w:.7,d:.7,height:1.45,interactive:'water'},
  {id:'study-tree-back-left',roomId:'study',type:'plant',name:'책장 옆 나무',x:-3.2,y:3.6,w:.75,d:.75,height:1.7},
  {id:'study-tree-back-right',roomId:'study',type:'plant',name:'창가의 초록 나무',x:10.35,y:4.35,w:.75,d:.75,height:1.6},
  {id:'study-coffee',roomId:'study',type:'coffee',name:'공부방 티 스테이션',x:5.9,y:1.4,w:2.2,d:.7,height:1.15},
  {id:'study-arcade',roomId:'study',type:'arcade',name:'잠깐 즐기는 우주 게임',x:9.25,y:2.55,w:1.05,d:.9,height:1.55,interactive:'arcade'},
  {id:'study-low-shelf',roomId:'study',type:'shelf',name:'우주 도서 선반',x:.2,y:19.65,w:2.7,d:.5,height:.95},
  {id:'study-telescope',roomId:'study',type:'telescope',name:'테라스에서 달을 보는 망원경',x:5.75,y:23.65,w:1.2,d:1,height:1.65,interactive:'telescope'},
  {id:'study-front-plant-left',roomId:'study',type:'plant',name:'라운지의 잎사귀',x:-2.2,y:18.4,w:.7,d:.7,height:1.3},
  {id:'study-front-plant-right',roomId:'study',type:'plant',name:'책상 옆 몬스테라',x:9,y:18.4,w:.75,d:.75,height:1.45},
  {id:'study-side-plant',roomId:'study',type:'plant',name:'문 옆의 작은 나무',x:11.7,y:8.65,w:.6,d:.6,height:1.2},
  // A walkable open terrace; keep the full indoor/deck threshold clear.
  {id:'study-terrace-sofa',roomId:'study',type:'sofa',name:'테라스 벤치 소파',x:.6,y:23.7,w:2.1,d:.85,height:.78},
  {id:'study-terrace-table',roomId:'study',type:'coffee-table',name:'테라스 티 테이블',x:3.1,y:23.8,w:1,d:.7,height:.45},
  {id:'study-terrace-lamp',roomId:'study',type:'lamp',name:'테라스 바닥 스탠드',x:.35,y:22.15,w:.42,d:.42,height:1.55},
  {id:'study-terrace-plant',roomId:'study',type:'plant',name:'테라스의 작은 나무',x:6.55,y:22.2,w:.65,d:.65,height:1.35},
];
const INTERIOR=Object.freeze(items.map(item=>Object.freeze({y0:0,rotation:0,solid:true,...item})));
export function getCampusInterior(roomId){return INTERIOR.filter(item=>item.roomId===roomId);}
export function getInteriorCollisionRects(roomId){return getCampusInterior(roomId).filter(item=>item.solid&&item.y0===0).map(item=>({id:item.id,minX:item.x,maxX:item.x+item.w,minY:item.y,maxY:item.y+item.d}));}
export function getInteriorInteractionTargets(roomId){return getCampusInterior(roomId).filter(item=>item.interactive).map(item=>({...item,center:{x:item.x+item.w/2,y:item.y+item.d/2}}));}
export const CAMPUS_INTERIOR=INTERIOR;
