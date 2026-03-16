const STORAGE_KEY = "promptLibrary.prompts";

const form = document.getElementById("prompt-form");
const titleInput = document.getElementById("prompt-title");
const contentInput = document.getElementById("prompt-content");
const promptList = document.getElementById("prompt-list");

const createId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const getPrompts = () => {
  const raw = localStorage.getItem(STORAGE_KEY);
  const prompts = raw ? JSON.parse(raw) : [];

  return prompts.map((prompt) => ({
    id: prompt.id,
    title: prompt.title,
    content: prompt.content,
    notes: Array.isArray(prompt.notes)
      ? prompt.notes.map((note) => ({
          id: typeof note.id === "string" ? note.id : createId(),
          text: typeof note.text === "string" ? note.text : ""
        }))
      : []
  }));
};

const savePrompts = (prompts) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prompts));
    return true;
  } catch (error) {
    window.alert("Unable to save notes right now.");
    return false;
  }
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
    card.dataset.promptId = prompt.id;

    const title = document.createElement("h3");
    title.textContent = prompt.title;

    const preview = document.createElement("p");
    preview.className = "preview";
    preview.textContent = makePreview(prompt.content);

    const notesSection = document.createElement("section");
    notesSection.className = "notes-section";
    notesSection.setAttribute("aria-label", `${prompt.title} notes`);

    const notesTitle = document.createElement("h4");
    notesTitle.className = "notes-title";
    notesTitle.textContent = "Notes";

    const noteComposer = document.createElement("div");
    noteComposer.className = "note-composer";

    const noteInput = document.createElement("textarea");
    noteInput.className = "note-input";
    noteInput.rows = 3;
    noteInput.placeholder = "Add a note";

    const addNoteButton = document.createElement("button");
    addNoteButton.className = "note-action-btn";
    addNoteButton.type = "button";
    addNoteButton.dataset.action = "add-note";
    addNoteButton.textContent = "Add Note";

    noteComposer.append(noteInput, addNoteButton);

    const notesList = document.createElement("div");
    notesList.className = "notes-list";

    if (prompt.notes.length === 0) {
      const emptyNotes = document.createElement("p");
      emptyNotes.className = "notes-empty";
      emptyNotes.textContent = "No notes yet.";
      notesList.appendChild(emptyNotes);
    } else {
      prompt.notes.forEach((note) => {
        const noteItem = document.createElement("article");
        noteItem.className = "note-item";
        noteItem.dataset.noteId = note.id;

        const noteText = document.createElement("p");
        noteText.className = "note-text";
        noteText.textContent = note.text;

        const noteEditor = document.createElement("textarea");
        noteEditor.className = "note-editor";
        noteEditor.rows = 3;
        noteEditor.value = note.text;
        noteEditor.hidden = true;

        const noteActions = document.createElement("div");
        noteActions.className = "note-actions";

        const editButton = document.createElement("button");
        editButton.className = "note-action-btn";
        editButton.type = "button";
        editButton.dataset.action = "edit-note";
        editButton.textContent = "Edit";

        const saveButton = document.createElement("button");
        saveButton.className = "note-action-btn";
        saveButton.type = "button";
        saveButton.dataset.action = "save-note";
        saveButton.textContent = "Save";
        saveButton.hidden = true;

        const deleteNoteButton = document.createElement("button");
        deleteNoteButton.className = "note-action-btn note-delete-btn";
        deleteNoteButton.type = "button";
        deleteNoteButton.dataset.action = "delete-note";
        deleteNoteButton.textContent = "Delete";

        noteActions.append(editButton, saveButton, deleteNoteButton);
        noteItem.append(noteText, noteEditor, noteActions);
        notesList.appendChild(noteItem);
      });
    }

    notesSection.append(notesTitle, noteComposer, notesList);

    const deletePromptButton = document.createElement("button");
    deletePromptButton.className = "delete-btn";
    deletePromptButton.type = "button";
    deletePromptButton.textContent = "Delete";
    deletePromptButton.addEventListener("click", () => {
      const updated = getPrompts().filter((item) => item.id !== prompt.id);
      if (savePrompts(updated)) {
        renderPrompts();
      }
    });

    card.append(title, preview, notesSection, deletePromptButton);
    promptList.appendChild(card);
  });
};

const updatePromptNotes = (promptId, updateNotes) => {
  const prompts = getPrompts();
  const updated = prompts.map((prompt) =>
    prompt.id === promptId ? { ...prompt, notes: updateNotes(prompt.notes) } : prompt
  );

  if (savePrompts(updated)) {
    renderPrompts();
  }
};

promptList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }

  const card = button.closest(".prompt-card");
  const promptId = card?.dataset.promptId;
  if (!card || !promptId) {
    return;
  }

  if (button.dataset.action === "add-note") {
    const input = card.querySelector(".note-input");
    const text = input?.value.trim();

    if (!input || !text) {
      return;
    }

    updatePromptNotes(promptId, (notes) => [...notes, { id: createId(), text }]);
    return;
  }

  const noteItem = button.closest(".note-item");
  const noteId = noteItem?.dataset.noteId;
  if (!noteItem || !noteId) {
    return;
  }

  const noteText = noteItem.querySelector(".note-text");
  const noteEditor = noteItem.querySelector(".note-editor");
  const editButton = noteItem.querySelector('[data-action="edit-note"]');
  const saveButton = noteItem.querySelector('[data-action="save-note"]');

  if (!noteText || !noteEditor || !editButton || !saveButton) {
    return;
  }

  if (button.dataset.action === "edit-note") {
    noteText.hidden = true;
    noteEditor.hidden = false;
    editButton.hidden = true;
    saveButton.hidden = false;
    noteEditor.focus();
    noteEditor.setSelectionRange(noteEditor.value.length, noteEditor.value.length);
    return;
  }

  if (button.dataset.action === "save-note") {
    const text = noteEditor.value.trim();
    if (!text) {
      return;
    }

    updatePromptNotes(promptId, (notes) =>
      notes.map((note) => (note.id === noteId ? { ...note, text } : note))
    );
    return;
  }

  if (button.dataset.action === "delete-note") {
    updatePromptNotes(promptId, (notes) => notes.filter((note) => note.id !== noteId));
  }
});

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
      id: createId(),
      title,
      content,
      notes: []
    }
  ];

  if (savePrompts(nextPrompts)) {
    form.reset();
    titleInput.focus();
    renderPrompts();
  }
});

renderPrompts();
