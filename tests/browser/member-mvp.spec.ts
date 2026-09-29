import { expect, test, type Page } from '@playwright/test';
const id = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;
async function backend(page: Page, options: { staff?: boolean; readFailure?: boolean; responseLost?: boolean } = {}) {
  const rows: Record<string, {member:string;isMvp:boolean;color:string|null;revision:string|null}> = { [id(10)]:{member:id(10),isMvp:false,color:null,revision:null},[id(11)]:{member:id(11),isMvp:true,color:null,revision:id(1)} };
  let settings = {color:'#FFD700',revision:null as string|null}, readFailure = options.readFailure, lost = options.responseLost;
  const writes: Record<string, unknown>[] = [];
  await page.route('**/api/admin/member-mvp**',async route=>{
    const url=new URL(route.request().url());
    if(route.request().method()==='GET'){
      if(readFailure){await route.fulfill({status:503,json:{error:'우수 수강생 조회 실패'}});return;}
      if(url.searchParams.has('settings')) {await route.fulfill(options.staff?{status:403,json:{error:'관리자만 확인할 수 있습니다.'}}:{json:{settings,canManage:true}});return;}
      const members=(url.searchParams.get('members')||'').split(',').map(member=>rows[member]).filter(Boolean);await route.fulfill({json:{members,defaultColor:settings.color,canManage:!options.staff}});return;
    }
    const body=route.request().postDataJSON();writes.push(body);const current=body.kind==='settings'?settings:rows[body.member];
    if(current.revision!==body.requestId && current.revision!==body.expectedRevision){await route.fulfill({status:409,json:{error:'다른 관리자가 먼저 변경했습니다. 다시 불러와 주세요.'}});return;}
    const value=body.kind==='settings'?{color:body.color,revision:body.requestId}:{member:body.member,isMvp:body.isMvp,color:body.color,revision:body.requestId};
    if(body.kind==='settings')settings={color:body.color,revision:body.requestId};else rows[body.member]={member:body.member,isMvp:body.isMvp,color:body.color,revision:body.requestId};
    if(lost){lost=false;await route.abort();return;}await route.fulfill({json:{value}});
  });
  return {writes,replace:()=>{rows[id(10)]={member:id(10),isMvp:true,color:'#123456',revision:id(50)};},setReadFailure:(v:boolean)=>{readFailure=v;}};
}
test('actual member catalog and profile display selection, inherited/custom colors and removal',async({page},info)=>{
  const server=await backend(page);await page.goto('/member-mvp-test');const member=page.getByRole('region',{name:'우수 수강생 설정'}),defaults=page.getByRole('region',{name:'우수 수강생 기본 색상'});
  const first=page.getByRole('row').filter({has:page.getByRole('button',{name:'시험 수강생',exact:true})}),second=page.getByRole('row').filter({has:page.getByRole('button',{name:'다른 수강생',exact:true})});
  await expect(first.locator('.member-mvp-badge')).toHaveCount(0);await expect(second.locator('.member-mvp-badge')).toBeVisible();
  await member.getByRole('checkbox',{name:'우수 수강생으로 선정',exact:true}).check();await member.getByRole('button',{name:'우수 수강생 저장',exact:true}).click();await expect(first.locator('.member-mvp-badge')).toBeVisible();expect(server.writes[0]).toMatchObject({isMvp:true,color:null});
  await defaults.getByRole('textbox',{name:'색상 코드'}).fill('#007755');await defaults.getByRole('button',{name:'기본 색상 저장'}).click();await expect(first.locator('.member-mvp-badge')).toHaveCSS('border-top-color','rgb(0, 119, 85)');await expect(second.locator('.member-mvp-badge')).toHaveCSS('border-top-color','rgb(0, 119, 85)');
  await member.getByRole('checkbox',{name:'개인 표시 색상 사용'}).check();await member.getByRole('textbox',{name:'색상 코드'}).fill('invalid');await member.getByRole('button',{name:'우수 수강생 저장',exact:true}).click();await expect(member.getByRole('alert')).toContainText('색상');expect(server.writes).toHaveLength(2);
  await member.getByRole('textbox',{name:'색상 코드'}).fill('#aabbcc');await member.getByRole('button',{name:'우수 수강생 저장',exact:true}).click();await expect(first.locator('.member-mvp-badge')).toHaveCSS('border-top-color','rgb(170, 187, 204)');
  await page.screenshot({path:info.outputPath('member-mvp.png'),fullPage:true});
  await member.getByRole('checkbox',{name:'우수 수강생으로 선정',exact:true}).uncheck();await member.getByRole('button',{name:'우수 수강생 저장',exact:true}).click();await expect(first.locator('.member-mvp-badge')).toHaveCount(0);await expect(member.getByRole('status')).toHaveText('우수 수강생 표시를 해제했습니다.');
  await page.reload();await expect(member.getByRole('checkbox',{name:'우수 수강생으로 선정',exact:true})).not.toBeChecked();await expect(second.locator('.member-mvp-badge')).toHaveCSS('border-top-color','rgb(0, 119, 85)');
});
test('read-only member operator sees recognition but cannot select or change colors',async({page})=>{
  const server=await backend(page,{staff:true});await page.goto('/member-mvp-test');const member=page.getByRole('region',{name:'우수 수강생 설정'});
  await expect(member).toContainText('관리자만 할 수 있습니다');await expect(member.getByRole('checkbox')).toHaveCount(0);await expect(member.getByRole('button',{name:'우수 수강생 저장'})).toHaveCount(0);expect(server.writes).toHaveLength(0);
});
test('load failure and response loss retain the draft and reuse the write identity',async({page})=>{
  const server=await backend(page,{readFailure:true,responseLost:true});await page.goto('/member-mvp-test');const member=page.getByRole('region',{name:'우수 수강생 설정'});
  await expect(member.getByRole('alert')).toHaveText('우수 수강생 조회 실패');await expect(member.getByRole('checkbox')).toHaveCount(0);server.setReadFailure(false);await member.getByRole('button',{name:'저장된 설정 다시 불러오기'}).click();
  await member.getByRole('checkbox',{name:'우수 수강생으로 선정',exact:true}).check();await member.getByRole('button',{name:'우수 수강생 저장',exact:true}).click();await expect(member.getByRole('alert')).toBeVisible();await expect(member.getByRole('checkbox',{name:'우수 수강생으로 선정',exact:true})).toBeChecked();
  await member.getByRole('button',{name:'우수 수강생 저장',exact:true}).click();await expect(member.getByRole('status')).toHaveText('우수 수강생으로 저장했습니다.');expect(server.writes).toHaveLength(2);expect(server.writes[0]).toEqual(server.writes[1]);
});
test('concurrent administrator edits preserve input until explicit reload',async({page})=>{
  const server=await backend(page);await page.goto('/member-mvp-test');const member=page.getByRole('region',{name:'우수 수강생 설정'});
  await member.getByRole('checkbox',{name:'우수 수강생으로 선정',exact:true}).check();server.replace();await member.getByRole('button',{name:'우수 수강생 저장',exact:true}).click();await expect(member.getByRole('alert')).toContainText('다른 관리자');
  page.once('dialog',dialog=>dialog.dismiss());await member.getByRole('button',{name:'저장된 설정 다시 불러오기'}).click();await expect(member.getByRole('checkbox',{name:'개인 표시 색상 사용'})).not.toBeChecked();
  page.once('dialog',dialog=>dialog.accept());await member.getByRole('button',{name:'저장된 설정 다시 불러오기'}).click();await expect(member.getByRole('textbox',{name:'색상 코드'})).toHaveValue('#123456');expect(server.writes).toHaveLength(1);
});
