import {campusError} from '../snapshot';

export const toolKinds={unspecified:'도구 선택 안 함',ai:'AI',website:'웹사이트·쇼핑몰',design:'디자인·영상',advertising:'광고',analytics:'분석',automation:'자동화',other:'기타'} as const;
export type ToolKind=keyof typeof toolKinds;
export const toolSuggestions:Record<ToolKind,string[]>={unspecified:[],ai:['ChatGPT','Claude','Gemini'],website:['아임웹','카페24','WordPress','Framer'],design:['Canva','Figma','CapCut'],advertising:['Meta 광고 관리자','Google Ads','네이버 검색광고'],analytics:['Google Analytics 4','Meta 이벤트 관리자'],automation:['Make','Zapier','n8n'],other:[]};
type ToolFields={tool_kind?:unknown;tool_name?:unknown};
function normalized(value:string){return value.normalize('NFKC').trim().replace(/\s+/gu,' ');}
function canonical(kind:ToolKind,value:string){const name=normalized(value);return toolSuggestions[kind].find(v=>v.toLocaleLowerCase('en-US')===name.toLocaleLowerCase('en-US'))||name;}
export function parseToolDimension(kind:unknown='unspecified',name:unknown=''):{tool_kind:ToolKind;tool_name:string}{
 if(typeof kind!=='string'||!Object.hasOwn(toolKinds,kind)||typeof name!=='string'||/[\u0000-\u001f\u007f]/u.test(name))return campusError(400,'도구 종류와 이름을 확인해 주세요.');
 const toolKind=kind as ToolKind,toolName=canonical(toolKind,name);
 if(toolName.length>80||(toolKind==='unspecified'?toolName!=='':toolName===''))return campusError(400,'도구 종류와 이름을 확인해 주세요.');
 return {tool_kind:toolKind,tool_name:toolName};
}
/** Old requests have no tool fields; do not infer a tool from the private question body. */
export function requestTool(request:ToolFields){
 try{return parseToolDimension(request.tool_kind??'unspecified',request.tool_name??'');}catch{return {tool_kind:'unspecified' as const,tool_name:''};}
}
export function toolLabel(request:ToolFields){const t=requestTool(request);return t.tool_kind==='unspecified'?toolKinds.unspecified:`${toolKinds[t.tool_kind]} · ${t.tool_name}`;}
export function toolGroupKey(request:ToolFields){const t=requestTool(request);return JSON.stringify([t.tool_kind,t.tool_name.toLocaleLowerCase('en-US')]);}
