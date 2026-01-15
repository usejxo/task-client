// Task-related functionality
let selectedChoice = null;
let quizData = null;
let currentPage = 0;
let quizAnswers = [];
let currentQuizAnswer = null;

function openTask(taskId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;
  
  if (task.status === 'completed') {
    showNotification('Task Completed', 'You have already completed this task.', 'warning');
    return;
  }
  
  if (task.status === 'resource') {
    document.getElementById('modalTitle').textContent = task.title;
    const body = document.getElementById('modalBody');
    body.innerHTML = `<p>${task.description}</p>
      ${task.instructions ? `<div style="margin-top: 15px; padding: 15px; background: #f8f9fa; border-radius: 4px;">
        ${task.instructions.replace(/\n/g, '<br>')}
      </div>` : ''}
      ${task.resourceContent ? `<div style="margin-top: 15px; padding: 15px; background: #e7f3ff; border-radius: 4px;">
        ${task.resourceContent.replace(/\n/g, '<br>')}
      </div>` : ''}
      <button onclick="closeModal()" style="margin-top: 15px;">Close</button>`;
    document.getElementById('taskModal').style.display = 'block';
    return;
  }
  
  document.getElementById('modalTitle').textContent = task.title;
  const body = document.getElementById('modalBody');
  
  let content = `<p>${task.description}</p>`;
  if (task.instructions) {
    content += `<div style="margin-top: 15px; padding: 15px; background: #f8f9fa; border-radius: 4px;">
      <strong>Instructions:</strong><br>${task.instructions.replace(/\n/g, '<br>')}
    </div>`;
  }
  
  if (task.type === 'question') {
    content += `
      <textarea id="answerInput" placeholder="Your answer..."></textarea>
      <button onclick="submitQuestion('${task.id}')">Submit Answer</button>
    `;
  } else if (task.type === 'multipleChoice') {
    content += `<div style="margin-top: 20px;">`;
    task.options.forEach(opt => {
      content += `<div class="quiz-option" onclick="selectChoice(this, '${opt}')">${opt}</div>`;
    });
    content += `</div><button onclick="submitMultipleChoice('${task.id}')" style="margin-top: 15px;">Submit Answer</button>`;
  } else if (task.type === 'poll') {
    content += `<div style="margin-top: 20px;">`;
    task.options.forEach(opt => {
      content += `<div class="quiz-option" onclick="selectChoice(this, '${opt}')">${opt}</div>`;
    });
    content += `</div><button onclick="submitPoll('${task.id}')" style="margin-top: 15px;">Submit Vote</button>
      <button onclick="showPollResults('${task.id}')" class="secondary" style="margin-top: 15px;">View Results</button>`;
  } else if (task.type === 'quiz') {
    content += `<div id="quizContainer"></div>`;
    setTimeout(() => startQuiz(task), 100);
  } else if (task.type === 'attachment') {
    content += `
      <textarea id="attachmentInput" placeholder="Describe what you're attaching or paste link..."></textarea>
      <button onclick="submitAttachment('${task.id}')">Submit</button>
    `;
  } else if (task.type === 'markAsDone') {
    content += `
      ${task.taskInstructions ? `<div style="margin-top: 15px; padding: 15px; background: #fff3cd; border-radius: 4px;">
        <strong>Before marking as done:</strong><br>${task.taskInstructions.replace(/\n/g, '<br>')}
      </div>` : ''}
      <button onclick="submitMarkAsDone('${task.id}')" style="margin-top: 20px;">Mark as Done</button>
    `;
  }
  
  body.innerHTML = content;
  document.getElementById('taskModal').style.display = 'block';
}

function selectChoice(el, choice) {
  document.querySelectorAll('.quiz-option').forEach(opt => opt.classList.remove('selected'));
  el.classList.add('selected');
  selectedChoice = choice;
}

// Question submission
async function submitQuestion(taskId) {
  const answer = document.getElementById('answerInput').value.trim();
  if (!answer) {
    showNotification('Error', 'Please enter an answer', 'error');
    return;
  }
  
  const res = await fetch(`${serverUrl}/api/submit/${taskId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: currentUser.id, answer })
  });
  
  const result = await res.json();
  showNotification('Submitted', result.message, 'success');
  closeModal();
  loadTasks();
}

// Multiple choice submission
async function submitMultipleChoice(taskId) {
  if (!selectedChoice) {
    showNotification('Error', 'Please select an answer', 'error');
    return;
  }
  
  const res = await fetch(`${serverUrl}/api/submit/${taskId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: currentUser.id, choice: selectedChoice })
  });
  
  const result = await res.json();
  
  if (result.pointsEarned) {
    showNotification(
      result.correct ? 'Correct!' : 'Incorrect',
      `${result.message}\n+${result.pointsEarned} points earned!`,
      result.correct ? 'success' : 'error'
    );
    loadUserData();
  } else {
    showNotification(
      result.correct ? 'Correct!' : 'Incorrect',
      result.message,
      result.correct ? 'success' : 'error'
    );
  }
  
  closeModal();
  loadTasks();
  selectedChoice = null;
}

