const STORAGE_KEY = "promptLibrary.prompts";
const RECENT_MODELS_KEY = "promptLibrary.recentModels";

const form = document.getElementById("prompt-form");
const titleInput = document.getElementById("prompt-title");
const modelInput = document.getElementById("prompt-model");
const contentInput = document.getElementById("prompt-content");
const isCodeInput = document.getElementById("prompt-is-code");
const promptList = document.getElementById("prompt-list");
const recentModelsContainer = document.getElementById("recent-models");

const createId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const toIsoNow = () => new Date().toISOString();

const isValidIso8601 = (value) => {
  if (typeof value !== "string") {
    return false;
  }

  const isoPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  if (!isoPattern.test(value)) {
    return false;
  }

  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
};

const assertValidModelName = (modelName) => {
  if (typeof modelName !== "string") {
    throw new Error("Model name must be a string.");
  }

  const normalized = modelName.trim();
  if (!normalized) {
    throw new Error("Model name must be a non-empty string.");
  }

  if (normalized.length > 100) {
    throw new Error("Model name must be 100 characters or fewer.");
  }

  return normalized;
};

const looksLikeCode = (text) => /[{};<>]|\b(function|const|let|class|return|if|for|while|import)\b/.test(text);

const estimateTokens = (text, isCode) => {
  if (typeof text !== "string") {
    throw new Error("Token estimation input text must be a string.");
  }

  if (typeof isCode !== "boolean") {
    throw new Error("Token estimation isCode flag must be a boolean.");
  }

  const trimmed = text.trim();
  const wordCount = trimmed ? trimmed.split(/\s+/).length : 0;
  const characterCount = text.length;

  let min = 0.75 * wordCount;
  let max = 0.25 * characterCount;

  if (isCode) {
    min *= 1.3;
    max *= 1.3;
  }

  min = Number(min.toFixed(2));
  max = Number(max.toFixed(2));

  const tokenBand = Math.max(min, max);
  let confidence = "high";
  if (tokenBand >= 1000 && tokenBand <= 5000) {
    confidence = "medium";
  } else if (tokenBand > 5000) {
    confidence = "low";
  }

  return { min, max, confidence };
};

const validateMetadata = (metadata) => {
  if (!metadata || typeof metadata !== "object") {
    throw new Error("Metadata must be an object.");
  }

  const model = assertValidModelName(metadata.model);
  const { createdAt, updatedAt, tokenEstimate } = metadata;

  if (!isValidIso8601(createdAt)) {
    throw new Error("createdAt must be a valid ISO 8601 timestamp.");
  }

  if (!isValidIso8601(updatedAt)) {
    throw new Error("updatedAt must be a valid ISO 8601 timestamp.");
  }

  if (new Date(updatedAt).getTime() < new Date(createdAt).getTime()) {
    throw new Error("updatedAt must be greater than or equal to createdAt.");
  }

  if (!tokenEstimate || typeof tokenEstimate !== "object") {
    throw new Error("tokenEstimate must be present in metadata.");
  }

  if (typeof tokenEstimate.min !== "number" || Number.isNaN(tokenEstimate.min)) {
    throw new Error("tokenEstimate.min must be a valid number.");
  }

  if (typeof tokenEstimate.max !== "number" || Number.isNaN(tokenEstimate.max)) {
    throw new Error("tokenEstimate.max must be a valid number.");
  }

  if (!["high", "medium", "low"].includes(tokenEstimate.confidence)) {
    throw new Error("tokenEstimate.confidence must be one of: high, medium, low.");
  }

  return { ...metadata, model };
};

const trackModel = (modelName, content) => {
  const model = assertValidModelName(modelName);
  if (typeof content !== "string") {
    throw new Error("Content must be a string.");
  }

  const createdAt = new Date().toISOString();
  const tokenEstimate = estimateTokens(content, looksLikeCode(content));
  const metadata = {
    model,
    createdAt,
    updatedAt: createdAt,
    tokenEstimate
  };

  return validateMetadata(metadata);
};

const updateTimestamps = (metadata) => {
  const validated = validateMetadata(metadata);
  const nextUpdatedAt = new Date().toISOString();

  if (new Date(nextUpdatedAt).getTime() < new Date(validated.createdAt).getTime()) {
    throw new Error("Cannot set updatedAt earlier than createdAt.");
  }

  return {
    ...validated,
    updatedAt: nextUpdatedAt
  };
};

window.estimateTokens = estimateTokens;
window.trackModel = trackModel;
window.updateTimestamps = updateTimestamps;

const coerceMetadata = (prompt) => {
  const fallbackContent = typeof prompt.content === "string" ? prompt.content : "";

  try {
    if (prompt.metadata) {
      return validateMetadata(prompt.metadata);
    }
  } catch (_error) {
    // Falls back to generated metadata when legacy or malformed data is found.
  }

  return trackModel("Unknown model", fallbackContent);
};

