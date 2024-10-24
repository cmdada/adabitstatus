const express = require('express');
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const app = express();
const port = 3001;
const moment = require('moment-timezone');
const fs = require('fs');
const path = require('path');
const { marked } = require('marked');
const { archiver } = require('archiver');

// Load configuration
const configFilePath = path.resolve(__dirname, 'config.json');
let sites = [];

try {
  const config = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
  sites = config.sites || [];
} catch (err) {
  console.error('Error loading config file:', err.message);
}

// Initialize database
const db = new sqlite3.Database('./status.db', (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
    createTable();
  }
});

// Configure marked for safe rendering
marked.setOptions({
  headerIds: false,
  mangle: false
});

// Serve static files from the current directory
app.use(express.static(__dirname, {
  setHeaders: (res, path) => {
    if (path.endsWith('.js')) {
      res.set('Content-Type', 'application/javascript');
    }
    else if (path.endsWith('.json')) {
      res.set('Content-Type', 'application/json');
    }
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'SAMEORIGIN');
  },
  dotfiles: 'deny',
  index: false
}));

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

// Download all files as zip
app.get('/download-all', (req, res) => {
  const archive = archiver('zip', {
    zlib: { level: 9 }
  });

  res.attachment('source-files.zip');
  archive.pipe(res);

  const files = fs.readdirSync(__dirname).filter(file => !file.startsWith('.'));
  
  files.forEach(file => {
    const filePath = path.join(__dirname, file);
    if (fs.statSync(filePath).isFile()) {
      archive.file(filePath, { name: file });
    }
  });

  archive.finalize();
});

