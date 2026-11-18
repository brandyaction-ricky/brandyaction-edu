// Enter through the HTML desk action so clipboard checks also run without WebGL.
export async function finishOfficeReview(page) {
  await page.locator('#arrival-desk-button').click();
  await page.getByRole('button', {name: '퇴근을 늦추는 일로 시작해줘요.'}).click();
  await page.getByRole('button', {name: '이 문장으로 승인하기'}).click();
  await page.getByRole('button', {name: '내 업무로 해보기'}).click();
}
