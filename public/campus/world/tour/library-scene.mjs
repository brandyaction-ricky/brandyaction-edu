/** A separate public library: moonlit windows, warm shelves and a replay wall. */
export function buildLibrary(office,group,box,sign,lunarCampus=false){
 box(group,-12,-3,-.25,24,26,.25,lunarCampus?0xcbbca6:0x4b6074,false);
 box(group,-12,-3,0,24,.3,4.8,0x12283e);
 for(const x of[-12,11.8]){box(group,x,-3,0,.2,26,.45,lunarCampus?0xaf8860:0x162d43);box(group,x,-3,4.8,.2,26,.14,0x7392ad,false);}
 for(const z of[-2,4,10,16,22])for(const x of[-11.8,11.6])box(group,x,z,.4,.13,.13,4.4,0x7392ad,false);
 for(const x of[-10,-7,-4]){box(group,x,0,0,2.4,.8,3.5,0x9a8064);for(let row=0;row<4;row++){box(group,x,0,.45+row*.75,2.4,.9,.08,0xe2d3b9);for(let b=0;b<7;b++)box(group,x+.18+b*.29,.81,.53+row*.75,.18,.4,.5,[0x345682,0x66828a,0xb6a081,0x6c718c][b%4],false);}}
 sign(group,'',-6,-2.5,4.7,10,1.6,{title:'문샷 자료실',subtitle:'배움은 여기서 계속됩니다'});
 box(group,0,4.5,0,10,.55,5.8,0x122a44);box(group,.2,5.04,.4,9.6,.08,5.2,0x07131f,false);sign(group,'',5,5.2,3,9.1,4.5,{eyebrow:'WATCH & LEARN',title:'다시보기',subtitle:'영상 선택 후 이 스크린에서 재생해요',play:true});box(group,.4,5.13,.3,9.2,.08,.08,0x558fff,false,true);
 box(group,-8,7,0,4,1.4,.8,0xb9a388);sign(group,'',-6,7.7,1.8,4,1.7,{eyebrow:'FREE RESOURCES',title:'무료 자료',subtitle:'필요한 파일을 골라 다운로드'});
 for(const [x,y]of[[-7,13],[4,13]]){office.place('table',x,y,3,1.5,{group,h:.8});office.place('chairModernCushion',x+1,y+2,.7,.7,{group,h:.9});box(group,x,y,.75,3,1.5,.1,0xa78c70);for(const dx of[.15,2.7])box(group,x+dx,y+.15,0,.12,1.2,.75,0x273f54);box(group,x-.5,y-.5,.01,4,4,.01,lunarCampus?0x8b8172:0x33495d,false);}
 if(lunarCampus){
  for(const x of [-11.65,10.10])for(const y of [3.5,10.5]){
   box(group,x,y,0,1.55,.63,2.14,0x996f4f);
   for(let row=0;row<3;row++){
    const height=.22+row*.62;
    box(group,x,y,height,1.55,.74,.06,0xd4aa7b,false);
    for(let j=0;j<5;j++)box(group,x+.11+j*.27,y+.55,height+.06,.17,.15,.35+.05*(j%3),[0x40586b,0xb89677,0x9b6c58][(row+j)%3],false);
   }
  }
 }
 for(const [x,y]of[[-10,19],[10,19],[10,0]])office.place('pottedPlant',x,y,.8,.8,{group,h:1.5});
 box(group,-.08,5,.015,.16,17,.015,0x558fff,false,true);
}
