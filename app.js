// Main application logic
let socket = null;
let currentUser = null;
let tasks = [];
let prizes = [];
let settings = {};
let currentView = 'tasks';
let games = [];
let gameWindow = null;
let timerWindow = null;
let serverUrl = '';
let recentServers = JSON.parse(localStorage.getItem('recentServers') || '[]');

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
  const savedServer = localStorage.getItem('serverAddress');
  const savedHttps = localStorage.getItem('useHttps') === 'true';
  const savedUserId = localStorage.getItem('userId');
  const savedUsername = localStorage.getItem('username');
  
  // Hide all screens initially
  document.getElementById('serverScreen').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('mainScreen').style.display = 'none';
  
  // Check if page is loaded over HTTPS
  if (window.location.protocol === 'https:') {
    document.getElementById('useHttps').checked = true;
    showProtocolWarning();
  }
  
  if (savedServer) {
    // Auto-connect to saved server
    const protocol = savedHttps ? 'https://' : 'http://';
    serverUrl = protocol + savedServer;
    
    if (savedUserId && savedUsername) {
      currentUser = { id: savedUserId, username: savedUsername };
      initializeSocket();
      showMainScreen();
    } else {
      document.getElementById('serverScreen').style.display = 'none';
      document.getElementById('loginScreen').style.display = 'block';
      document.getElementById('connectedServer').textContent = savedServer;
    }
  } else {
    document.getElementById('serverScreen').style.display = 'block';
    loadRecentServers();
  }
  
  // Enter key handlers
  document.getElementById('serverAddress')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') connectToServer();
  });
  
  document.getElementById('username')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') login();
  });
});

// Show protocol warning if page is HTTPS
function showProtocolWarning() {
  const warningDiv = document.getElementById('protocolWarning');
  if (warningDiv && window.location.protocol === 'https:') {
    warningDiv.style.display = 'block';
  }
}

// Load recent servers
function loadRecentServers() {
  const list = document.getElementById('recentServersList');
  const section = document.getElementById('recentServers');
  
  if (recentServers.length === 0) {
    section.style.display = 'none';
    return;
  }
  
  section.style.display = 'block';
  list.innerHTML = recentServers.map((server, i) => `
    <div style="padding: 8px; background: #f5f5f5; margin: 5px 0; border-radius: 4px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;" 
         onclick="selectRecentServer(${i})">
      <span>${server.useHttps ? '🔒' : '🔓'} ${server.address}</span>
      <span onclick="removeRecentServer(${i}, event)" style="color: #999; padding: 0 8px; cursor: pointer;">&times;</span>
    </div>
  `).join('');
}

function selectRecentServer(index) {
  const server = recentServers[index];
  document.getElementById('serverAddress').value = server.address;
  document.getElementById('useHttps').checked = server.useHttps;
}

function removeRecentServer(index, event) {
  event.stopPropagation();
  recentServers.splice(index, 1);
  localStorage.setItem('recentServers', JSON.stringify(recentServers));
  loadRecentServers();
}

// Connect to server
async function connectToServer() {
  const address = document.getElementById('serverAddress').value.trim();
  const useHttps = document.getElementById('useHttps').checked;
  
  if (!address) {
    document.getElementById('serverError').textContent = 'Please enter a server address';
    return;
  }
  
  // Check for mixed content issue
  if (window.location.protocol === 'https:' && !useHttps) {
    document.getElementById('serverError').innerHTML = 
      '⚠️ <strong>Mixed Content Error:</strong> This page is loaded over HTTPS, but you\'re trying to connect to an HTTP server. ' +
      'Please either:<br>1. Enable "Use HTTPS" checkbox above, or<br>2. Access this page via HTTP instead (e.g., open the HTML file locally or use http:// hosting)';
    return;
  }
  
  const protocol = useHttps ? 'https://' : 'http://';
  serverUrl = protocol + address;
  
  try {
    const res = await fetch(`${serverUrl}/api/settings`);
    if (!res.ok) throw new Error('Connection failed');
    
    // Save server info
    localStorage.setItem('serverAddress', address);
    localStorage.setItem('useHttps', useHttps);
    
    // Add to recent servers
    const server = { address, useHttps, lastUsed: Date.now() };
    recentServers = recentServers.filter(s => s.address !== address);
    recentServers.unshift(server);
    recentServers = recentServers.slice(0, 5);
    localStorage.setItem('recentServers', JSON.stringify(recentServers));
    
    // Show login screen
    document.getElementById('serverScreen').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'block';
    document.getElementById('connectedServer').textContent = address;
    document.getElementById('serverError').textContent = '';
    
  } catch (err) {
    console.error('Connection error:', err);
    let errorMsg = 'Unable to connect to server. ';
    
    if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
      errorMsg += 'Please check:<br>• Server address is correct<br>• Server is running<br>• No firewall is blocking the connection';
      if (window.location.protocol === 'https:' && !useHttps) {
        errorMsg += '<br>• Try enabling "Use HTTPS" or access this page via HTTP';
      }
    } else {
      errorMsg += err.message;
    }
    
    document.getElementById('serverError').innerHTML = errorMsg;
  }
}

