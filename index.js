const express = require('express');
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const app = express();
const port = 3001;
const moment = require('moment-timezone');
const fs = require('fs');
const path = require('path');

// Load configuration
const configFilePath = path.resolve(__dirname, 'config.json');
let sites = [];

try {
  const config = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
  sites = config.sites || [];
} catch (err) {
  console.error('Error loading config file:', err.message);
}

const db = new sqlite3.Database('./status.db', (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
    createTable();
  }
});

function createTable() {
  db.run(`CREATE TABLE IF NOT EXISTS status_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site_name TEXT NOT NULL,
    status TEXT NOT NULL,
    response_time INTEGER,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) {
      console.error('Error creating table:', err.message);
    } else {
      console.log('status_history table created or already exists.');
    }
  });
}


async function checkStatus(url) {
  try {
    const startTime = Date.now();
    const response = await axios.get(url, { timeout: 5000 });
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    return { status: 'UP', responseTime };
  } catch (error) {
    console.error(`Error checking ${url}:`, error.message);
    return { status: 'DOWN', responseTime: null };
  }
}

async function updateStatus() {
  console.log('Updating status...');
  for (const site of sites) {
    try {
      const { status, responseTime } = await checkStatus(site.url);
      db.run('INSERT INTO status_history (site_name, status, response_time) VALUES (?, ?, ?)',
        [site.name, status, responseTime], function(err) {
          if (err) {
            console.error(`Error inserting status for ${site.name}:`, err.message);
          } else {
            console.log(`Status updated for ${site.name}: ${status}, ${responseTime}ms`);
          }
        });
    } catch (error) {
      console.error(`Error updating status for ${site.name}:`, error.message);
    }
  }
  console.log('Status update complete.');
}

updateStatus();

setInterval(updateStatus, 30 * 1000);

function getStatusColor(status) {
  return status === 'UP' ? 'var(--color-green)' : 'var(--color-red)';
}

app.get('/', async (req, res) => {
  try {
    const statusPromises = sites.map(async (site) => {
      return new Promise((resolve, reject) => {
        db.all('SELECT status, response_time, timestamp FROM status_history WHERE site_name = ? ORDER BY timestamp DESC LIMIT 120',
          [site.name], (err, rows) => {
            if (err) {
              console.error(`Error fetching data for ${site.name}:`, err.message);
              reject(err);
            } else {
              const recentStatus = rows[0] || { status: 'UNKNOWN', response_time: null };
              const upChecks = rows.filter(record => record.status === 'UP').length;
              const uptimePercentage = rows.length > 0 ? (upChecks / rows.length * 100).toFixed(2) : '100.00';
              const validResponseTimes = rows.filter(record => record.response_time !== null);
              const avgResponseTime = validResponseTimes.length > 0
                ? (validResponseTimes.reduce((sum, record) => sum + record.response_time, 0) / validResponseTimes.length).toFixed(2)
                : 'N/A';

              resolve({
                name: site.name,
                url: site.url,
                currentStatus: recentStatus.status,
                responseTime: recentStatus.response_time,
                uptime: uptimePercentage,
                avgResponseTime,
                history: rows.reverse().map(record => ({
                  ...record,
                  timestamp: moment(record.timestamp).format()
                }))
              });
            }
          });
      });
    });

    const statuses = await Promise.all(statusPromises);

    let html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>adabit status</title>
          <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
          <script src="https://poweredge.xyz/moment.min.js"></script>
          <script src="https://poweredge.xyz/moment-timezone-with-data.min.js"></script>
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
                height: 100px;
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
    
    statuses.forEach((site, index) => {
        const statusColor = getStatusColor(site.currentStatus);
        
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
                    <canvas id="chart-${index}"></canvas>
                </div>
            </div>
        `;
    
        html += `
        <script>
            (function() {
                const data = ${JSON.stringify(site.history)};
                const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
                const labels = data.map(record => moment(record.timestamp).tz(userTimezone).format('HH:mm:ss'));
                const datapoints = data.map(record => record.response_time);

                new Chart(document.getElementById('chart-${index}'), {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: 'Response Time',
                            data: datapoints,
                            fill: true,
                            borderColor: '#43b581',
                            cubicInterpolationMode: 'monotone',
                            tension: 0.2,
                            pointBorderWidth: 0
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            x: {
                                display: false
                            },
                            y: {
                                beginAtZero: true
                            }
                        },
                        plugins: {
                            legend: {
                                display: false
                            },
                            tooltip: {
                                callbacks: {
                                    title: function(context) {
                                        const index = context[0].dataIndex;
                                        return moment(data[index].timestamp).tz(userTimezone).format('YYYY-MM-DD HH:mm:ss');
                                    }
                                }
                            }
                        }
                    }
                });
            })();
        </script>
        `;
    });
    
    html += `
            </main>
            <footer>
                <p>trans rights are human rights</p>
            </footer>
        </div>
        <script>
            // Check for new data every 30 seconds
            const checkForNewData = async () => {
                const response = await fetch('/');
                const newData = await response.text();
                if (newData !== document.documentElement.outerHTML) {
                    location.reload();
                }
            };
            setInterval(checkForNewData, 30 * 1000);
        </script>
    </body>
    </html>
    `;
    
    // Send the HTML response
    res.send(html);
  } catch (error) {
    console.error('Error generating status page:', error.message);
    res.status(500).send('An error occurred while generating the status page');
  }
});

app.listen(port, () => {
  console.log(`App listening at http://localhost:${port}`);
});