const getPrompts = () => {
  const raw = localStorage.getItem(STORAGE_KEY);
  const prompts = raw ? JSON.parse(raw) : [];

  return prompts.map((prompt) => ({
    id: typeof prompt.id === "string" ? prompt.id : createId(),
    title: typeof prompt.title === "string" ? prompt.title : "Untitled Prompt",
    content: typeof prompt.content === "string" ? prompt.content : "",
    metadata: coerceMetadata(prompt),
    rating: coerceRating(prompt.rating),
    notes: Array.isArray(prompt.notes)
      ? prompt.notes
          .map((note) => {
            const createdAt = isValidIso8601(note?.createdAt) ? note.createdAt : toIsoNow();
            const updatedAt = isValidIso8601(note?.updatedAt) ? note.updatedAt : createdAt;

            return {
              id: typeof note?.id === "string" ? note.id : createId(),
              text: typeof note?.text === "string" ? note.text : "",
              createdAt,
              updatedAt
            };
          })
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      : []
  }));
};

const getRecentModels = () => {
  const raw = localStorage.getItem(RECENT_MODELS_KEY);
  const recent = raw ? JSON.parse(raw) : [];
  return Array.isArray(recent)
    ? recent
        .filter((name) => typeof name === "string")
        .map((name) => name.trim())
        .filter((name) => name && name.length <= 100)
        .slice(0, 4)
    : [];
};

const saveRecentModels = (models) => {
  try {
    localStorage.setItem(RECENT_MODELS_KEY, JSON.stringify(models.slice(0, 4)));
    return true;
  } catch (_error) {
    window.alert("Unable to save recent models right now.");
    return false;
  }
};

const addRecentModel = (modelName) => {
  const normalized = assertValidModelName(modelName);
  const deduped = [normalized, ...getRecentModels().filter((item) => item !== normalized)].slice(0, 4);
  return saveRecentModels(deduped);
};

const removeRecentModel = (modelName) => {
  const next = getRecentModels().filter((item) => item !== modelName);
  return saveRecentModels(next);
};

const renderRecentModels = () => {
  if (!recentModelsContainer) {
    return;
  }

  recentModelsContainer.innerHTML = "";
  const recentModels = getRecentModels();

  if (recentModels.length === 0) {
    const empty = document.createElement("p");
    empty.className = "recent-models-empty";
    empty.textContent = "No recent models yet.";
    recentModelsContainer.appendChild(empty);
    return;
  }

  recentModels.forEach((modelName) => {
    const wrapper = document.createElement("div");
    wrapper.className = "model-chip";

    const name = document.createElement("span");
    name.className = "model-chip-name";
    name.textContent = modelName;

    const actions = document.createElement("span");
    actions.className = "model-chip-actions";

    const chooseBtn = document.createElement("button");
    chooseBtn.type = "button";
    chooseBtn.className = "model-chip-btn";
    chooseBtn.dataset.action = "choose-model";
    chooseBtn.dataset.model = modelName;
    chooseBtn.textContent = "Choose";

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "model-chip-btn model-chip-delete";
    deleteBtn.dataset.action = "delete-model";
    deleteBtn.dataset.model = modelName;
    deleteBtn.textContent = "Delete";

    actions.append(chooseBtn, deleteBtn);
    wrapper.append(name, actions);
    recentModelsContainer.appendChild(wrapper);
  });
};

const savePrompts = (prompts) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prompts));
    return true;
  } catch (_error) {
    window.alert("Unable to save notes right now.");
    return false;
  }
};

const makePreview = (content) => {
  const words = content.trim().split(/\s+/);
  const previewWords = words.slice(0, 16).join(" ");
  return words.length > 16 ? `${previewWords}...` : previewWords;
};

const coerceRating = (value) => {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return 0;
  }

  return value >= 1 && value <= 5 ? value : 0;
};

const updatePromptRating = (promptId, rating) => {
  const normalized = coerceRating(rating);
  if (normalized < 1 || normalized > 5) {
    throw new Error("Rating must be an integer between 1 and 5.");
  }

  const prompts = getPrompts();
  const updated = prompts.map((prompt) =>
    prompt.id === promptId
      ? {
          ...prompt,
          metadata: updateTimestamps(prompt.metadata),
          rating: normalized
        }
      : prompt
  );

  if (savePrompts(updated)) {
    renderPrompts();
  }
};