// Change server (logout and return to server selection)
function changeServer() {
  localStorage.removeItem('userId');
  localStorage.removeItem('username');
  localStorage.removeItem('serverAddress');
  localStorage.removeItem('useHttps');
  currentUser = null;
  if (socket) socket.disconnect();
  location.reload();
}

// Initialize socket connection
function initializeSocket() {
  socket = io(serverUrl);
  
  // Socket event listeners
  socket.on('pointsUpdate', (data) => {
    if (data.userId === currentUser.id) {
      const points = parseInt(data.points) || 0;
      document.getElementById('userPointsHeader').textContent = points;
    }
  });
  
  socket.on('gradeReceived', (data) => {
    if (data.userId !== currentUser.id) return;
    
    let message = `Grade: ${data.grade}`;
    if (data.feedback) message += `\nFeedback: ${data.feedback}`;
    if (data.pointsEarned) {
      message += `\n\nPoints earned: +${data.pointsEarned}`;
      const totalPoints = parseInt(data.totalPoints) || 0;
      document.getElementById('userPointsHeader').textContent = totalPoints;
    }
    
    showNotification(`Grade Received: ${data.taskTitle}`, message, data.grade === 'pass' || data.grade >= 70 ? 'success' : 'warning');
    loadTasks();
  });
  
  socket.on('taskUpdate', (data) => {
    if (data.userId === currentUser.id) {
      loadTasks();
    }
  });
  
  socket.on('prizeUseApproved', (data) => {
    if (data.userId === currentUser.id) {
      showNotification('Prize Use Approved', `Your request to use "${data.prizeName}" has been approved!`, 'success');
    }
  });
  
  socket.on('settingsUpdate', (newSettings) => {
    settings = newSettings;
    loadSettings();
  });
  
  socket.on('prizesUpdate', () => {
    if (currentView === 'shop') {
      loadShopInline();
    }
  });
  
  socket.on('chatMessage', (msg) => {
    const chatBox = document.getElementById('chatMessages');
    const chatView = document.getElementById('chatMessagesView');
    const msgEl = document.createElement('div');
    msgEl.className = 'chat-message';
    msgEl.innerHTML = `<strong>${msg.from}:</strong> ${msg.message}`;
    
    if (chatBox) {
      chatBox.appendChild(msgEl.cloneNode(true));
      chatBox.scrollTop = chatBox.scrollHeight;
    }
    
    if (chatView) {
      chatView.appendChild(msgEl);
      chatView.scrollTop = chatView.scrollHeight;
    }
  });
  
  socket.on('chatHistory', (messages) => {
    const chatBox = document.getElementById('chatMessages');
    const chatView = document.getElementById('chatMessagesView');
    const html = messages.map(m => 
      `<div class="chat-message"><strong>${m.from}:</strong> ${m.message}</div>`
    ).join('');
    
    if (chatBox) {
      chatBox.innerHTML = html;
      chatBox.scrollTop = chatBox.scrollHeight;
    }
    
    if (chatView) {
      chatView.innerHTML = html;
      chatView.scrollTop = chatView.scrollHeight;
    }
  });
}

// Notification system
function showNotification(title, message, type = 'success') {
  const notif = document.createElement('div');
  notif.className = `notification ${type}`;
  notif.innerHTML = `
    <span class="close-notif" onclick="this.parentElement.remove()">&times;</span>
    <h4>${title}</h4>
    <p>${message}</p>
  `;
  document.body.appendChild(notif);
  
  setTimeout(() => {
    if (notif.parentElement) {
      notif.remove();
    }
  }, 5000);
}

