import {chromium, expect, webkit} from '@playwright/test';
import {mkdir, readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {finishOfficeReview, loungeScheduleButton, openLoungeSchedule, openPersonalTrial, startOfficeCase, teamLeaderGuide} from './review-office.mjs';

const linkFile = process.env.ARRIVAL_QA_LINK_FILE;
const url = new URL(linkFile ? (await readFile(linkFile, 'utf8')).trim() : process.env.ARRIVAL_QA_URL ?? 'http://127.0.0.1:4529/experience/moonshot');
if (url.pathname === '/') url.pathname = '/experience/moonshot';
const output = process.env.ARRIVAL_QA_OUTPUT;
if (output) await mkdir(output, {recursive:true});

const route = new Map([[1, 2], [2, 3], [3, 4], [4, 7]]);
const contentDraft = {
  product: '반려동물 출장 사진 촬영', competitor: 'https://example.com/qa-studio',
  customer: '고령 반려견의 보호자', facts: '평소 생활하는 집에서 촬영하고 개인 화보를 전달합니다.',
};
const exchanges = [
  {button:'고객 정보 알려주기', status:'바쁜 직장인 ↔ 보습 마스크팩 · 퇴근 후 사용하는 상황', connected:2},
  {button:'고객 질문도 알려주기', status:'고객 질문 ↔ 사용법 ↔ 콘텐츠·고객응대', connected:6},
  {button:'우리 브랜드의 기준도 알려주기', status:'고객 + 상품 + 사용법 + 브랜드 기준 → 우리 회사에 맞는 결과', connected:7},
];

for (const [device, engine, viewport] of [
  ['pc', chromium, {width:1440, height:900}],
  ['mobile', webkit, {width:393, height:852}],
]) {
  const browser = await engine.launch();
  const mobile = device === 'mobile';
  const page = await browser.newPage({viewport, isMobile:mobile, hasTouch:mobile});
  const errors = [];
  const externalAI = [];
  const visited = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (/^(chatgpt\.com|claude\.ai|api\.openai\.com|api\.anthropic\.com)$/.test(new URL(request.url()).hostname)) externalAI.push(request.url());
  });
  const frame = page.frameLocator('iframe[title*="직원 사무실"]');
  const world = frame.locator('#walk');
  const open = page.locator('#arrival-desk-button');
  const calendar = page.getByRole('link', {name:'Google 캘린더', exact:true});
  const nextHint = page.getByRole('region', {name:'현재 목적지', exact:true}).getByRole('status').filter({hasText:/옆으로 이동해|옆자리에서|복도 끝/});
  const button = (root, name) => root.getByRole('button', {name, exact:true});
  const tap = locator => mobile ? locator.tap() : locator.click();
  const position = () => world.evaluate(element => [Number(element.dataset.playerX), Number(element.dataset.playerZ), Number(element.dataset.arrivals)]);
  const capture = stage => output && page.screenshot({path:resolve(output, `${device}-${stage}.png`), animations:'disabled'});

  async function walk(station) {
    if (station === 1) {
      await expect(world).toHaveAttribute('data-ready', 'true', {timeout:30000});
      await startOfficeCase(page);
      await expect(teamLeaderGuide(page)).toBeVisible();
    } else {
      const destination = station === 7 ? loungeScheduleButton(page) : page.getByRole('dialog', {name:['경쟁사 스파이','콘텐츠 담당자','정본 · 회사 업무 기준'][station - 2], exact:true});
      await expect(destination).toBeVisible({timeout:16000});
      await expect(nextHint).toHaveCount(0);
    }
    await expect(world).toHaveAttribute('data-station', String(station));
    visited.push(station);
  }

  async function inspect(station, dialog) {
    if (station === 3) {
      await expect(dialog.getByText('다음. 4번째 봇을 확인해보세요.', {exact:true})).toBeInViewport({ratio:.95});
      await expect(dialog.getByText('AI 직원들이 10배 더 똑똑해지는 법', {exact:true})).toBeInViewport({ratio:.95});
      await expect(button(dialog, '회사 업무 기준 보기')).toBeInViewport({ratio:.95});
      await dialog.getByLabel(/^상품·서비스/).fill(contentDraft.product);
      await dialog.getByLabel(/^비교할 경쟁사 이름이나 링크/).fill(contentDraft.competitor);
      await dialog.getByLabel(/^어떤 고객에게 필요한가요/).fill(contentDraft.customer);
      await dialog.getByLabel(/^고객 질문과 실제 상품 특징/).fill(contentDraft.facts);
      await tap(button(dialog, '요청문 만들기'));
      await tap(button(dialog, '복도로 돌아가기'));
      await expect(dialog).not.toBeVisible();
      await tap(open);
      await inspectContentDraft(dialog);
      await expect(button(dialog, '회사 업무 기준 보기')).toBeInViewport({ratio:.95});
      await capture('content-restored');
      return;
    }
    if (station !== 4) return;
    const map = dialog.getByRole('region', {name:'회사 지식 지도'});
    const connections = map.locator('li[data-connected="true"]');
    const status = map.getByRole('status');
    await expect(map.getByRole('listitem')).toHaveCount(12);
    await expect(map.getByRole('button')).toHaveCount(0);
    await expect(dialog.getByRole('heading', {name:'AI들이 10배 더 똑똑하게 일할 수 있는 이유는 정본 때문이에요.', exact:true})).toBeVisible();
    await expect(dialog.getByText('정본은 AI 직원들이 함께 읽는 회사 업무 기준 문서예요.', {exact:true})).toHaveCount(0);
    await expect(dialog.getByText('아래 버튼을 눌러 AI가 어떻게 학습하는지 확인해 보세요.', {exact:true})).toBeVisible();
    await expect(map.getByText('대화에서 배운 내용이 여기에 하나씩 연결돼요.', {exact:true})).toBeVisible();
    await expect(connections).toHaveCount(0);
    await expect(status).toHaveText('아직 연결된 지식이 없어요.');
    await expect(button(dialog, '웰컴 라운지로 가기')).toBeEnabled();
    await capture('canon-open');
    for (const [index, exchange] of exchanges.entries()) {
      const action = button(dialog, exchange.button);
      await expect(action).toBeInViewport({ratio:.95});
      const actionBox = await action.boundingBox();
      expect(actionBox.y + actionBox.height).toBeLessThan((await map.boundingBox()).y);
      await tap(action);
      await expect(status).toHaveText(exchange.status);
      await expect(connections).toHaveCount(exchange.connected);
      await expect(action).toHaveCount(0);
      const next = exchanges[index + 1];
      if (next) {
        const nextAction = button(dialog, next.button);
        await expect(nextAction).toBeInViewport({ratio:.95});
        expect(Math.abs((await nextAction.boundingBox()).y - actionBox.y)).toBeLessThan(3);
      }
      if (index === 0) {
        const before = await position();
        await tap(button(dialog, '복도로 돌아가기'));
        await expect(dialog).not.toBeVisible();
        await expect(open).toBeVisible();
        expect(await position()).toEqual(before);
        await tap(open);
        await expect(status).toHaveText(exchange.status);
        expect(await position()).toEqual(before);
      }
    }
    const results = dialog.getByRole('region', {name:'같은 기준을 활용한 업무 결과'});
    const staff = results.getByRole('article');
    await expect(staff).toHaveCount(2);
    for (const name of ['콘텐츠 AI', '고객응대 AI']) {
      await expect(staff.filter({has:page.getByRole('heading', {name, exact:true})})).toContainText('10~15분 뒤 떼어내 주세요.');
    }
    await tap(dialog.getByText('이전 대화 보기', {exact:true}));
    await expect(dialog.getByText('우리 고객은 바쁜 직장인이야. 퇴근 후 쉬는 시간에 팩을 사용해.')).toBeVisible();
    await expect(dialog.getByText('팩 붙이고 자도 되냐고 자주 물어봐. 우리 제품은 10~15분 뒤 떼면 돼.')).toBeVisible();
    await expect(dialog.getByRole('heading', {name:'12월 7일 라이브에서 이 전 과정을 알려드립니다.'})).toBeVisible();
    await results.scrollIntoViewIfNeeded();
    await capture('canon-results');
    await page.reload({waitUntil:'domcontentloaded'});
    await tap(open);
    await expect(status).toHaveText(exchanges.at(-1).status);
    await expect(staff).toHaveCount(2);
    await tap(button(dialog, '처음부터 보기'));
    await expect(button(dialog, exchanges[0].button)).toBeInViewport({ratio:.95});
  }
  async function inspectContentDraft(dialog) {
    await expect(dialog.getByLabel(/^상품·서비스/)).toHaveValue(contentDraft.product);
    await expect(dialog.getByLabel(/^비교할 경쟁사 이름이나 링크/)).toHaveValue(contentDraft.competitor);
    await expect(dialog.getByLabel(/^어떤 고객에게 필요한가요/)).toHaveValue(contentDraft.customer);
    await expect(dialog.getByLabel(/^고객 질문과 실제 상품 특징/)).toHaveValue(contentDraft.facts);
    await expect(dialog.getByRole('heading', {name:'내 사업에 적용할 요청문이 준비됐어요.'})).toBeVisible();
  }

  try {
    const response = await page.goto(url.href);
    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).origin).toBe(url.origin);
    await finishOfficeReview(page, {
      walk, inspect, enterPersonal:false,
      beforeLeave: async () => {
        await expect(world).toHaveAttribute('data-moving','false');
      },
      afterLeave: async station => {
        await expect(world).toHaveAttribute('data-station', String(route.get(station)));
        await expect(calendar).not.toBeVisible();
        await expect(nextHint).toContainText(['경쟁사 스파이', '콘텐츠 담당자', '회사 업무 기준', '웰컴 라운지'][station - 1]);
        await expect(nextHint).toBeInViewport({ratio:1});
        if (station === 2) await capture('next-destination');
      },
    });
    expect(visited).toEqual([1, 2, 3, 4, 7]);
    await expect(page.getByRole('heading',{name:'지금 어떤 상황이신가요?'})).toHaveCount(0);
    await expect(world).toHaveAttribute('data-free-roam', 'true');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(calendar).toHaveCount(0);
    await expect(page.getByRole('heading', {name:'오늘 해본 것', exact:true})).toHaveCount(0);
    const lounge = page.getByRole('region', {name:'웰컴 라운지에서 할 수 있는 일', exact:true});
    for (const label of ['캘린더에 추가', '복도로 돌아가기']) {
      await expect(button(lounge, label)).toBeInViewport({ratio:.95});
    }
    await expect(lounge.getByRole('button', {name:/무료 자료 받기|내 AI 체험으로/})).toHaveCount(0);
    await capture('lounge-entry');

    await tap(frame.getByRole('button', {name: /자료 안내/}));
    const guide = page.getByRole('dialog', {name: '무료자료 · 라이브 특전', exact: true});
    const resources = guide.getByRole('region', {name:'웰컴 라운지 안내'});
    await expect(resources.getByRole('heading', {name:'라이브 전에 볼 자료', exact:true})).toBeVisible();
    await expect(resources.getByRole('link', {name:'회사 업무 기준표 받기', exact:true})).toHaveAttribute('download', /업무-기준표\.txt$/);
    await capture('lounge-materials');
    await tap(button(guide, '라이브 특전'));
    await expect(resources.getByText(/12월 7일 오후 9시 라이브에서 비밀번호를 공개합니다/)).toBeVisible();
    await expect(button(guide, '캘린더에 추가')).toBeVisible();
    await expect(resources.getByRole('listitem')).toHaveCount(3);
    await tap(button(guide, '무료자료'));
    await tap(button(resources, '광고 영상 체험 열기'));
    const replay = page.getByRole('dialog', {name:'콘텐츠 제작 다시 보기', exact:true});
    await expect(replay).toBeVisible();
    await expect(replay.locator('video')).toHaveAttribute('src', '/campus/arrival/mask-example-silent.mp4');
    await inspectContentDraft(replay);
    await tap(button(replay, '자료 목록으로 돌아가기').first());
    await expect(replay).not.toBeVisible();
    await expect(guide).toBeVisible();
    await tap(button(guide, '라운지로 돌아가기'));
    await expect(loungeScheduleButton(page)).toBeVisible();

    const intro = frame.getByRole('button', {name: /퇴사선배 윤익 · 브랜디액션/});
    await expect(intro).toContainText('광고만 13년 했어요. 요즘은 AI 직원들이랑 일해요.');
    await tap(intro);
    const team = page.getByRole('dialog', {name:'퇴사선배 윤익 · 브랜디액션 팀', exact:true});
    await expect(team).toBeVisible();
    await expect(team.getByRole('heading', {name:'퇴사선배 윤익 · 브랜디액션 팀', exact:true})).toBeVisible();
    await expect(team.getByText('13년차 퍼포먼스 마케터 · 브랜디액션 CMO', {exact:true})).toBeVisible();
    await expect(team.getByRole('heading', {name:'브랜디액션 팀의 실제 AI 사무실', exact:true})).toBeVisible();
    const teamMaterials = button(team, '무료자료 확인하러 가기');
    await expect(teamMaterials).toBeInViewport({ratio:.95});
    await capture('lounge-team');
    await tap(teamMaterials);
    await expect(team).not.toBeVisible();
    await expect(guide).toBeVisible();
    await expect(guide.getByRole('heading', {name:'무료자료 · 라이브 특전', exact:true})).toBeFocused();
    await expect(button(guide, '무료자료')).toHaveAttribute('aria-pressed', 'true');
    await expect(resources.getByRole('heading', {name:'라이브 전에 볼 자료', exact:true})).toBeVisible();
    await tap(button(guide, '라운지로 돌아가기'));
    await expect(guide).toHaveCount(0);
    await expect(world).toHaveAttribute('data-paused', 'false');
    await openLoungeSchedule(page);
    await capture('lounge-schedule');

    await tap(button(page, '웰컴 라운지로 돌아가기'));
    await expect(loungeScheduleButton(page)).toBeVisible();
    await openPersonalTrial(page);
    await expect(page.getByRole('heading',{name:'지금 어떤 상황이신가요?'})).toBeVisible();
    await tap(button(page, '웰컴 라운지로 돌아가기'));
    await expect(loungeScheduleButton(page)).toBeVisible();
    await openLoungeSchedule(page);
    await openPersonalTrial(page);
    await tap(page.getByRole('button', {name:/이미 사업을 하고 있어요/}));
    await tap(button(page, '내 상황으로 요청문 만들기'));
    const productAnswer = page.getByLabel(/무엇을 판매하고/);
    const factsAnswer = page.getByLabel(/가장 강조하고 싶은 상품의 특징/);
    await productAnswer.fill('직접 적은 새로운 상품 정보');
    await tap(button(page, '콘텐츠 담당자에게 적은 내용 가져오기'));
    await expect(productAnswer).toHaveValue('직접 적은 새로운 상품 정보');
    await expect(factsAnswer).toHaveValue(contentDraft.facts);
    await expect(page.getByRole('status').filter({hasText:'비어 있던 칸에 가져왔어요.'})).toBeVisible();
    await capture('content-reused');
    expect(errors).toEqual([]);
    expect(externalAI).toEqual([]);
    console.log(JSON.stringify({device, viewport, visited, canonExchanges:exchanges.length, calendar:true, contentDraftRestoredAndReused:true, errors, externalAI}));
  } catch (error) {
    await capture('canon-failure');
    throw error;
  } finally {
    await browser.close();
  }
}