const renderPrompts = () => {
  const prompts = getPrompts().sort(
    (a, b) => new Date(b.metadata.createdAt).getTime() - new Date(a.metadata.createdAt).getTime()
  );
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

    const ratingSection = document.createElement("section");
    ratingSection.className = "rating-section";
    ratingSection.setAttribute("aria-label", `${prompt.title} rating`);

    const ratingLabel = document.createElement("p");
    ratingLabel.className = "rating-label";
    ratingLabel.textContent = prompt.rating
      ? `Rating: ${prompt.rating}/5`
      : "Rating: not rated";

    const ratingStars = document.createElement("div");
    ratingStars.className = "rating-stars";

    for (let star = 1; star <= 5; star += 1) {
      const starButton = document.createElement("button");
      starButton.type = "button";
      starButton.className = `star-btn${star <= prompt.rating ? " is-active" : ""}`;
      starButton.dataset.action = "set-rating";
      starButton.dataset.rating = String(star);
      starButton.setAttribute("aria-label", `Rate ${star} out of 5`);
      starButton.textContent = "★";
      ratingStars.appendChild(starButton);
    }

    ratingSection.append(ratingLabel, ratingStars);

    const metadataSection = document.createElement("section");
    metadataSection.className = "metadata";
    metadataSection.setAttribute("aria-label", `${prompt.title} metadata`);

    const modelRow = document.createElement("p");
    modelRow.className = "metadata-row";
    modelRow.innerHTML = `<strong>Model:</strong> ${prompt.metadata.model}`;

    const createdRow = document.createElement("p");
    createdRow.className = "metadata-row";
    createdRow.innerHTML = `<strong>Created:</strong> ${new Date(prompt.metadata.createdAt).toLocaleString()}`;

    const updatedRow = document.createElement("p");
    updatedRow.className = "metadata-row";
    updatedRow.innerHTML = `<strong>Updated:</strong> ${new Date(prompt.metadata.updatedAt).toLocaleString()}`;

    const tokenRow = document.createElement("p");
    tokenRow.className = "metadata-row";
    tokenRow.innerHTML = `<strong>Token estimate:</strong> ${prompt.metadata.tokenEstimate.min} - ${prompt.metadata.tokenEstimate.max}`;

    const confidenceBadge = document.createElement("span");
    confidenceBadge.className = `confidence confidence-${prompt.metadata.tokenEstimate.confidence}`;
    confidenceBadge.textContent = prompt.metadata.tokenEstimate.confidence;
    tokenRow.append(" ", confidenceBadge);

    metadataSection.append(modelRow, createdRow, updatedRow, tokenRow);

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
      prompt.notes
        .slice()
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .forEach((note) => {
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

        const noteMeta = document.createElement("p");
        noteMeta.className = "note-meta";
        noteMeta.textContent = `Created ${new Date(note.createdAt).toLocaleString()} • Updated ${new Date(note.updatedAt).toLocaleString()}`;

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
        noteItem.append(noteText, noteEditor, noteMeta, noteActions);
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

    card.append(title, preview, ratingSection, metadataSection, notesSection, deletePromptButton);
    promptList.appendChild(card);
  });
};

const updatePromptNotes = (promptId, updateNotes) => {
  const prompts = getPrompts();
  const updated = prompts.map((prompt) =>
    prompt.id === promptId
      ? {
          ...prompt,
          metadata: updateTimestamps(prompt.metadata),
          notes: updateNotes(prompt.notes)
        }
      : prompt
  );

  if (savePrompts(updated)) {
    renderPrompts();
  }
};

promptList.addEventListener("click", (event) => {
  try {
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

      if (!input) {
        return;
      }

      if (!text) {
        window.alert("Note cannot be empty.");
        return;
      }

      const now = toIsoNow();
      updatePromptNotes(promptId, (notes) => [
        { id: createId(), text, createdAt: now, updatedAt: now },
        ...notes
      ]);
      return;
    }

    if (button.dataset.action === "set-rating") {
      const selectedRating = Number(button.dataset.rating);
      updatePromptRating(promptId, selectedRating);
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
        window.alert("Note cannot be empty.");
        return;
      }

      updatePromptNotes(promptId, (notes) =>
        notes.map((note) => (note.id === noteId ? { ...note, text, updatedAt: toIsoNow() } : note))
      );
      return;
    }

    if (button.dataset.action === "delete-note") {
      if (!window.confirm("Delete this note?")) {
        return;
      }

      updatePromptNotes(promptId, (notes) => notes.filter((note) => note.id !== noteId));
    }
  } catch (error) {
    window.alert(error instanceof Error ? error.message : "Something went wrong.");
  }
});

recentModelsContainer?.addEventListener("click", (event) => {
  try {
    const button = event.target.closest("button[data-action]");
    if (!button) {
      return;
    }

    const model = button.dataset.model;
    if (!model) {
      return;
    }

    if (button.dataset.action === "choose-model") {
      modelInput.value = model;
      modelInput.focus();
      modelInput.setSelectionRange(model.length, model.length);
      return;
    }

    if (button.dataset.action === "delete-model") {
      if (removeRecentModel(model)) {
        renderRecentModels();
      }
    }
  } catch (error) {
    window.alert(error instanceof Error ? error.message : "Could not update recent models.");
  }
});

form.addEventListener("submit", (event) => {
  try {
    event.preventDefault();

    const title = titleInput.value.trim();
    const modelName = modelInput.value;
    const content = contentInput.value.trim();
    const isCode = isCodeInput.checked;

    if (!title || !content) {
      return;
    }

    const metadata = trackModel(modelName, content);
    metadata.tokenEstimate = estimateTokens(content, isCode);

    const nextPrompts = [
      ...getPrompts(),
      {
        id: createId(),
        title,
        content,
        metadata,
        rating: 0,
        notes: []
      }
    ];

    if (savePrompts(nextPrompts)) {
      addRecentModel(modelName);
      form.reset();
      titleInput.focus();
      renderRecentModels();
      renderPrompts();
    }
  } catch (error) {
    window.alert(error instanceof Error ? error.message : "Unable to save prompt.");
  }
});

renderRecentModels();
renderPrompts();
