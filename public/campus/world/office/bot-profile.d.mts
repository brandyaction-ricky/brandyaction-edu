export type BotProfile={employeeId:string;name:string;telegramUrl:string|null;duties:string;appearanceSeed:number;seatIndex:number};
export type BotDocument={schemaVersion:1;environment:{lighting:string;weather:string;rainSound:boolean};profiles:BotProfile[]};
export function normalizeTelegramBot(input:unknown):string;
export class BotOfficeModel{constructor(options?:{makeId?:()=>string;makeSeed?:()=>number});getDocument():BotDocument;restore(document:unknown):BotDocument;saveEmployee(input:Record<string,unknown>):BotDocument;}
