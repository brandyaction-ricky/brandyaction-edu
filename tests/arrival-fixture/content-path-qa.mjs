import {chromium, expect, webkit} from '@playwright/test';
import {resumeOfficeVisit} from './review-office.mjs';

const url = new URL('/experience/moonshot', process.env.ARRIVAL_QA_URL || 'http://127.0.0.1:4529');
const viewports = [
  {browserType:chromium, viewport:{width:1280, height:800}, mobile:false},
  {browserType:webkit, viewport:{width:360, height:650}, mobile:true},
];
const example = '직장에서 신입 교육을 맡았어요.';
const updatedExample = '직장에서 신입 교육을 하고 업무 안내서를 만들었어요.';

for (const {browserType, viewport, mobile} of viewports) {
  const browser = await browserType.launch();
  const page = await browser.newPage({viewport, isMobile:mobile, hasTouch:mobile});
  const errors = [];
  const apiRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url());});
  await page.addInitScript(() => {
    Object.defineProperty(navigator.clipboard, 'writeText', {configurable:true, value:async text => {window.copiedContent = text;}});
  });
  const press = locator => mobile ? locator.tap() : locator.click();
  const dialog = page.getByRole('dialog', {name:'콘텐츠 담당자', exact:true});
  const button = name => dialog.getByRole('button', {name, exact:true});
  const productPath = button('소개할 상품이 있어요');
  const experiencePath = button('아직 사업을 시작하지 않았어요');
  const product = dialog.getByRole('textbox', {name:/상품·서비스/});
  const experience = dialog.getByRole('textbox', {name:/어떤 일을 해보셨나요/});
  const createExperience = button('첫 콘텐츠를 기획할 요청 만들기');
  const prompt = dialog.getByRole('textbox', {name:'AI에 보낼 말', exact:true});
  const next = button('AI가 내 일을 기억하는 방법 보기');

  async function openContentDesk() {
    await expect(page.getByRole('region', {name:'현재 목적지', exact:true})).toHaveAttribute('data-walk-station', '3');
    await press(page.locator('#arrival-desk-button'));
    const open = page.getByRole('button', {name:'내용 열기', exact:true});
    await expect(open.or(dialog).filter({visible:true}).first()).toBeVisible({timeout:15000});
    if (!await dialog.isVisible()) await press(open);
    await expect(dialog).toBeVisible();
  }

  try {
    await resumeOfficeVisit(page, url.href, {step:0, station:3, spyPhase:'handed-off'});
    await openContentDesk();
    await expect(dialog.getByRole('heading', {name:'내 상황에 맞는 콘텐츠 기획해보기'})).toBeVisible();
    await expect(dialog.locator('video')).toHaveAttribute('src','/campus/arrival/mask-example-silent.mp4');
    await expect(next).toBeInViewport({ratio:.95});
    await expect(productPath).toHaveAttribute('aria-pressed', 'true');
    await button('마스크팩 예시 넣기').click();
    await press(button('AI에 보낼 말 만들기'));
    const originalProduct = await product.inputValue();
    const productResult = dialog.getByRole('heading', {name:'AI에게 이 일을 맡겨보세요'});
    await expect(productResult).toBeVisible();

    await press(experiencePath);
    await expect(experiencePath).toHaveAttribute('aria-pressed', 'true');
    await expect(product).toHaveCount(0);
    await expect(dialog.getByRole('textbox', {name:/비교할 경쟁사/})).toHaveCount(0);
    await expect(createExperience).toBeDisabled();
    await experience.fill(' \n  ');
    await expect(createExperience).toBeDisabled();
    await experience.fill(example);
    await press(createExperience);
    const experienceResult = dialog.getByRole('heading', {name:'첫 콘텐츠를 기획할 요청을 만들었어요'});
    await expect(experienceResult).toBeFocused();
    await press(dialog.getByText('보낼 말 보기', {exact:true}));
    const generated = await prompt.inputValue();
    expect(generated).toContain(example);
    expect(generated).toContain('직접 확인한 게시물 링크와 제목');
    expect(generated).toContain('지어내지 말고 검색어');
    expect(generated).toContain('제목 하나, 첫 문장 하나, 본문에 담을 내용 세 가지');
    expect(generated).not.toContain(originalProduct);
    await press(button('보낼 말 복사'));
    await expect(dialog.getByRole('status')).toContainText('복사했어요.');
    expect(await page.evaluate(() => window.copiedContent)).toBe(generated);

    await press(productPath);
    await expect(product).toHaveValue(originalProduct);
    await expect(productResult).toBeVisible();
    await press(experiencePath);
    await expect(experience).toHaveValue(example);
    await expect(experienceResult).toBeVisible();
    await experience.fill(updatedExample);
    await expect(experienceResult).toHaveCount(0);
    await expect(button('보낼 말 복사')).toHaveCount(0);
    await press(button('복도로 돌아가기'));
    await openContentDesk();
    await expect(experience).toHaveValue(updatedExample);

    await page.reload({waitUntil:'domcontentloaded'});
    await openContentDesk();
    await expect(experiencePath).toHaveAttribute('aria-pressed', 'true');
    await expect(experience).toHaveValue(updatedExample);
    await expect(experienceResult).toHaveCount(0);
    await press(productPath);
    await expect(product).toHaveValue(originalProduct);
    await expect(productResult).toBeVisible();
    if (mobile) await product.fill('');
    else await press(experiencePath);
    await expect(button('보낼 말 복사')).toHaveCount(0);
    await expect(next).toBeInViewport({ratio:.95});
    await press(next);
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole('region', {name:'현재 목적지', exact:true})).toHaveAttribute('data-walk-station', '4');
    expect(errors).toEqual([]);
    expect(apiRequests).toEqual([]);
    console.log(JSON.stringify({browser:browserType.name(), viewport, separateDrafts:true, copied:true, continuedWithoutGenerating:true}));
  } finally {
    await browser.close();
  }
}
