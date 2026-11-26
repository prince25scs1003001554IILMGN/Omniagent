// OmniAgent Desktop Frontend Controller

const API_BASE = window.location.origin;

// State
let appState = {
  settings: {},
  pendingCount: 0,
  activeTab: 'chat'
};

let voiceState = {
  enabled: true,
  voices: [],
  selectedVoice: null,
  rate: 1.0,
  pitch: 1.0,
  autoSpeak: true,
  recognition: null,
  isRecording: false
};

// Register PWA Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/static/sw.js')
      .then(reg => console.log('[PWA] Service Worker active:', reg.scope))
      .catch(err => console.log('[PWA] Service Worker notice:', err));
  });
}

// Elements
const navItems = document.querySelectorAll('.nav-item');
const mobileNavItems = document.querySelectorAll('.mobile-nav-item');
const tabViews = document.querySelectorAll('.tab-view');
const sectionTitle = document.getElementById('section-title');
const sectionDesc = document.getElementById('section-desc');
const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const toastEl = document.getElementById('toast');
const approvalsBadge = document.getElementById('approvals-badge');
const userDisplayName = document.getElementById('user-display-name');
const currentModelTag = document.getElementById('current-model-tag');

// Tab Meta
const tabMetadata = {
  chat: { title: "Agent Chat & Autonomous Work", desc: "Interact with OmniAgent, assign tasks, and query tools." },
  approvals: { title: "Action Approvals & Permission Gate", desc: "Explicit approval required before sending emails, messages, or altering data." },
  research: { title: "Technology & Innovation Radar", desc: "Continuous research on emerging tech, frameworks, and career skills." },
  jobs: { title: "Job & Internship Scout", desc: "Targeted job and internship recommendations matched to your skills." },
  docs: { title: "Document Intelligence", desc: "Search, analyze, and chat with your local documents." },
  inbox: { title: "Social & Email Inbox", desc: "Monitored messages from Email and LinkedIn." },
  settings: { title: "Agent Customization", desc: "Customize your AI persona, Gemini API key, and permission safeguards." }
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupChat();
  setupVoice();
  setupSettings();
  setupActions();
  fetchStatus();
  fetchResearch();
  fetchJobs();
  fetchApprovals();
  fetchDocs();
  fetchInbox();

  // Periodic status poll
  setInterval(() => {
    fetchStatus();
    fetchApprovals();
  }, 10000);
});

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 3000);
}

// Navigation
function setupNavigation() {
  navItems.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      switchTab(tabId);
    });
  });

  mobileNavItems.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      switchTab(tabId);
    });
  });

  // Suggestion chips
  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      chatInput.value = chip.getAttribute('data-prompt');
      chatForm.dispatchEvent(new Event('submit'));
    });
  });

  document.getElementById('btn-refresh-status').addEventListener('click', () => {
    fetchStatus();
    fetchApprovals();
    fetchResearch();
    fetchJobs();
    fetchDocs();
    showToast("Synchronized data with local agent!");
  });
}

function switchTab(tabId) {
  appState.activeTab = tabId;
  navItems.forEach(b => b.classList.toggle('active', b.getAttribute('data-tab') === tabId));
  mobileNavItems.forEach(b => b.classList.toggle('active', b.getAttribute('data-tab') === tabId));
  tabViews.forEach(v => v.classList.toggle('active', v.id === `view-${tabId}`));
  
  if (tabMetadata[tabId]) {
    sectionTitle.textContent = tabMetadata[tabId].title;
    sectionDesc.textContent = tabMetadata[tabId].desc;
  }
}

// Status
async function fetchStatus() {
  try {
    const res = await fetch(`${API_BASE}/api/status`);
    const data = await res.json();
    userDisplayName.textContent = data.user_name || "User";
    currentModelTag.textContent = data.model || "Gemini 1.5 Flash";
    
    // Approvals badge
    const count = data.pending_approvals_count || 0;
    if (count > 0) {
      approvalsBadge.style.display = 'inline-block';
      approvalsBadge.textContent = count;
    } else {
      approvalsBadge.style.display = 'none';
    }
  } catch (e) {
    console.error("Status fetch error", e);
  }
}

const FALLBACK_GEMINI_KEY = "AQ.Ab8RN6IpmVRV7utpT1k0MbhBaOOG97P2idivGZbwfXS78y1kOQ";

