const STORAGE_KEY = "promptLibrary.prompts";

const form = document.getElementById("prompt-form");
const titleInput = document.getElementById("title");
const contentInput = document.getElementById("content");
const messageEl = document.getElementById("form-message");
const listEl = document.getElementById("prompt-list");
const emptyStateEl = document.getElementById("empty-state");
const countEl = document.getElementById("prompt-count");

function loadPrompts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed;
  } catch {
    return [];
  }
}

function savePrompts(prompts) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prompts));
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderPrompts() {
  const prompts = loadPrompts();
  countEl.textContent = String(prompts.length);
  listEl.innerHTML = "";

  if (prompts.length === 0) {
    emptyStateEl.hidden = false;
    return;
  }

  emptyStateEl.hidden = true;

  for (const prompt of prompts) {
    const item = document.createElement("li");
    item.className = "prompt-item";
    item.innerHTML = `
      <div class="prompt-title-row">
        <h3 class="prompt-title">${escapeHtml(prompt.title)}</h3>
        <button class="btn btn-delete" data-id="${prompt.id}" type="button" aria-label="Delete prompt ${escapeHtml(prompt.title)}">
          Delete
        </button>
      </div>
      <p class="prompt-content">${escapeHtml(prompt.content)}</p>
    `;
    listEl.append(item);
  }
}

function showMessage(text, isError = false) {
  messageEl.textContent = text;
  messageEl.style.color = isError ? "#b42318" : "#50627a";
}

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const title = titleInput.value.trim();
  const content = contentInput.value.trim();

  if (!title || !content) {
    showMessage("Please enter both a title and prompt content.", true);
    return;
  }

  const prompts = loadPrompts();
  prompts.unshift({
    id: crypto.randomUUID(),
    title,
    content,
    createdAt: Date.now(),
  });

  savePrompts(prompts);
  form.reset();
  titleInput.focus();
  showMessage("Prompt saved.");
  renderPrompts();
});

listEl.addEventListener("click", (event) => {
  const target = event.target;

  if (!(target instanceof HTMLElement) || !target.matches("[data-id]")) {
    return;
  }

  const promptId = target.dataset.id;
  if (!promptId) {
    return;
  }

  const prompts = loadPrompts().filter((prompt) => prompt.id !== promptId);
  savePrompts(prompts);
  renderPrompts();
});

renderPrompts();
