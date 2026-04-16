const pathName = window.location.pathname;

if (pathName.endsWith("/login.html") || pathName === "/login.html") {
  initAuthPage();
}

if (pathName.endsWith("/chat.html") || pathName === "/chat.html") {
  initChatPage();
}

async function initAuthPage() {
  const authStatus = document.getElementById("auth-status");
  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");
  const tabButtons = document.querySelectorAll(".tab-button");

  try {
    await api("/api/me");
    window.location.href = "/chat.html";
    return;
  } catch (error) {
    showStatus(authStatus, "");
  }

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const selectedTab = button.dataset.tab;
      tabButtons.forEach((item) => item.classList.toggle("is-active", item === button));
      loginForm.classList.toggle("is-active", selectedTab === "login");
      registerForm.classList.toggle("is-active", selectedTab === "register");
      showStatus(authStatus, "");
    });
  });

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(loginForm);

    try {
      await api("/api/login", {
        method: "POST",
        body: {
          username: formData.get("username"),
          password: formData.get("password")
        }
      });

      window.location.href = "/chat.html";
    } catch (error) {
      showStatus(authStatus, error.message);
    }
  });

  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(registerForm);

    try {
      await api("/api/register", {
        method: "POST",
        body: {
          displayName: formData.get("displayName"),
          username: formData.get("username"),
          password: formData.get("password")
        }
      });

      window.location.href = "/chat.html";
    } catch (error) {
      showStatus(authStatus, error.message);
    }
  });
}

async function initChatPage() {
  const messagesContainer = document.getElementById("messages");
  const currentUserElement = document.getElementById("current-user");
  const messageForm = document.getElementById("message-form");
  const messageInput = document.getElementById("message-input");
  const logoutButton = document.getElementById("logout-button");
  let currentUser = null;
  let lastRenderedSignature = "";

  try {
    currentUser = await api("/api/me");
  } catch (error) {
    window.location.href = "/login.html";
    return;
  }

  currentUserElement.textContent = `Вы вошли как ${currentUser.displayName}`;

  async function loadMessages() {
    try {
      const messages = await api("/api/messages");
      const nextSignature = JSON.stringify(messages.map((message) => message.id));

      if (nextSignature !== lastRenderedSignature) {
        renderMessages(messagesContainer, messages, currentUser);
        lastRenderedSignature = nextSignature;
      }
    } catch (error) {
      if (error.status === 401) {
        window.location.href = "/login.html";
      }
    }
  }

  await loadMessages();
  setInterval(loadMessages, 2000);

  messageForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const text = messageInput.value.trim();
    if (!text) {
      return;
    }

    messageInput.disabled = true;

    try {
      await api("/api/messages", {
        method: "POST",
        body: { text }
      });
      messageInput.value = "";
      await loadMessages();
      messageInput.focus();
    } catch (error) {
      alert(error.message);
    } finally {
      messageInput.disabled = false;
    }
  });

  logoutButton.addEventListener("click", async () => {
    await api("/api/logout", { method: "POST" });
    window.location.href = "/login.html";
  });
}

function renderMessages(container, messages, currentUser) {
  container.innerHTML = "";

  if (!messages.length) {
    const emptyState = document.createElement("div");
    emptyState.className = "empty-state";
    emptyState.textContent = "Сообщений пока нет. Напишите первое.";
    container.appendChild(emptyState);
    return;
  }

  messages.forEach((message) => {
    const article = document.createElement("article");
    article.className = "message";

    if (message.username === currentUser.username) {
      article.classList.add("message-own");
    }

    const meta = document.createElement("div");
    meta.className = "message-meta";
    meta.textContent = `${message.displayName} • ${formatTime(message.createdAt)}`;

    const text = document.createElement("p");
    text.className = "message-text";
    text.textContent = message.text;

    article.append(meta, text);
    container.appendChild(article);
  });

  container.scrollTop = container.scrollHeight;
}

function formatTime(value) {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit"
  }).format(new Date(value));
}

function showStatus(element, message) {
  element.textContent = message;
  element.classList.toggle("is-visible", Boolean(message));
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json"
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(payload.error || "Request failed");
    error.status = response.status;
    throw error;
  }

  return payload;
}
