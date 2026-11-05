// Fictional display names for explicitly disclosed ambient characters.
// Stable per character; never copy live participant names or change them per frame.
const names=[
 '퇴근후산책','mango27','커피한잔_','초록노트','느린오후','Juni_8',
 '오늘도한걸음','고양이집사','blue_mood','소소한기록','별보는밤','노트북앞에서',
 '라떼두잔','morning_42','주말엔독서','달빛우체통','여행가는중','토리',
 '하루의메모','peach_day','동네책방','꾸준하게_','오후세시','우주먼지7',
 '작은호기심','cozy_19','산책메이트','내일의나','동그라미','루틴만들기',
 '봄날의커피','mint_33','조용한도전','반달곰','천천히멀리','책갈피88',
 '별빛정거장','on_my_way','연두색하루','감자별','새벽작업실','한칸성장',
 'cloudnine_5','편안한주말','오렌지수첩','해보는중','데일리모모','길위의기록',
 'sunny_note','파란운동화','틈새시간','호두라떼','느긋한아침','반짝아이디어',
 '도전하는밤','small_step','달리는펭귄','유유자적','오월의나무','노랑스티커',
];
export function ambientNickname(index){return names[((Math.trunc(index)*17)%names.length+names.length)%names.length];}
