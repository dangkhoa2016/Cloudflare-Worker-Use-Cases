
addEventListener('scheduled', event => {
  event.waitUntil(
    handleSchedule(event.scheduledTime)
  )
});

addEventListener('fetch', function (event) {
  event.respondWith(handleRequest(event.request));
});

async function handleSchedule(scheduledDate) {
  return await handleRequest();
};

async function handleRequest(request) {
  // Only GET requests work with this proxy.
  if (!DOMAINS)
    return new Response('No website url for check...', { status: 200 });

  const arr_sites = DOMAINS.split(',').map(url => url.trim()).filter(s => s);
  if (arr_sites.length > 0) {
    const results = await Promise.all(
      arr_sites.map(site => uptime(site))
    );
    return new Response(results.join('\r\n\r\n'), { status: 200 });
  }

  return new Response('No website url for check...', { status: 200 });
};

function uptime(url) {
  const start_time = new Date();

  return new Promise(resolve => {
    fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.4844.84 Safari/537.36 OPR/85.0.4341.75"
      }
    }).then(res => res.text())
      .then(content => {
        const end_time = new Date();
        var dif = (end_time.getTime() - start_time.getTime()) / 1000;
        resolve(`${url}: ${content}, took: ${dif} second(s).`);
      })
      .catch(ex => {
        console.log('Error fetch', ex);
        resolve(`Error fetch url: ${url}`)
      })
  });
};
