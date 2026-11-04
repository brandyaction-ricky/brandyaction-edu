/** A separate public library: moonlit windows, warm shelves and a replay wall. */
export function buildLibrary(office,group,box,sign){
 box(group,-12,-3,-.25,24,26,.25,0x43566a,false);
 box(group,-12,-3,0,24,.3,4.8,0x12283e);
 for(const x of[-12,11.8]){box(group,x,-3,0,.2,26,.45,0x162d43);box(group,x,-3,4.8,.2,26,.14,0x7392ad,false);}
 for(const z of[-2,4,10,16,22])for(const x of[-11.8,11.6])box(group,x,z,.4,.13,.13,4.4,0x7392ad,false);
 for(const x of[-10,-7,-4]){box(group,x,0,0,2.4,.8,3.5,0x9a8064);for(let row=0;row<4;row++){box(group,x,0,.45+row*.75,2.4,.9,.08,0xe2d3b9);for(let b=0;b<7;b++)box(group,x+.18+b*.29,.17,.53+row*.75,.18,.4,.5,[0x345682,0x66828a,0xb6a081,0x6c718c][b%4],false);}}
 sign(group,'문샷 자료실\n배움은 여기서 계속됩니다',0,-2.5,3.4,10,2.1);
 box(group,0,4.5,0,10,.55,5.8,0x122a44);box(group,.2,5.04,.4,9.6,.08,5.2,0x07131f,false);sign(group,'MOONSHOT LIBRARY\n다시보기 대형 스크린',5,5.2,3,9.1,4.5);box(group,.4,5.13,.3,9.2,.08,.08,0x558fff,false,true);
 box(group,-8,7,0,4,1.4,.8,0xb9a388);sign(group,'무료 자료\n오늘 필요한 도구를 꺼내세요',-6,7.7,1.8,4,1.4);
 for(const [x,y]of[[-7,13],[4,13]]){office.place('table',x,y,3,1.5,{group,h:.8});office.place('chairModernCushion',x+1,y+2,.7,.7,{group,h:.9});box(group,x,y,0,3,1.5,.8,0xa78c70);}
 for(const [x,y]of[[-10,19],[10,19],[10,0]])office.place('pottedPlant',x,y,.8,.8,{group,h:1.5});
 box(group,-.08,5,.015,.16,17,.015,0x558fff,false,true);
}
