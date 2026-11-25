"use strict";

const fileInput = document.querySelector("#quiz-file");
const quizSelect = document.querySelector("#quiz-select");
const catalogError = document.querySelector("#catalog-error");
const restartButton = document.querySelector("#restart");
const statusMessage = document.querySelector("#status");
const errorMessage = document.querySelector("#error");
const score = document.querySelector("#score");
const container = document.querySelector("#survey");

let activeQuiz;
let importId = 0;

function formatAnswer(question, value) {
  const displayValue = question.getDisplayValue(true, value);
  if (displayValue !== null && typeof displayValue === "object") {
    return JSON.stringify(displayValue, null, 2);
  }
  return String(displayValue ?? value ?? "");
}

function showResults(survey) {
  const total = survey.getQuizQuestionCount();
  const correct = survey.getCorrectAnswerCount();
  const summary = document.createElement("h2");
  summary.textContent = total ? `Score: ${correct} of ${total} correct` : "Quiz completed.";
  score.replaceChildren(summary);

  if (total) {
    const review = document.createElement("ol");
    review.className = "answer-review";
    for (const question of survey.getQuizQuestions()) {
      const item = document.createElement("li");
      const title = document.createElement("h3");
      title.textContent = question.title || question.name;

      const result = document.createElement("strong");
      const correctCount = question.correctAnswerCount;
      const questionCount = question.quizQuestionCount;
      result.textContent = correctCount === questionCount
        ? "Correct"
        : correctCount === 0
          ? "Incorrect"
          : `Partially correct (${correctCount} of ${questionCount})`;
      result.className = correctCount === questionCount ? "answer-correct" : "answer-missed";

      const submitted = document.createElement("p");
      const answer = question.isEmpty() ? "Unanswered" : formatAnswer(question, question.value);
      submitted.textContent = `Your answer: ${answer}`;

      const expected = document.createElement("p");
      expected.textContent = `Correct answer: ${formatAnswer(question, question.correctAnswer)}`;
      item.append(title, result, submitted, expected);
      review.append(item);
    }
    score.append(review);
  }
  score.hidden = false;
}

function renderQuiz(definition, filename) {
  const { Model } = window.Survey ?? {};
  if (typeof Model !== "function" || typeof Model.prototype.render !== "function") {
    throw new Error("SurveyJS could not load. Check your connection and reload the viewer.");
  }

  const model = new Model(definition);
  if (model.getAllQuestions().length === 0) {
    model.dispose();
    throw new Error("The file contains no supported SurveyJS questions.");
  }

  // Keep completion inside the viewer.
  model.navigateToUrl = "";
  model.navigateToUrlOnCondition = [];
  const mount = document.createElement("div");
  model.onComplete.add(showResults);

  container.append(mount);
  try {
    model.render(mount);
  } catch (error) {
    model.dispose();
    mount.remove();
    throw error;
  }

  activeQuiz?.model.dispose();
  activeQuiz?.mount.remove();
  activeQuiz = { definition, filename, model, mount };
  score.hidden = true;
  score.textContent = "";
  restartButton.hidden = false;
  statusMessage.textContent = `Loaded ${filename}`;
}

async function loadQuiz(filename, readContents) {
  const currentImport = ++importId;
  errorMessage.textContent = "";

  try {
    const contents = await readContents();
    if (currentImport !== importId) return;

    let definition;
    try {
      definition = JSON.parse(contents);
    } catch {
      throw new Error("The file is not valid JSON.");
    }

    if (!definition || typeof definition !== "object" || Array.isArray(definition)) {
      throw new Error("Choose a SurveyJS JSON file containing a survey object.");
    }

    renderQuiz(definition, filename);
  } catch (error) {
    if (currentImport === importId) {
      errorMessage.textContent = `${filename}: ${error.message}`;
    }
  }
}

async function loadCatalog() {
  try {
    const response = await fetch("quiz-catalog.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const quizzes = await response.json();
    quizSelect.options[0].textContent = quizzes.length ? "Choose a quiz" : "No quizzes available";
    for (const { path, title } of quizzes) {
      quizSelect.add(new Option(title, path));
    }
    quizSelect.disabled = quizzes.length === 0;
  } catch {
    quizSelect.options[0].textContent = "Quiz list unavailable";
    catalogError.textContent = "Open the hosted viewer for the quiz list, or choose a local quiz file.";
    catalogError.hidden = false;
  }
}

quizSelect.addEventListener("change", () => {
  const path = quizSelect.value;
  if (!path) {
    ++importId;
    errorMessage.textContent = "";
    return;
  }
  const filename = decodeURIComponent(path.split("/").pop());
  loadQuiz(filename, async () => {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Could not load quiz (HTTP ${response.status}).`);
    return response.text();
  });
});

fileInput.addEventListener("change", () => {
  const [file] = fileInput.files;
  if (!file) return;
  fileInput.value = "";
  quizSelect.selectedIndex = 0;
  loadQuiz(file.name, () => file.text());
});

loadCatalog();
restartButton.addEventListener("click", () => {
  ++importId;
  errorMessage.textContent = "";
  try {
    renderQuiz(activeQuiz.definition, activeQuiz.filename);
  } catch (error) {
    errorMessage.textContent = error.message;
  }
});