// Poll submission
async function submitPoll(taskId) {
  if (!selectedChoice) {
    showNotification('Error', 'Please select an option', 'error');
    return;
  }
  
  const res = await fetch(`${serverUrl}/api/submit/${taskId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: currentUser.id, choice: selectedChoice })
  });
  
  const result = await res.json();
  showNotification('Vote Submitted', result.message, 'success');
  showPollResults(taskId);
  loadTasks();
  selectedChoice = null;
}

async function showPollResults(taskId) {
  const res = await fetch(`${serverUrl}/api/poll/${taskId}/results`);
  const results = await res.json();
  const task = tasks.find(t => t.id === taskId);
  
  let html = `<div class="poll-results"><h3>Poll Results (${results.total} votes)</h3>`;
  task.options.forEach(opt => {
    const pct = results.percentages[opt] || 0;
    const count = results.counts[opt] || 0;
    html += `
      <div class="poll-option">
        <div class="poll-label">
          <span>${opt}</span>
          <span>${count} votes (${pct}%)</span>
        </div>
        <div class="poll-bar">
          <div class="poll-bar-fill" style="width: ${pct}%">${pct > 10 ? pct + '%' : ''}</div>
        </div>
      </div>
    `;
  });
  html += '</div>';
  
  document.getElementById('modalBody').innerHTML = html;
}

// Attachment submission
async function submitAttachment(taskId) {
  const attachment = document.getElementById('attachmentInput').value.trim();
  if (!attachment) {
    showNotification('Error', 'Please describe your attachment', 'error');
    return;
  }
  
  const res = await fetch(`${serverUrl}/api/submit/${taskId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: currentUser.id, attachment })
  });
  
  const result = await res.json();
  showNotification('Submitted', result.message, 'success');
  closeModal();
  loadTasks();
}

// Mark as done submission
async function submitMarkAsDone(taskId) {
  const res = await fetch(`${serverUrl}/api/submit/${taskId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: currentUser.id, markedDone: true })
  });
  
  const result = await res.json();
  showNotification('Submitted', result.message, 'success');
  closeModal();
  loadTasks();
}

// Quiz functionality
function startQuiz(task) {
  quizData = task.quizPages || [];
  currentPage = 0;
  quizAnswers = [];
  renderQuizPage();
}

function renderQuizPage() {
  const container = document.getElementById('quizContainer');
  if (!quizData || currentPage >= quizData.length) {
    container.innerHTML = '<h3>Quiz Complete!</h3><p>All pages completed.</p>';
    return;
  }
  
  const page = quizData[currentPage];
  let html = `<div class="quiz-page">`;
  
  if (page.type === 'info') {
    html += `<h3>${page.title || 'Information'}</h3><p>${page.content}</p>`;
  } else if (page.type === 'question') {
    html += `<h3>Question ${currentPage + 1}</h3><p>${page.question}</p>
      <div class="quiz-options">`;
    page.options.forEach(opt => {
      html += `<div class="quiz-option" onclick="selectQuizAnswer(this, '${opt}')">${opt}</div>`;
    });
    html += `</div>`;
  }
  
  html += `<div class="quiz-navigation">
    ${currentPage > 0 ? '<button onclick="prevQuizPage()" class="secondary">Previous</button>' : '<div></div>'}
    ${currentPage < quizData.length - 1 ? '<button onclick="nextQuizPage()">Next</button>' : '<button onclick="finishQuiz()">Finish</button>'}
  </div></div>`;
  
  container.innerHTML = html;
}

function selectQuizAnswer(el, answer) {
  document.querySelectorAll('.quiz-option').forEach(opt => opt.classList.remove('selected'));
  el.classList.add('selected');
  currentQuizAnswer = answer;
}

function nextQuizPage() {
  const page = quizData[currentPage];
  if (page.type === 'question') {
    if (!currentQuizAnswer) return showNotification('Error', 'Please select an answer', 'error');
    quizAnswers[currentPage] = currentQuizAnswer;
    currentQuizAnswer = null;
  }
  currentPage++;
  renderQuizPage();
}

function prevQuizPage() {
  if (currentPage > 0) {
    currentPage--;
    renderQuizPage();
  }
}

function finishQuiz() {
  const page = quizData[currentPage];
  if (page.type === 'question') {
    if (!currentQuizAnswer) return showNotification('Error', 'Please select an answer', 'error');
    quizAnswers[currentPage] = currentQuizAnswer;
  }
  
  submitQuizToServer();
}

async function submitQuizToServer() {
  const taskId = tasks.find(t => t.quizPages === quizData)?.id;
  if (!taskId) return;
  
  const res = await fetch(`${serverUrl}/api/submit/${taskId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: currentUser.id, quizAnswers })
  });
  
  const result = await res.json();
  
  let resultsHTML = `<div style="text-align: center;">
    <h2>${result.message}</h2>
    <div style="font-size: 48px; margin: 20px 0;">${result.percentage}%</div>
    <p>Score: ${result.score} out of ${result.total} correct</p>`;
  
  if (result.pointsEarned) {
    resultsHTML += `<p style="color: #28a745; font-weight: bold;">+${result.pointsEarned} points earned!</p>`;
    loadUserData();
  }
  
  resultsHTML += `<h3 style="margin-top: 20px;">Question Breakdown:</h3>`;
  
  result.results.forEach((r, idx) => {
    resultsHTML += `<div style="text-align: left; background: ${r.isCorrect ? '#d4edda' : '#f8d7da'}; padding: 10px; margin: 10px 0; border-radius: 4px;">
      <strong>Q${idx + 1}:</strong> ${r.question}<br>
      <strong>Your answer:</strong> ${r.userAnswer}<br>
      <strong>Correct answer:</strong> ${r.correct}<br>
      ${r.isCorrect ? 'Correct' : 'Incorrect'}
    </div>`;
  });
  
  resultsHTML += `<button onclick="closeModal(); loadTasks();" style="margin-top: 20px;">Close</button></div>`;
  
  document.getElementById('modalBody').innerHTML = resultsHTML;
}