async function callGeminiDirectFallback(userPrompt) {
  const apiKey = localStorage.getItem('omniagent_api_key') || FALLBACK_GEMINI_KEY;
  const model = "gemini-3.1-flash-lite";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const payload = {
    system_instruction: {
      parts: [{
        text: "You are OmniAgent, a world-class autonomous personal AI assistant created by the user. You are running in cloud web mode on Netlify. You help with tech innovation research, career advice, job hunting, programming, file automation, and daily productivity. Always respond in clean, well-structured Markdown."
      }]
    },
    contents: [
      {
        role: "user",
        parts: [{ text: userPrompt }]
      }
    ],
    generationConfig: {
      temperature: 0.5,
      maxOutputTokens: 2048
    }
  };

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const d = await r.json();
    if (d.candidates && d.candidates[0] && d.candidates[0].content) {
      return d.candidates[0].content.parts[0].text;
    } else if (d.error) {
      return `⚠️ Gemini API Notice: ${d.error.message || 'Service busy. Please try again in a moment.'}`;
    }
    return "I processed your request.";
  } catch (err) {
    return `Hello! I am OmniAgent. I am running live on Netlify! How can I assist you with your projects, research, or career today?`;
  }
}

// Chat System
function setupChat() {
  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;

    // Render User Message
    appendMessage('user', text);
    chatInput.value = '';

    // Render Typing indicator
    const typingId = appendTypingIndicator();

    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      removeTypingIndicator(typingId);
      appendMessage('assistant', data.reply || "Task finished.");
      if (voiceState.autoSpeak && voiceState.enabled) {
        speakText(data.reply || "Task finished.");
      }
      fetchApprovals(); // Check if any action was queued
    } catch (err) {
      // Standalone Cloud Fallback (Netlify / Static mode)
      try {
        const reply = await callGeminiDirectFallback(text);
        removeTypingIndicator(typingId);
        appendMessage('assistant', reply);
        if (voiceState.autoSpeak && voiceState.enabled) {
          speakText(reply);
        }
      } catch (fallbackErr) {
        removeTypingIndicator(typingId);
        appendMessage('assistant', `⚠️ Connection error: ${err.message}`);
      }
    }
  });
}

function appendMessage(role, text) {
  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${role}`;

  const isUser = role === 'user';
  const avatar = isUser ? '👤' : '⚡';
  const author = isUser ? 'You' : 'OmniAgent';

  // Basic markdown conversion
  let formatted = text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');

  msgDiv.innerHTML = `
    <div class="msg-avatar">${avatar}</div>
    <div class="msg-bubble">
      <div class="msg-author">${author}</div>
      <div class="msg-content">${formatted}</div>
    </div>
  `;

  chatMessages.appendChild(msgDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function appendTypingIndicator() {
  const id = 'typing-' + Date.now();
  const div = document.createElement('div');
  div.id = id;
  div.className = 'message assistant';
  div.innerHTML = `
    <div class="msg-avatar">⚡</div>
    <div class="msg-bubble">
      <div class="msg-author">OmniAgent</div>
      <div class="msg-content"><em>Reasoning & executing tools...</em></div>
    </div>
  `;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return id;
}

function removeTypingIndicator(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

// Action Approvals
async function fetchApprovals() {
  try {
    const res = await fetch(`${API_BASE}/api/comms/pending`);
    const data = await res.json();
    renderApprovals(data.pending || [], data.history || []);
  } catch (e) {
    console.error("Approvals error", e);
  }
}

function renderApprovals(pending, history) {
  const pendingContainer = document.getElementById('pending-approvals-list');
  const historyContainer = document.getElementById('action-history-list');

  // Update Badge
  if (pending.length > 0) {
    approvalsBadge.style.display = 'inline-block';
    approvalsBadge.textContent = pending.length;
  } else {
    approvalsBadge.style.display = 'none';
  }

  // Render Pending Cards
  if (pending.length === 0) {
    pendingContainer.innerHTML = `<div style="color: var(--text-muted); padding: 20px;">🛡️ No pending action requests. Agent is running safely.</div>`;
  } else {
    pendingContainer.innerHTML = pending.map(act => `
      <div class="card approval-card">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span class="card-badge score">REQUIRES APPROVAL</span>
          <span style="font-family: 'JetBrains Mono'; font-size: 11px; color: var(--text-muted);">ID: #${act.id}</span>
        </div>
        <div class="card-title">${act.title}</div>
        <div class="card-desc">
          <strong>Type:</strong> ${act.type}<br>
          <strong>Details:</strong> <code>${JSON.stringify(act.details)}</code><br>
          <small style="color: var(--text-muted);">Requested at: ${act.created_at}</small>
        </div>
        <div class="approval-actions">
          <button class="btn btn-success" onclick="approveAction('${act.id}')">✓ Approve & Execute</button>
          <button class="btn btn-danger" onclick="rejectAction('${act.id}')">✗ Reject</button>
        </div>
      </div>
    `).join('');
  }

  // Render History
  if (history.length === 0) {
    historyContainer.innerHTML = `<div style="color: var(--text-muted); padding: 10px;">No historical actions.</div>`;
  } else {
    historyContainer.innerHTML = history.slice(0, 6).map(h => `
      <div style="padding: 10px; background: rgba(255,255,255,0.02); border-radius: 6px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <strong>${h.title}</strong> (${h.type})
          <div style="font-size: 11px; color: var(--text-muted);">${h.executed_at || h.rejected_at || ''} — Result: ${h.result || h.reason || ''}</div>
        </div>
        <span class="card-badge ${h.status === 'approved' ? 'score' : ''}">${h.status.toUpperCase()}</span>
      </div>
    `).join('');
  }
}

async function approveAction(actionId) {
  try {
    const res = await fetch(`${API_BASE}/api/comms/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action_id: actionId })
    });
    const data = await res.json();
    showToast(data.message || "Action approved!");
    fetchApprovals();
  } catch (e) {
    showToast("Error approving action");
  }
}