// Login
async function login() {
  const username = document.getElementById('username').value.trim();
  if (!username) {
    document.getElementById('loginError').textContent = 'Please enter a username';
    return;
  }
  
  try {
    const res = await fetch(`${serverUrl}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    });
    
    const data = await res.json();
    if (data.success) {
      currentUser = data.user;
      localStorage.setItem('userId', currentUser.id);
      localStorage.setItem('username', currentUser.username);
      initializeSocket();
      showMainScreen();
    } else {
      document.getElementById('loginError').textContent = data.error || 'Error logging in';
    }
  } catch (err) {
    document.getElementById('loginError').textContent = 'Connection error';
  }
}

function showMainScreen() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('mainScreen').style.display = 'block';
  document.getElementById('welcomeText').textContent = `Welcome, ${currentUser.username}!`;
  document.getElementById('serverInfo').textContent = `Connected to: ${localStorage.getItem('serverAddress')}`;
  loadTasks();
  loadSettings();
  loadUserData();
}

// Settings and data loading
async function loadSettings() {
  const res = await fetch(`${serverUrl}/api/settings`);
  settings = await res.json();
  
  if (settings.chatEnabled) {
    document.getElementById('chatNavBtn').style.display = 'block';
  } else {
    document.getElementById('chatNavBtn').style.display = 'none';
  }
  
  if (settings.pointsMode) {
    document.getElementById('headerPoints').style.display = 'block';
    document.getElementById('shopNavBtn').style.display = 'block';
    document.getElementById('inventoryNavBtn').style.display = 'block';
    document.getElementById('gamesNavBtn').style.display = 'block';
  } else {
    document.getElementById('shopNavBtn').style.display = 'none';
    document.getElementById('inventoryNavBtn').style.display = 'none';
    document.getElementById('gamesNavBtn').style.display = 'none';
  }
}

async function loadUserData() {
  const res = await fetch(`${serverUrl}/api/user/${currentUser.id}`);
  const userData = await res.json();
  const points = parseInt(userData.points) || 0;
  document.getElementById('userPointsHeader').textContent = points;
}

async function loadTasks() {
  const res = await fetch(`${serverUrl}/api/tasks?userId=${currentUser.id}`);
  tasks = await res.json();
  renderTasks();
}

function renderTasks() {
  const grid = document.getElementById('taskGrid');
  const empty = document.getElementById('emptyState');
  
  if (tasks.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  
  empty.style.display = 'none';
  grid.innerHTML = tasks.map(task => {
    let statusBadge = '';
    let statusClass = '';
    
    if (task.status === 'resource') {
      statusBadge = '<span class="task-status" style="background: #17a2b8;">Resource</span>';
      statusClass = 'resource';
    } else if (task.status === 'completed') {
      statusBadge = '<span class="task-status completed">Completed</span>';
      statusClass = 'completed';
    } else if (task.status === 'failed') {
      statusBadge = '<span class="task-status" style="background: #dc3545;">Failed</span>';
      statusClass = 'failed';
    } else if (task.status === 'pending') {
      statusBadge = '<span class="task-status pending">Pending</span>';
      statusClass = 'pending';
    } else {
      statusBadge = '<span class="task-status available">New</span>';
      statusClass = 'available';
    }
    
    return `
    <div class="task-card ${statusClass}" onclick="openTask('${task.id}')">
      ${statusBadge}
      <h3>${task.title}</h3>
      <p>${task.description}</p>
      <div>
        <span class="task-type">${task.type}</span>
        ${settings.pointsMode && task.points && task.status !== 'resource' ? `<span class="task-points">+${task.points} pts</span>` : ''}
      </div>
    </div>
  `;
  }).join('');
}

// View navigation
function showView(view) {
  currentView = view;
  
  document.querySelectorAll('.view-content').forEach(v => v.style.display = 'none');
  document.querySelectorAll('.sidebar-nav button').forEach(b => b.classList.remove('active'));
  
  if (view === 'tasks') {
    document.getElementById('tasksView').style.display = 'block';
    document.querySelector('.sidebar-nav button:nth-child(1)').classList.add('active');
  } else if (view === 'shop') {
    document.getElementById('shopView').style.display = 'block';
    document.getElementById('shopNavBtn').classList.add('active');
    loadShopInline();
  } else if (view === 'inventory') {
    document.getElementById('inventoryView').style.display = 'block';
    document.getElementById('inventoryNavBtn').classList.add('active');
    loadInventoryInline();
  } else if (view === 'games') {
    document.getElementById('gamesView').style.display = 'block';
    document.getElementById('gamesNavBtn').classList.add('active');
    loadGamesInline();
  } else if (view === 'chat') {
    document.getElementById('chatView').style.display = 'block';
    document.getElementById('chatNavBtn').classList.add('active');
  }
}

// Shop
async function loadShopInline() {
  const res = await fetch(`${serverUrl}/api/prizes`);
  prizes = await res.json();
  
  const userData = await fetch(`${serverUrl}/api/user/${currentUser.id}`);
  const user = await userData.json();
  
  const grid = document.getElementById('shopGrid');
  grid.innerHTML = prizes.map(prize => `
    <div class="shop-item">
      ${prize.image ? `<img src="${prize.image}" alt="${prize.name}">` : ''}
      <h3>${prize.name}</h3>
      <p>${prize.description || ''}</p>
      <div class="price">${prize.cost} points</div>
      <button onclick="buyPrize('${prize.id}', ${prize.cost})" ${user.points < prize.cost ? 'disabled' : ''}>
        ${user.points < prize.cost ? 'Not enough points' : 'Buy Now'}
      </button>
    </div>
  `).join('');
}

async function buyPrize(prizeId, cost) {
  const res = await fetch(`${serverUrl}/api/purchase/${prizeId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: currentUser.id })
  });
  
  if (res.ok) {
    const data = await res.json();
    showNotification('Purchase Successful', 'Prize purchased successfully!', 'success');
    loadUserData();
    loadShopInline();
  } else {
    showNotification('Purchase Failed', 'Unable to purchase prize', 'error');
  }
}

