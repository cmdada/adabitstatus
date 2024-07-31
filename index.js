const express = require('express');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const app = express();
const port = 3000;

const db = new sqlite3.Database(':memory:');
const authDb = new sqlite3.Database(':memory:');

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Create tables
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS user_preferences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    data_limit INTEGER,
    update_interval INTEGER,
    sites TEXT
  )`);

  authDb.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
  )`);
});

// Routes
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Login</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
            }
            .login-container {
                border: 1px solid #ccc;
                padding: 1rem;
                border-radius: 5px;
                box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
            }
            input {
                display: block;
                width: 100%;
                margin-bottom: 1rem;
                padding: 0.5rem;
                font-size: 1rem;
            }
            button {
                background-color: #007bff;
                color: white;
                border: none;
                padding: 0.5rem;
                font-size: 1rem;
                cursor: pointer;
            }
            button:hover {
                background-color: #0056b3;
            }
        </style>
    </head>
    <body>
        <div class="login-container">
            <h1>Login</h1>
            <form action="/login" method="POST">
                <input type="text" name="username" placeholder="Username" required>
                <input type="password" name="password" placeholder="Password" required>
                <button type="submit">Login</button>
            </form>
        </div>
    </body>
    </html>
  `);
});

app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    authDb.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword], function (err) {
      if (err) {
        console.error('Error registering user:', err.message);
        res.status(500).json({ error: 'Error registering user' });
      } else {
        db.run('INSERT INTO user_preferences (username) VALUES (?)', [username], function (err) {
          if (err) {
            console.error('Error creating user preferences:', err.message);
          }
        });
        res.json({ message: 'User registered successfully' });
      }
    });
  } catch (error) {
    console.error('Error hashing password:', error);
    res.status(500).json({ error: 'Error registering user' });
  }
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  authDb.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
    if (err) {
      console.error('Error fetching user:', err.message);
      res.status(500).json({ error: 'Error logging in' });
    } else if (user && await bcrypt.compare(password, user.password)) {
      res.json({ message: 'Login successful' });
    } else {
      res.status(401).json({ error: 'Invalid username or password' });
    }
  });
});

app.get('/config', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Configuration</title>
    </head>
    <body>
        <form id="configForm">
            <label for="dataLimit">Data Limit:</label>
            <input type="number" id="dataLimit" name="data_limit" required>
            <label for="updateInterval">Update Interval:</label>
            <input type="number" id="updateInterval" name="update_interval" required>
            <label for="sites">Sites:</label>
            <textarea id="sites" name="sites" required></textarea>
            <button type="submit">Save</button>
        </form>
        <script>
            document.addEventListener('DOMContentLoaded', async () => {
                const response = await fetch('/config');
                const config = await response.json();
                document.getElementById('dataLimit').value = config.data_limit;
                document.getElementById('updateInterval').value = config.update_interval;
                document.getElementById('sites').value = config.sites;
            });

            document.getElementById('configForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                const config = Object.fromEntries(formData.entries());
                config.sites = JSON.parse(config.sites);

                const response = await fetch('/config', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(config),
                });

                if (response.ok) {
                    alert('Configuration saved successfully');
                } else {
                    alert('Error saving configuration');
                }
            });
        </script>
    </body>
    </html>
  `);
});

app.post('/config', (req, res) => {
  const { data_limit, update_interval, sites } = req.body;
  const config = { data_limit, update_interval, sites: JSON.stringify(sites) };
  db.run('UPDATE configuration SET data_limit = ?, update_interval = ?, sites = ? WHERE id = 1', 
    [config.data_limit, config.update_interval, config.sites], function (err) {
      if (err) {
        console.error('Error saving configuration:', err.message);
        res.status(500).json({ error: 'Error saving configuration' });
      } else {
        res.json({ message: 'Configuration saved successfully' });
      }
  });
});

app.listen(port, () => {
  console.log(`App listening at http://localhost:${port}`);
});

// Start the status update loop
(async function updateLoop() {
  try {
    const allPreferences = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM user_preferences', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    for (const preferences of allPreferences) {
      const sites = JSON.parse(preferences.sites);
      await updateStatus(sites);
    }

    const minInterval = Math.min(...allPreferences.map(p => p.update_interval), 30); // Default to 30 seconds if no preferences
    setTimeout(updateLoop, minInterval * 1000);
  } catch (error) {
    console.error('Error in update loop:', error);
    setTimeout(updateLoop, 30000); // Retry after 30 seconds in case of error
  }
})();
