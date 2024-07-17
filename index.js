const express = require('express');
const axios = require('axios');
const app = express();
const port = 3001;

const sites = [
  { name: 'Nextcloud', url: 'https://nextcloud.poweredge.xyz/' },
  { name: 'Navidrome', url: 'https://navidrome.poweredge.xyz/' },
  { name: 'Adabit', url: 'https://adabit.org' },
  { name: 'Poweredge', url: 'https://poweredge.xyz' },
  { name: 'n8n', url: 'https://n8n.poweredge.xyz/' }
];

async function checkStatus(url) {
  try {
    const response = await axios.get(url, { timeout: 5000 });
    return response.status === 200 ? 'UP' : 'DOWN';
  } catch (error) {
    return 'DOWN';
  }
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
            --color-background: #13141a;
            --color-text: #909096;
            --color-highlight: #ebbcba;
            --color-link: #9ccfd8;
        }
        body {
            font-family: monospace;
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
            color: var(--color-highlight);
            margin-bottom: 5px;
        }
        nav {
            margin-bottom: 20px;
        }
        nav a {
            color: var(--color-link);
            text-decoration: none;
            margin-right: 10px;
        }
        .content {
            margin-bottom: 20px;
        }
        .quick-links {
            margin-top: 20px;
        }
        .quick-links p {
            margin-bottom: 5px;
        }
        .quick-links a {
            color: var(--color-link);
            text-decoration: none;
        }
        .footer {
            margin-top: 20px;
            border-top: 1px solid var(--color-text);
            padding-top: 10px;
        }
        .date {
            position: absolute;
            top: 20px;
            right: 20px;
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
        <ul class="list-default">
  `;
  
  for (const site of sites) {
    const status = await checkStatus(site.url);
    const statusClass = status === 'UP' ? 'text-pine' : 'text-love';
    statusHtml += `<li>${site.name}: <span class="${statusClass}">${status}</span></li>`;
  }
  
  statusHtml += `
        </ul>        </main>
        <div class="quick-links">
            <p><a href="mailto:me@adabit.org">something weird? → status@adabit.org</a></p>
        </div>
        <footer class="footer">
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