async function rejectAction(actionId) {
  try {
    const res = await fetch(`${API_BASE}/api/comms/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action_id: actionId })
    });
    const data = await res.json();
    showToast(data.message || "Action rejected.");
    fetchApprovals();
  } catch (e) {
    showToast("Error rejecting action");
  }
}

// Research Tab
async function fetchResearch() {
  const container = document.getElementById('research-cards');
  try {
    const res = await fetch(`${API_BASE}/api/research`);
    const data = await res.json();
    const briefings = data.briefings || [];
    
    container.innerHTML = briefings.map(b => `
      <div class="card">
        <div style="display: flex; justify-content: space-between;">
          <span class="card-badge">${b.source}</span>
          <span style="font-size: 11px; color: var(--text-muted);">${b.saved_at || ''}</span>
        </div>
        <div class="card-title">${b.title}</div>
        <div class="card-desc">${b.summary}</div>
        <div style="background: rgba(99, 102, 241, 0.08); padding: 8px 12px; border-radius: 6px; font-size: 12px;">
          <strong>🎯 Why it matters for your career:</strong><br>
          ${b.why_it_matters}
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: auto;">
          <span style="font-size: 11px; color: var(--text-muted);">Skills: ${(b.skills_to_learn || []).join(', ')}</span>
          <a href="${b.url}" target="_blank" class="btn btn-secondary" style="font-size: 11px; padding: 4px 8px;">Explore ↗</a>
        </div>
      </div>
    `).join('');
  } catch (e) {
    console.error("Research fetch error", e);
  }
}

// Jobs Tab
async function fetchJobs() {
  const container = document.getElementById('jobs-cards');
  try {
    const res = await fetch(`${API_BASE}/api/jobs`);
    const data = await res.json();
    const jobs = data.jobs || [];

    container.innerHTML = jobs.map(j => `
      <div class="card">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span class="card-badge score">${j.match_score || 85}% MATCH</span>
          <span class="card-badge">${j.type || 'Full-time'}</span>
        </div>
        <div class="card-title">${j.title}</div>
        <div class="card-meta">
          <span>🏢 ${j.company}</span>
          <span>📍 ${j.location}</span>
        </div>
        <div style="font-size: 12px; color: var(--text-muted);">
          <strong>💰 Compensation:</strong> ${j.salary || 'Competitive'}
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 4px;">
          ${(j.tags || []).map(t => `<span style="font-size: 10px; background: rgba(255,255,255,0.06); padding: 2px 6px; border-radius: 4px;">${t}</span>`).join('')}
        </div>
        <div style="margin-top: auto; padding-top: 10px;">
          <a href="${j.apply_url}" target="_blank" class="btn btn-primary" style="width: 100%; justify-content: center;">Apply on Platform ↗</a>
        </div>
      </div>
    `).join('');
  } catch (e) {
    console.error("Jobs error", e);
  }
}

// Documents Tab
async function fetchDocs() {
  const tbody = document.getElementById('docs-tbody');
  try {
    const res = await fetch(`${API_BASE}/api/documents`);
    const data = await res.json();
    const docs = data.documents || [];

    if (docs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No documents yet. Add files to <code>data/documents/</code> and click Re-scan.</td></tr>`;
      return;
    }

    tbody.innerHTML = docs.map(d => `
      <tr>
        <td style="font-weight: 600;">📄 ${d.filename}</td>
        <td>${d.size_kb} KB</td>
        <td>${d.modified_at}</td>
        <td style="max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; color: var(--text-muted);">${d.preview}</td>
        <td>
          <button class="btn btn-secondary" style="font-size: 11px; padding: 4px 8px;" onclick="askAboutDoc('${d.filename}')">Ask Agent 💬</button>
        </td>
      </tr>
    `).join('');
  } catch (e) {
    console.error("Docs error", e);
  }
}