// File browser route with enhanced features
app.get('/files', async (req, res) => {
  try {
    const files = fs.readdirSync(__dirname);
    const safeFiles = files.filter(file => !file.startsWith('.') && !file.startsWith('node_modules'));
    
    const fileDetails = safeFiles.map(file => {
      const filePath = path.join(__dirname, file);
      const stats = fs.statSync(filePath);
      return {
        name: file,
        size: stats.size,
        modified: stats.mtime,
        isDirectory: stats.isDirectory(),
        type: path.extname(file).toLowerCase()
      };
    });

    // Sort files
    const sortBy = req.query.sort || 'name';
    const sortOrder = req.query.order === 'desc' ? -1 : 1;
    
    fileDetails.sort((a, b) => {
      // Directories always come first
      if (a.isDirectory !== b.isDirectory) {
        return b.isDirectory ? 1 : -1;
      }
      
      switch (sortBy) {
        case 'size':
          return (a.size - b.size) * sortOrder;
        case 'modified':
          return (a.modified - b.modified) * sortOrder;
        default:
          return a.name.localeCompare(b.name) * sortOrder;
      }
    });

    // Check for README.md
    let readmeContent = '';
    if (fs.existsSync(path.join(__dirname, 'README.md'))) {
      readmeContent = marked(fs.readFileSync(path.join(__dirname, 'README.md'), 'utf8'));
    }

    let html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>File Browser</title>
          <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.2.0/github-markdown-dark.min.css">
          <style>
            :root {
                --color-background: #0d1117;
                --color-foreground: #161b22;
                --color-text: #c9d1d9;
                --color-link: #58a6ff;
                --color-border: #30363d;
                --color-hover: #1f2937;
            }
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
                background-color: var(--color-background);
                color: var(--color-text);
                margin: 0;
                padding: 20px;
                line-height: 1.6;
            }
            .container {
                max-width: 1012px;
                margin: 0 auto;
            }
            .header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
                padding: 16px;
                background-color: var(--color-foreground);
                border: 1px solid var(--color-border);
                border-radius: 6px;
            }
            .download-all {
                padding: 5px 16px;
                font-size: 14px;
                font-weight: 500;
                line-height: 20px;
                color: var(--color-text);
                background-color: #238636;
                border: 1px solid rgba(240,246,252,0.1);
                border-radius: 6px;
                cursor: pointer;
                text-decoration: none;
            }
            .download-all:hover {
                background-color: #2ea043;
            }
            .file-browser {
                background-color: var(--color-foreground);
                border: 1px solid var(--color-border);
                border-radius: 6px;
                overflow: hidden;
            }
            .file-table {
                width: 100%;
                border-collapse: collapse;
            }
            .file-table th {
                padding: 16px;
                background-color: var(--color-background);
                border-bottom: 1px solid var(--color-border);
                text-align: left;
                font-weight: 600;
                cursor: pointer;
            }
            .file-table td {
                padding: 8px 16px;
                border-bottom: 1px solid var(--color-border);
            }
            .file-table tr:hover {
                background-color: var(--color-hover);
            }
            .file-link {
                color: var(--color-link);
                text-decoration: none;
            }
            .file-link:hover {
                text-decoration: underline;
            }
            .file-icon {
                margin-right: 8px;
            }
            .readme {
                margin-top: 20px;
                padding: 16px;
                background-color: var(--color-foreground);
                border: 1px solid var(--color-border);
                border-radius: 6px;
            }
            .sort-icon::after {
                content: "↓";
                margin-left: 4px;
                opacity: 0.5;
            }
            .sort-icon.desc::after {
                content: "↑";
            }
            .markdown-body {
                background-color: transparent;
            }
          </style>
      </head>
      <body>
          <div class="container">
              ${readmeContent ? `
                  <div class="readme">
                      <div class="markdown-body">
                          ${readmeContent}
                      </div>
                  </div>
              ` : ''}
			  <br></br>
              <div class="file-browser">
                  <table class="file-table">
                      <thead>
                          <tr>
                              <th class="sort-icon ${sortBy === 'name' ? sortOrder === -1 ? 'desc' : '' : ''}"
                                  onclick="window.location.href='/files?sort=name&order=${sortBy === 'name' && sortOrder === 1 ? 'desc' : 'asc'}'">
                                  Name
                              </th>
                              <th class="sort-icon ${sortBy === 'size' ? sortOrder === -1 ? 'desc' : '' : ''}"
                                  onclick="window.location.href='/files?sort=size&order=${sortBy === 'size' && sortOrder === 1 ? 'desc' : 'asc'}'">
                                  Size
                              </th>
                              <th class="sort-icon ${sortBy === 'modified' ? sortOrder === -1 ? 'desc' : '' : ''}"
                                  onclick="window.location.href='/files?sort=modified&order=${sortBy === 'modified' && sortOrder === 1 ? 'desc' : 'asc'}'">
                                  Last Modified
                              </th>
                          </tr>
                      </thead>
                      <tbody>
                          ${fileDetails.map(file => `
                              <tr>
                                  <td>
                                      <a href="/${file.name}" class="file-link">
                                          ${file.name}
                                      </a>
                                  </td>
                                  <td>${moment(file.modified).format('MMM D, YYYY HH:mm')}</td>
                              </tr>
                          `).join('')}
                      </tbody>
                  </table>
              </div>
          </div>
          <script>
          function getFileIcon(type) {
              switch(type) {
                  case '.js': return '📄';
                  case '.json': return '📄';
                  case '.md': return '📝';
                  case '.css': return '🎨';
                  case '.html': return '🌐';
                  case '.db': return '💾';
                  default: return '📄';
              }
          }

          function formatFileSize(bytes) {
              if (bytes === 0) return '0 B';
              const k = 1024;
              const sizes = ['B', 'KB', 'MB', 'GB'];
              const i = Math.floor(Math.log(bytes) / Math.log(k));
              return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
          }
          </script>
      </body>
      </html>
    `;
    
    res.send(html);
  } catch (error) {
    console.error('Error in file browser:', error);
    res.status(500).send('Error reading directory');
  }
});

function getStatusColor(status) {
  return status === 'UP' ? 'var(--color-green)' : 'var(--color-red)';
}

// Main status page route
app.get('/', async (req, res) => {
  const userAgent = req.get('User-Agent');
  
  if (userAgent && userAgent.includes('WiiU')) {
    res.send('Hello, WiiU user');
    return;
  }

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

    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>adabit</title>
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
                        ${statuses.map((site, index) => `
                            <div class="service-card">
                                <div class="service-name">
                                    <span class="status-indicator" style="background-color: ${getStatusColor(site.currentStatus)};"></span>
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
                        `).join('')}
                        </main>
                        <footer>
                            <p>trans rights are human rights <a href="/files">Source Files</a></p>
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
              
              res.send(html);
            } catch (error) {
              console.error('Error generating status page:', error.message);
              res.status(500).send('An error occurred while generating the status page');
            }
          });
          
          // Start the status update interval
          updateStatus();
          setInterval(updateStatus, 30 * 1000);
          
          app.listen(port, () => {
            console.log(`App listening at http://localhost:${port}`);
          });
          
          // Graceful shutdown
          process.on('SIGINT', () => {
            db.close((err) => {
              if (err) {
                console.error('Error closing database:', err.message);
              } else {
                console.log('Database connection closed.');
              }
              process.exit(0);
            });
          });