// Inventory
async function loadInventoryInline() {
  const res = await fetch(`${serverUrl}/api/user/${currentUser.id}`);
  const user = await res.json();
  
  const grid = document.getElementById('inventoryGrid');
  if (user.inventory.length === 0) {
    grid.innerHTML = '<div class="empty-state"><p>Your inventory is empty</p></div>';
  } else {
    grid.innerHTML = user.inventory.map(item => `
      <div class="inventory-item">
        ${item.image ? `<img src="${item.image}" alt="${item.name}">` : ''}
        <h3>${item.name}</h3>
        <p>${item.description || ''}</p>
        <p><strong>Type:</strong> ${item.type === 'irl' ? 'IRL' : 'Digital'}</p>
        <div class="inventory-actions">
          <button onclick="usePrize('${item.inventoryId}', '${item.type}', '${item.link}', '${item.message}')">Use</button>
          ${item.sellback > 0 ? `<button onclick="sellItem('${item.inventoryId}')" class="secondary">Sell (${item.sellback} pts)</button>` : ''}
        </div>
      </div>
    `).join('');
  }
}

async function usePrize(inventoryId, type, link, message) {
  const res = await fetch(`${serverUrl}/api/use-prize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: currentUser.id, inventoryId })
  });
  
  const result = await res.json();
  
  if (result.type === 'digital') {
    window.open(result.link, '_blank');
    setTimeout(() => {
      showNotification('Digital Reward', result.message, 'success');
    }, 500);
  } else {
    showNotification('Use Request Sent', result.message, 'success');
  }
  
  await loadInventoryInline();
  await loadUserData();
}

async function sellItem(inventoryId) {
  const res = await fetch(`${serverUrl}/api/sell/${inventoryId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: currentUser.id })
  });
  
  if (res.ok) {
    const data = await res.json();
    showNotification('Item Sold', 'Item sold successfully!', 'success');
    loadUserData();
    loadInventoryInline();
  }
}

