const express = require('express');
const axios = require('axios');
const app = express();
const port = 3001;

const sites = [
  { name: 'nextcloud', url: 'https://nextcloud.poweredge.xyz/' },
  { name: 'navidrome', url: 'https://navidrome.poweredge.xyz/' },
  { name: 'adarun', url: 'https://poweredge.xyz' },
  { name: 'n8n', url: 'https://n8n.poweredge.xyz/' },
  { name: 'tbds.adabit.org', url: 'https://tbds.adabit.org/' }
];

async function checkStatus(url) {
  try {
    const response = await axios.get(url, { timeout: 5000 });
    return response.status === 200 ? 'UP' : 'DOWN';
  } catch (error) {
    return 'DOWN';
  }
}

function generateGraph(status) {
  const statusClass = status === 'UP' ? 'bar-green' : 'bar-red';
  const percentage = status === 'UP' ? '100%' : '0%'; 
  
  return `
    <div class="bar">
      <div class="${statusClass}" style="width: ${percentage};"></div>
    </div>
  `;
}

app.get('/', async (req, res) => {

  let statusHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>adabit status</title>
    <style>
        :root {
            --color-background: #202225;
            --color-text: #dcddde;
            --color-link: #7289da;
            --color-bar-green: #43b581;
            --color-bar-red: #f04747;
        }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: var(--color-background);
            color: var(--color-text);
            margin: 0;
            padding: 20px;
            line-height: 1.6;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
        }
        h1 {
            color: #fff;
            margin-bottom: 5px;
        }
        .content {
            margin-bottom: 20px;
        }
        .bar {
            width: 100%;
            height: 10px;
            background-color: #2f3136;
            border-radius: 5px;
            overflow: hidden;
            margin-bottom: 8px;
        }
        .bar-green {
            height: 100%;
            background-color: var(--color-bar-green);
            transition: width 0.3s ease;
        }
        .bar-red {
            height: 100%;
            background-color: var(--color-bar-red);
            transition: width 0.3s ease;
        }
        .service-name {
            font-size: 18px;
            font-weight: bold;
            margin-bottom: 5px;
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>status.adabit.org*</h1>
        </header>
        <main class="content">
            <h2 class="text-iris">Service Status</h2>
  `;
  
  for (const site of sites) {
    const status = await checkStatus(site.url);
    const graphHtml = generateGraph(status);
    const statusText = status === 'UP' ? '' : 'no respponse :(';
    const serviceNameClass = status === 'UP' ? 'service-name text-green' : 'service-name text-red';
    statusHtml += `
      <div>
        <div class="${serviceNameClass}">${site.name}</div>
        <div>${graphHtml}</div>
        <div>${statusText}</div>
      </div>
    `;
  }
  
  statusHtml += `
        </main>
        <footer>
            <p>trans rights are human rights</p>
        </footer>
    </div>
</body>
</html>
  `;
  
  res.send(statusHtml);
});

app.listen(port, () => {
  console.log(`Status page app listening at http://localhost:${port}`);
});
