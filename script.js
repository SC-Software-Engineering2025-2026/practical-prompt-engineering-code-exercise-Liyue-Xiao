const STORAGE_KEY = "promptLibrary.prompts";

const form = document.getElementById("prompt-form");
const titleInput = document.getElementById("prompt-title");
const contentInput = document.getElementById("prompt-content");
const promptList = document.getElementById("prompt-list");

const getPrompts = () => {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
};

const savePrompts = (prompts) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prompts));
};

const makePreview = (content) => {
  const words = content.trim().split(/\s+/);
  const previewWords = words.slice(0, 16).join(" ");
  return words.length > 16 ? `${previewWords}...` : previewWords;
};

const renderPrompts = () => {
  const prompts = getPrompts();
  promptList.innerHTML = "";

  if (prompts.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No prompts saved yet.";
    promptList.appendChild(empty);
    return;
  }

  prompts.forEach((prompt) => {
    const card = document.createElement("article");
    card.className = "prompt-card";

    const title = document.createElement("h3");
    title.textContent = prompt.title;

    const preview = document.createElement("p");
    preview.className = "preview";
    preview.textContent = makePreview(prompt.content);

    const deleteButton = document.createElement("button");
    deleteButton.className = "delete-btn";
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => {
      const updated = getPrompts().filter((item) => item.id !== prompt.id);
      savePrompts(updated);
      renderPrompts();
    });

    card.append(title, preview, deleteButton);
    promptList.appendChild(card);
  });
};

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const title = titleInput.value.trim();
  const content = contentInput.value.trim();

  if (!title || !content) {
    return;
  }

  const nextPrompts = [
    ...getPrompts(),
    {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      title,
      content
    }
  ];

  savePrompts(nextPrompts);
  form.reset();
  titleInput.focus();
  renderPrompts();
});

renderPrompts();