function askAboutDoc(filename) {
  switchTab('chat');
  chatInput.value = `Analyze ${filename} and summarize its key insights for me`;
  chatForm.dispatchEvent(new Event('submit'));
}

// Inbox Tab
async function fetchInbox() {
  const container = document.getElementById('inbox-list-items');
  try {
    const res = await fetch(`${API_BASE}/api/comms/inbox`);
    const data = await res.json();
    const inbox = data.inbox || [];

    container.innerHTML = inbox.map(m => `
      <div class="card" style="margin-bottom: 12px;">
        <div style="display: flex; justify-content: space-between;">
          <span class="card-badge ${m.source === 'LinkedIn' ? '' : 'score'}">${m.source}</span>
          <span style="font-size: 11px; color: var(--text-muted);">${m.received_at}</span>
        </div>
        <div style="font-weight: 600; font-size: 14px;">${m.subject}</div>
        <div style="font-size: 12px; color: var(--accent-light);">From: ${m.sender}</div>
        <div class="card-desc">"${m.snippet}"</div>
        <div style="margin-top: 8px;">
          <button class="btn btn-secondary" style="font-size: 12px;" onclick="replyInbox('${m.source}', '${m.sender}', '${m.subject}')">Draft Reply with Permission 🛡️</button>
        </div>
      </div>
    `).join('');
  } catch (e) {
    console.error("Inbox error", e);
  }
}

function replyInbox(source, sender, subject) {
  switchTab('chat');
  chatInput.value = `Draft a polite reply to ${sender} regarding "${subject}" on ${source} and ask for my approval before sending`;
  chatForm.dispatchEvent(new Event('submit'));
}

// Action Handlers for Buttons
function setupActions() {
  document.getElementById('btn-refresh-research').addEventListener('click', async () => {
    showToast("Scanning tech radar feeds...");
    await fetch(`${API_BASE}/api/research/refresh`, { method: 'POST' });
    fetchResearch();
    showToast("Tech Radar updated!");
  });

  document.getElementById('btn-refresh-jobs').addEventListener('click', async () => {
    showToast("Sweeping remote and tech job boards...");
    await fetch(`${API_BASE}/api/jobs/refresh`, { method: 'POST' });
    fetchJobs();
    showToast("Job board updated!");
  });

  document.getElementById('btn-scan-docs').addEventListener('click', async () => {
    showToast("Re-scanning data/documents folder...");
    await fetch(`${API_BASE}/api/documents/scan`, { method: 'POST' });
    fetchDocs();
    showToast("Documents index refreshed!");
  });

  document.getElementById('btn-create-doc').addEventListener('click', async () => {
    const filename = prompt("Enter new document filename (e.g. My_Project_Ideas.txt):", "My_Notes.txt");
    if (!filename) return;
    const content = prompt("Enter initial content:", "# My Notes\nCreated via OmniAgent");
    if (content === null) return;
    
    await fetch(`${API_BASE}/api/documents/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, content })
    });
    fetchDocs();
    showToast(`Created ${filename}!`);
  });

  // Phone Connect Modal Handlers
  const phoneModal = document.getElementById('phone-modal');
  const btnOpenPhone = document.getElementById('btn-open-phone-modal');
  const btnClosePhone = document.getElementById('btn-close-phone-modal');
  const phoneUrlDisplay = document.getElementById('phone-url-display');
  const phoneQrImg = document.getElementById('phone-qr-img');

  if (btnOpenPhone) {
    btnOpenPhone.addEventListener('click', async () => {
      phoneModal.style.display = 'flex';
      try {
        const res = await fetch(`${API_BASE}/api/network-info`);
        const data = await res.json();
        const mobileUrl = data.mobile_url || window.location.origin;
        phoneUrlDisplay.textContent = mobileUrl;
        
        // QR Code for instant phone scanning
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(mobileUrl)}`;
        phoneQrImg.src = qrUrl;
        phoneQrImg.style.display = 'inline-block';
      } catch (e) {
        phoneUrlDisplay.textContent = window.location.origin;
      }
    });
  }

  if (btnClosePhone) {
    btnClosePhone.addEventListener('click', () => {
      phoneModal.style.display = 'none';
    });
  }

  window.addEventListener('click', (e) => {
    if (e.target === phoneModal) {
      phoneModal.style.display = 'none';
    }
  });
}

