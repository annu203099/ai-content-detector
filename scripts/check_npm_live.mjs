const token = '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';

async function check() {
  const headers = { 'Authorization': `Bearer ${token}` };

  const urls = [
    'https://registry.npmjs.org/@annapurna12%2Fai-detector',
    'https://registry.npmjs.org/@annapurna12/ai-detector',
    'https://registry.npmjs.org/@annapurna12%2fai-detector/latest',
    'https://registry.npmjs.org/@annapurna12%2Fai-detector/1.0.0'
  ];

  for (const url of urls) {
    const res = await fetch(url, { headers });
    console.log(url, '-> Status:', res.status);
    if (res.ok) {
      const data = await res.json();
      console.log('Success! Name:', data.name, 'Version:', data.version || Object.keys(data.versions || {}));
    }
  }
}

check().catch(console.error);
