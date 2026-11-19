export const VISITOR_AVATARS = [
  {id:'female-c', label:'파란 티셔츠', swatch:'#e8eff9'},
  {id:'female-a', label:'보라색 셔츠', swatch:'#efeaf7'},
  {id:'male-c', label:'파란 모자', swatch:'#e8eef0'},
  {id:'male-d', label:'빨간 넥타이', swatch:'#f4ebe3'},
] as const;

export type VisitorAvatarId = (typeof VISITOR_AVATARS)[number]['id'];
export const DEFAULT_VISITOR_AVATAR: VisitorAvatarId = 'female-c';

export function isVisitorAvatarId(value: unknown): value is VisitorAvatarId {
  return VISITOR_AVATARS.some(avatar => avatar.id === value);
}