// Settings System
async function setupSettings() {
  const form = document.getElementById('settings-form');
  
  // Load settings into form
  try {
    const res = await fetch(`${API_BASE}/api/settings`);
    const data = await res.json();
    const s = data.settings || {};
    appState.settings = s;

    document.getElementById('cfg-api-key').value = s.api_key || '';
    document.getElementById('cfg-model').value = s.model || 'gemini-1.5-flash';
    
    const up = s.user_profile || {};
    document.getElementById('cfg-user-name').value = up.name || '';
    document.getElementById('cfg-current-role').value = up.current_role || '';
    document.getElementById('cfg-skills').value = (up.skills || []).join(', ');
    document.getElementById('cfg-target-roles').value = (up.target_roles || []).join(', ');
    document.getElementById('cfg-interests').value = (up.interests || []).join(', ');

    const persona = s.agent_persona || {};
    document.getElementById('cfg-persona-name').value = persona.name || 'OmniAgent';
    document.getElementById('cfg-persona-style').value = persona.style || '';
    document.getElementById('cfg-custom-instructions').value = persona.custom_instructions || '';

    const perms = s.permissions || {};
    document.getElementById('cfg-perm-email').checked = perms.require_approval_email !== false;
    document.getElementById('cfg-perm-linkedin').checked = perms.require_approval_linkedin !== false;
    document.getElementById('cfg-perm-files').checked = perms.require_approval_file_actions !== false;

    const auto = s.automation || {};
    document.getElementById('cfg-auto-tech').checked = auto.daily_tech_radar !== false;
    document.getElementById('cfg-auto-jobs').checked = auto.daily_job_alerts !== false;

  } catch (e) {
    console.error("Load settings error", e);
  }

  // Save Settings
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const updated = {
      api_key: document.getElementById('cfg-api-key').value.trim(),
      model: document.getElementById('cfg-model').value,
      user_profile: {
        name: document.getElementById('cfg-user-name').value.trim() || 'User',
        current_role: document.getElementById('cfg-current-role').value.trim(),
        skills: document.getElementById('cfg-skills').value.split(',').map(s => s.trim()).filter(Boolean),
        target_roles: document.getElementById('cfg-target-roles').value.split(',').map(s => s.trim()).filter(Boolean),
        interests: document.getElementById('cfg-interests').value.split(',').map(s => s.trim()).filter(Boolean)
      },
      agent_persona: {
        name: document.getElementById('cfg-persona-name').value.trim() || 'OmniAgent',
        style: document.getElementById('cfg-persona-style').value.trim(),
        custom_instructions: document.getElementById('cfg-custom-instructions').value.trim()
      },
      permissions: {
        require_approval_email: document.getElementById('cfg-perm-email').checked,
        require_approval_linkedin: document.getElementById('cfg-perm-linkedin').checked,
        require_approval_file_actions: document.getElementById('cfg-perm-files').checked
      },
      automation: {
        daily_tech_radar: document.getElementById('cfg-auto-tech').checked,
        daily_job_alerts: document.getElementById('cfg-auto-jobs').checked
      }
    };

    try {
      const res = await fetch(`${API_BASE}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: updated })
      });
      const resData = await res.json();
      if (resData.success) {
        showToast("Settings saved successfully!");
        fetchStatus();
      }
    } catch (err) {
      showToast("Error saving settings");
    }
  });
}

// Voice Engine & Speech System
function setupVoice() {
  function loadVoices() {
    if (!('speechSynthesis' in window)) return;
    voiceState.voices = window.speechSynthesis.getVoices();
    const select = document.getElementById('cfg-voice-select');
    if (!select || voiceState.voices.length === 0) return;

    select.innerHTML = '';
    voiceState.voices.forEach((v, idx) => {
      const opt = document.createElement('option');
      opt.value = idx;
      opt.textContent = `${v.name} (${v.lang})`;
      if (!voiceState.selectedVoice && (v.name.includes('UK') || v.name.includes('David') || v.name.includes('Mark') || v.name.includes('George') || v.lang.startsWith('en'))) {
        opt.selected = true;
        voiceState.selectedVoice = v;
      }
      select.appendChild(opt);
    });
  }

  if ('speechSynthesis' in window) {
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }

  const rateInput = document.getElementById('cfg-voice-rate');
  const rateVal = document.getElementById('rate-value');
  if (rateInput && rateVal) {
    rateInput.addEventListener('input', (e) => {
      voiceState.rate = parseFloat(e.target.value);
      rateVal.textContent = `${voiceState.rate.toFixed(1)}x Speed`;
    });
  }

  const voiceSelect = document.getElementById('cfg-voice-select');
  if (voiceSelect) {
    voiceSelect.addEventListener('change', (e) => {
      const idx = parseInt(e.target.value, 10);
      if (voiceState.voices[idx]) {
        voiceState.selectedVoice = voiceState.voices[idx];
      }
    });
  }

  const autoSpeakChk = document.getElementById('cfg-voice-autospeak');
  if (autoSpeakChk) {
    autoSpeakChk.addEventListener('change', (e) => {
      voiceState.autoSpeak = e.target.checked;
    });
  }

  const testBtn = document.getElementById('btn-test-voice');
  if (testBtn) {
    testBtn.addEventListener('click', () => {
      speakText("Hello! I am OmniAgent, your personal autonomous assistant. My voice systems are online and ready to assist you.");
    });
  }

  const toggleBtn = document.getElementById('btn-toggle-voice');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', async () => {
      voiceState.enabled = !voiceState.enabled;
      if (!voiceState.enabled && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      toggleBtn.textContent = voiceState.enabled ? "🔊 Voice ON" : "🔇 Voice MUTED";
      toggleBtn.classList.toggle('btn-secondary', voiceState.enabled);
      toggleBtn.classList.toggle('btn-danger', !voiceState.enabled);
      showToast(voiceState.enabled ? "Voice output enabled" : "Voice muted");
      try {
        await fetch(`${API_BASE}/api/voice/toggle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: voiceState.enabled })
        });
      } catch (e) {}
    });
  }

  setupSpeechRecognition();
}