// Games
async function loadGamesInline() {
  const res = await fetch(`${serverUrl}/api/games`);
  games = await res.json();
  
  const userData = await fetch(`${serverUrl}/api/user/${currentUser.id}`);
  const user = await userData.json();
  
  const grid = document.getElementById('gamesGrid');
  if (games.length === 0) {
    grid.innerHTML = '<div class="empty-state"><p>No games available</p></div>';
  } else {
    grid.innerHTML = games.map(game => `
      <div class="shop-item">
        <h3>${game.name}</h3>
        <p>${game.url}</p>
        <div class="price">${game.costPerMinute} points per minute</div>
        <label>Minutes: <input type="number" id="minutes_${game.id}" value="10" min="1" max="120"></label>
        <button onclick="buyGameTime('${game.id}', '${game.name}', '${game.url}', ${game.costPerMinute})">Buy Time</button>
      </div>
    `).join('');
  }
}

async function buyGameTime(gameId, gameName, gameUrl, costPerMinute) {
  let minutes = parseInt(document.getElementById(`minutes_${gameId}`).value);
  if (!minutes || minutes < 1) minutes = 1;

  const res = await fetch(`${serverUrl}/api/buy-game-time`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: currentUser.id, gameId, minutes })
  });

  const data = await res.json();

  if (!res.ok) {
    showNotification('Insufficient Points', data.error || 'Not enough points', 'error');
    return;
  }

  openGameWithTimer(gameName, gameUrl, minutes, costPerMinute, gameId);
  showNotification('Game Time Purchased', `${minutes} minutes of ${gameName} started!`, 'success');
  setTimeout(loadUserData, 500);
}

function openGameWithTimer(gameName, gameUrl, minutes, costPerMinute, gameId) {
  if (gameWindow && !gameWindow.closed) gameWindow.close();
  if (timerWindow && !timerWindow.closed) timerWindow.close();
  
  gameWindow = window.open(gameUrl, 'gameWindow', 'width=1200,height=800');
  
  const timerHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Timer - ${gameName}</title>
      <style>
        body { font-family: system-ui; text-align: center; padding: 40px; background: #f5f5f5; }
        #timer { font-size: 72px; font-weight: bold; color: #007bff; margin: 20px 0; }
        .game-info { font-size: 18px; color: #666; margin: 10px 0; }
      </style>
    </head>
    <body>
      <h1>${gameName}</h1>
      <div id="timer">${minutes}:00</div>
      <div class="game-info">Enjoy your game time!</div>
      <script>
        let totalSeconds = ${minutes * 60};
        
        function updateTimer() {
          const mins = Math.floor(totalSeconds / 60);
          const secs = totalSeconds % 60;
          document.getElementById('timer').textContent = 
            mins + ':' + (secs < 10 ? '0' : '') + secs;
          
          if (totalSeconds <= 0) {
            window.close();
          } else {
            totalSeconds--;
          }
        }
        
        setInterval(updateTimer, 1000);
        window.addSeconds = function(sec) { totalSeconds += sec; };
      </script>
    </body>
    </html>
  `;
  
  timerWindow = window.open('', 'timerWindow', 'width=400,height=300');
  timerWindow.document.write(timerHTML);
  timerWindow.document.close();
}

window.closeGameWindows = function() {
  if (gameWindow && !gameWindow.closed) gameWindow.close();
  if (timerWindow && !timerWindow.closed) timerWindow.close();
};

// Chat
function toggleChat() {
  const chat = document.getElementById('chatBox');
  const toggle = document.getElementById('chatToggle');
  chat.classList.toggle('minimized');
  toggle.textContent = chat.classList.contains('minimized') ? '▼' : '▲';
}

function sendMessage() {
  const input = document.getElementById('chatInput');
  const msg = input.value.trim();
  if (!msg) return;
  
  socket.emit('chatMessage', { from: currentUser.username, message: msg });
  input.value = '';
}

function sendMessageView() {
  const input = document.getElementById('chatInputView');
  const msg = input.value.trim();
  if (!msg) return;
  
  socket.emit('chatMessage', { from: currentUser.username, message: msg });
  input.value = '';
}

document.getElementById('chatInput')?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});

document.getElementById('chatInputView')?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessageView();
});

function closeModal() {
  document.getElementById('taskModal').style.display = 'none';
}

function closeShopModal() {
  document.getElementById('shopModal').style.display = 'none';
}

function closeInventoryModal() {
  document.getElementById('inventoryModal').style.display = 'none';
}