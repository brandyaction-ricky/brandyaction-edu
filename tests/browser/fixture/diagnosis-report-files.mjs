// Synthetic local files only; native browser downloads cannot be served by page.route.
export const reportFiles = {
  original: {html: '<!doctype html><html lang="ko"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;color:rgb(27,38,52)}h1{font:700 32px serif}.gap{height:1200px}#details{min-height:1400px}.print-btn{display:block}</style></head><body><h1>합성 정밀 보고서</h1><a href="#details">나의 행동 경향</a><button class="print-btn">기존 인쇄</button><script>window.reportExecuted=true;parent.reportExecuted=true</script><img src="https://invalid.test/image" onerror="window.reportExecuted=true"><div class="gap"></div><section id="details"><h2>나의 행동 경향</h2></section></body></html>', markdown: '# 합성 검사 결과\n\n다음 학습에서 사용합니다.'},
  embedded: {html: '<!doctype html><html lang="ko"><body><h1>합성 다운로드 보고서</h1></body></html>', markdown: '# 합성 다운로드 보고서\n\n자료 보관'},
};
