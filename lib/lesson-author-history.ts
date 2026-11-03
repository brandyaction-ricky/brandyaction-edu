export type AuthorHistoryItem={revision:string;createdAt:string;createdBy:string;editor:string;title:string;source:'manual'|'autosave'|'backup'|'legacy';note:string;baseline:boolean;published:boolean};
export type AuthorHistoryPage={rows:AuthorHistoryItem[];next:{at:string;id:string}|null};
export function groupAuthorHistory(rows:AuthorHistoryItem[]){
 const groups:AuthorHistoryItem[][]=[];
 for(const item of rows){
  const group=groups.at(-1),last=group?.at(-1);
  const collapsible=(v:AuthorHistoryItem)=>!v.published&&!v.baseline&&['autosave','legacy'].includes(v.source);
  if(last&&collapsible(last)&&collapsible(item)&&last.source===item.source&&last.createdBy===item.createdBy&&Date.parse(last.createdAt)-Date.parse(item.createdAt)<=600000)group!.push(item);
  else groups.push([item]);
 }
 return groups;
}