function speakText(text) {
  if (!voiceState.enabled || !('speechSynthesis' in window)) return;

  window.speechSynthesis.cancel();

  let clean = text
    .replace(/```[\s\S]*?```/g, 'Code block omitted.')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_#~>•\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const sentences = clean.split(/(?<=[.!?])\s+/);
  if (sentences.length > 3) {
    clean = sentences.slice(0, 3).join(' ');
  }

  const utterance = new SpeechSynthesisUtterance(clean);
  if (voiceState.selectedVoice) {
    utterance.voice = voiceState.selectedVoice;
  }
  utterance.rate = voiceState.rate;
  utterance.pitch = voiceState.pitch;

  window.speechSynthesis.speak(utterance);
}

function setupSpeechRecognition() {
  const micBtn = document.getElementById('btn-mic');
  if (!micBtn) return;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    micBtn.title = "Speech recognition requires microphone permissions or Chrome/Edge";
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  recognition.onstart = () => {
    voiceState.isRecording = true;
    micBtn.classList.add('listening');
    showToast("🎙️ Listening... Speak your task!");
  };

  recognition.onresult = (event) => {
    const transcript = Array.from(event.results)
      .map(result => result[0])
      .map(result => result.transcript)
      .join('');

    chatInput.value = transcript;
  };

  recognition.onerror = (event) => {
    voiceState.isRecording = false;
    micBtn.classList.remove('listening');
    showToast(`Microphone note: ${event.error}`);
  };

  recognition.onend = () => {
    voiceState.isRecording = false;
    micBtn.classList.remove('listening');
    if (chatInput.value.trim().length > 0) {
      chatForm.dispatchEvent(new Event('submit'));
    }
  };

  micBtn.addEventListener('click', () => {
    if (voiceState.isRecording) {
      recognition.stop();
    } else {
      chatInput.value = '';
      recognition.start();
    }
  });
}
