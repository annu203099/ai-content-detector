async function checkNpmWeb() {
  const url = 'https://www.npmjs.com/package/@annapurna12/ai-detector';
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    }
  });
  console.log('npmjs.com status:', res.status);
  const text = await res.text();
  console.log('Title in html:', text.match(/<title>(.*?)<\/title>/)?.[1]);
  if (text.includes('1.0.0')) {
    console.log('Found 1.0.0 in page!');
  }
}

checkNpmWeb().catch(console.error);
