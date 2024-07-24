const express = require('express');
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const app = express();
const port = 3001;

const db = new sqlite3.Database('./status.db');

const sites = [
  { name: 'nextcloud', url: 'https://nextcloud.poweredge.xyz/' },
  { name: 'navidrome', url: 'https://navidrome.poweredge.xyz/' },
  { name: 'adarun', url: 'https://poweredge.xyz' },
  { name: 'n8n', url: 'https://n8n.poweredge.xyz/' },
  { name: 'tbds.adabit.org', url: 'https://tbds.adabit.org/' }
];

db.run(`CREATE TABLE IF NOT EXISTS status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_name TEXT,
  status TEXT,
  response_time INTEGER,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

async function checkStatus(url) {
  try {
    const startTime = Date.now();
    const response = await axios.get(url, { timeout: 5000 });
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    return { status: response.status === 200 ? 'UP' : 'DOWN', responseTime };
  } catch (error) {
    return { status: 'DOWN', responseTime: null };
  }
}

async function updateStatus() {
  console.log('Updating status...');
  for (const site of sites) {
    const { status, responseTime } = await checkStatus(site.url);
    db.run('INSERT INTO status_history (site_name, status, response_time) VALUES (?, ?, ?)', 
      [site.name, status, responseTime]);
  }
  console.log('Status update complete.');
}

setInterval(updateStatus, 60 * 1000);

updateStatus();

function getStatusColor(status) {
  return status === 'UP' ? 'var(--color-green)' : 'var(--color-red)';
}

app.get('/', async (req, res) => {
  const statusPromises = sites.map(async (site) => {
    const recentStatus = await new Promise((resolve, reject) => {
      db.get('SELECT status, response_time FROM status_history WHERE site_name = ? ORDER BY timestamp DESC LIMIT 1',
        [site.name], (err, row) => {
          if (err) reject(err);
          else resolve(row || { status: 'UNKNOWN', response_time: null });
        });
    });
    
    const historyData = await new Promise((resolve, reject) => {
      db.all('SELECT status, response_time, timestamp FROM status_history WHERE site_name = ? ORDER BY timestamp DESC LIMIT 480', 
        [site.name], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
    });

    const totalChecks = historyData.length;
    const upChecks = historyData.filter(record => record.status === 'UP').length;
    const uptimePercentage = totalChecks > 0 ? (upChecks / totalChecks * 100).toFixed(2) : 100;

    const validResponseTimes = historyData.filter(record => record.response_time !== null);
    const avgResponseTime = validResponseTimes.length > 0
      ? (validResponseTimes.reduce((sum, record) => sum + record.response_time, 0) / validResponseTimes.length).toFixed(2)
      : 'N/A';

    return {
      name: site.name,
      url: site.url,
      currentStatus: recentStatus.status,
      responseTime: recentStatus.response_time,
      uptime: uptimePercentage,
      avgResponseTime,
      history: historyData
    };
  });

  const statuses = await Promise.all(statusPromises);

  let html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>adabit status</title>
    <style>
        :root {
            --color-background: #0d181f;
            --color-text: #e0def4;
            --color-link: #7289da;
            --color-green: #43b581;
            --color-red: #f04747;
            --color-yellow: #faa61a;
        }
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen-Sans, Ubuntu, Cantarell, 'Helvetica Neue', sans-serif;
            background-color: var(--color-background);
            color: var(--color-text);
            margin: 0;
            padding: 20px;
            line-height: 1.6;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        header {
            text-align: center;
            margin-bottom: 40px;
        }
        h1 {
            color: #fff;
            font-size: 2.5em;
            margin-bottom: 10px;
        }
        .content {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
        }
        .service-card {
            background-color: #0f292b;
            border-radius: 10px;
            padding: 20px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        .service-name {
            font-size: 1.2em;
            font-weight: bold;
            margin-bottom: 10px;
        }
        .status-indicator {
            display: inline-block;
            width: 10px;
            height: 10px;
            border-radius: 50%;
            margin-right: 5px;
        }
        .stats {
            margin-top: 15px;
            font-size: 0.9em;
        }
        .history-graph {
            margin-top: 20px;
            height: 50px;
            display: flex;
            align-items: flex-end;
        }
        .history-bar {
            flex: 1;
            margin: 0 1px;
            transition: height 0.3s ease;
        }
        footer {
            text-align: center;
            margin-top: 40px;
            font-style: italic;
        }
    </style>
    </head>
<body>
    <div class="container">
        <header>
            <h1>status.adabit.org</h1>
        </header>
        <main class="content">
  `;
  
  statuses.forEach(site => {
    const statusColor = getStatusColor(site.currentStatus);
    const historyBars = site.history.map(record => {
      const height = record.response_time ? Math.min(100, record.response_time / 10) : 0;
      return `<div class="history-bar" style="height: ${height}%; background-color: ${getStatusColor(record.status)};"></div>`;
    }).join('');

    html += `
      <div class="service-card">
        <div class="service-name">
          <span class="status-indicator" style="background-color: ${statusColor};"></span>
          ${site.name}
        </div>
        <div>Status: ${site.currentStatus}</div>
        <div>Response Time: ${site.responseTime ? `${site.responseTime}ms` : 'N/A'}</div>
        <div class="stats">
          <div>Uptime: ${site.uptime}%</div>
          <div>Avg Response Time: ${site.avgResponseTime}ms</div>
        </div>
        <div class="history-graph">
          ${historyBars}
        </div>
      </div>
    `;
  });
  
  html += `
        </main>
        <footer>
            <p>trans rights are human rights</p>
        </footer>
    </div>
    <script>
      // Refresh the page every 3 minutes
      setTimeout(() => location.reload(), 3 * 60 * 1000);
    </script>
</body>
</html>
  `;
  
  res.send(html);
});

app.listen(port, () => {
  console.log(` app listening at http://localhost:${port}`);
});

