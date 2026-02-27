(function () {
  'use strict';

  // ================================================================
  // HELPERS
  // ================================================================

  // Scoped element lookup — searches within a root (default: document)
  const el  = (name, root = document) => root.querySelector(`[data-quiz-element="${name}"]`);
  const els = (name, root = document) => Array.from(root.querySelectorAll(`[data-quiz-element="${name}"]`));

  // Visibility — driven by data-visibility="False|True"
  // CSS rule already in page: [data-visibility="False"] { display: none; }
  function show(node) { if (node) node.setAttribute('data-visibility', 'True'); }
  function hide(node) { if (node) node.setAttribute('data-visibility', 'False'); }

  // Button state — native disabled + data-disabled for Webflow styling
  function setDisabled(btn, disabled) {
    if (!btn) return;
    btn.disabled = !!disabled;
    btn.setAttribute('data-disabled', disabled ? 'true' : 'false');
  }

  // ================================================================
  // CONFIG (read from screen-quiz data attributes)
  // ================================================================

  const screenQuiz = el('screen-quiz');
  if (!screenQuiz) { console.warn('[Quiz] screen-quiz not found. Aborting.'); return; }

  const QUESTION_TIME = parseInt(screenQuiz.dataset.quizQuestionTime, 10) || 15;

  // ================================================================
  // ELEMENTS
  // ================================================================

  const screenInstructions = el('screen-instructions');
  const screenResults      = el('results');
  const timeoutOverlay     = el('timeout-overlay');
  const timerWrap          = document.querySelector('.wih1-timer_wrap');
  const instructionsBtn    = el('instructions-btn');
  const restartBtn         = el('restart-btn');

  const UI = {
    progressCurrent:   el('progress-current'),
    progressTotal:     el('progress-total'),
    scoreDisplay:      el('score-display'),
    finalScore:        el('final-score'),
    timerBar:          el('timer-bar'),
    timerText:         el('timer-text'),
    timeoutNextBtn:    el('timeout-next-btn'),
    // Scoped to timeout overlay — avoids clashing with answer option buttons
    timeoutAnswerSpan: el('answer', timeoutOverlay),
  };

  // Submit + Next buttons live inside each question block.
  // Always look them up from the current question so Q2, Q3 etc. work correctly.
  function getSubmitBtn() { return el('submit-btn', currentQ()); }
  function getNextBtn()   { return el('next-btn',   currentQ()); }

  // ================================================================
  // QUESTIONS
  // ================================================================

  const questionEls     = els('question');
  const TOTAL_QUESTIONS = questionEls.length;

  if (!TOTAL_QUESTIONS) { console.warn('[Quiz] No questions found. Aborting.'); return; }

  // ================================================================
  // STATE
  // ================================================================

  let currentIndex   = 0;
  let selectedIndex  = null;
  let locked         = false;
  let totalScore     = 0;
  let timeRemaining  = QUESTION_TIME;
  let timerId        = null;

  // ================================================================
  // QUESTION HELPERS
  // ================================================================

  function currentQ() {
    return questionEls[currentIndex] || null;
  }

  // Answer buttons scoped to a specific question — avoids the
  // timeout overlay's [data-quiz-element="answer"] span
  function getAnswerBtns(qEl) {
    return els('answer', qEl);
  }

  function getCorrectIndex(qEl) {
    return parseInt(qEl.dataset.correctAnswer ?? '0', 10);
  }

  function getCorrectText(qEl) {
    const idx = getCorrectIndex(qEl);
    const btn = getAnswerBtns(qEl).find(
      b => parseInt(b.getAttribute('data-answer-index'), 10) === idx
    );
    return btn ? btn.textContent.trim() : '';
  }

  // ================================================================
  // BASELINE VISIBILITY
  // Sets the correct starting state for all screens on page load.
  // ================================================================

  function setBaseline() {
    show(screenInstructions);
    hide(screenQuiz);
    hide(screenResults);
    hide(timeoutOverlay);
    hide(timerWrap);             // timer hidden until quiz starts
    questionEls.forEach(q => hide(q));
  }

  // ================================================================
  // AUTO-INDEX ANSWER BUTTONS
  // Stamps data-answer-index based on DOM order so Webflow authors
  // don't have to set it manually.
  // ================================================================

  function indexAnswers() {
    questionEls.forEach(qEl => {
      getAnswerBtns(qEl).forEach((btn, i) => {
        btn.setAttribute('data-answer-index', String(i));
      });
    });
  }

  // ================================================================
  // TIMER
  // ================================================================

  function stopTimer() {
    clearInterval(timerId);
    timerId = null;

    // Freeze the bar exactly where it is mid-animation
    if (UI.timerBar) {
      const currentW  = parseFloat(getComputedStyle(UI.timerBar).width);
      const parentW   = UI.timerBar.parentElement?.offsetWidth || 1;
      UI.timerBar.style.transition = 'none';
      UI.timerBar.style.width      = (currentW / parentW * 100).toFixed(3) + '%';
    }
  }

  function startTimer() {
    stopTimer();
    timeRemaining = QUESTION_TIME;

    if (UI.timerBar) {
      // 1. Snap to 100% with no transition
      UI.timerBar.style.transition = 'none';
      UI.timerBar.style.width      = '100%';
      // 2. Force reflow so the browser registers the 100% before animating
      UI.timerBar.getBoundingClientRect();
      // 3. One single transition from 100% → 0% over the full question time
      //    CSS handles all the smoothness — JS never touches width again
      UI.timerBar.style.transition = `width ${QUESTION_TIME}s linear`;
      UI.timerBar.style.width      = '0%';
    }

    if (UI.timerText) UI.timerText.textContent = String(QUESTION_TIME);
    if (timerWrap)    timerWrap.setAttribute('data-warning', 'false');

    // setInterval only drives the text counter + warning state
    timerId = setInterval(() => {
      timeRemaining -= 1;
      if (UI.timerText) UI.timerText.textContent = String(Math.max(0, timeRemaining));
      if (timerWrap)    timerWrap.setAttribute('data-warning', timeRemaining <= 5 ? 'true' : 'false');

      if (timeRemaining <= 0) {
        stopTimer();
        onTimeout();
      }
    }, 1000);
  }

  // ================================================================
  // QUESTION LOAD
  // ================================================================

  function resetQuestion(qEl) {
    // Clear all answer button state
    getAnswerBtns(qEl).forEach(btn => {
      btn.setAttribute('data-selected', 'false');
      btn.setAttribute('data-locked',   'false');
      btn.removeAttribute('data-correct');
    });

    // Hide feedback block
    const feedbackWrap   = el('feedback-msg', qEl);
    const feedbackAnswer = el('feedback-answer', qEl);
    if (feedbackWrap)   feedbackWrap.setAttribute('data-disabled', 'true');
    if (feedbackWrap)   feedbackWrap.removeAttribute('data-feedback-correct');
    if (feedbackAnswer) feedbackAnswer.textContent = '';

    // Reset hint
    const hintText = el('hint-text', qEl);
    if (hintText) hintText.hidden = true;
  }

  function updateProgress() {
    if (UI.progressCurrent) UI.progressCurrent.textContent = String(currentIndex + 1);
    if (UI.progressTotal)   UI.progressTotal.textContent   = String(TOTAL_QUESTIONS);
    if (UI.scoreDisplay)    UI.scoreDisplay.textContent    = String(totalScore);
  }

  function showOnlyQuestion(index) {
    questionEls.forEach((q, i) => i === index ? show(q) : hide(q));
  }

  function loadQuestion(index) {
    currentIndex  = index;
    selectedIndex = null;
    locked        = false;

    const qEl = currentQ();
    if (!qEl) return;

    hide(timeoutOverlay);
    resetQuestion(qEl);
    showOnlyQuestion(index);
    updateProgress();
    setDisabled(getSubmitBtn(), true);
    setDisabled(getNextBtn(),   true);
    initHint(qEl);
    startTimer();
  }

  // ================================================================
  // HINT
  // Re-binds per question to avoid stale listeners on retry.
  // ================================================================

  function initHint(qEl) {
    const hintBtn  = el('hint-btn',  qEl);
    const hintText = el('hint-text', qEl);
    if (!hintBtn || !hintText) return;

    const fresh = hintBtn.cloneNode(true);
    hintBtn.parentNode.replaceChild(fresh, hintBtn);
    fresh.addEventListener('click', () => { hintText.hidden = !hintText.hidden; });
  }

  // ================================================================
  // ANSWER SELECTION
  // ================================================================

  function selectAnswer(index) {
    selectedIndex = index;
    const qEl = currentQ();
    if (!qEl) return;

    getAnswerBtns(qEl).forEach(btn => {
      const i = parseInt(btn.getAttribute('data-answer-index'), 10);
      btn.setAttribute('data-selected', i === index ? 'true' : 'false');
    });

    setDisabled(getSubmitBtn(), false);
  }

  // ================================================================
  // REVEAL ANSWERS (used by both submit and timeout)
  // ================================================================

  function revealAnswers(qEl) {
    const correctIdx = getCorrectIndex(qEl);
    getAnswerBtns(qEl).forEach(btn => {
      const i = parseInt(btn.getAttribute('data-answer-index'), 10);
      btn.setAttribute('data-locked',  'true');
      btn.setAttribute('data-correct', i === correctIdx ? 'true' : 'false');
    });
  }

  // ================================================================
  // SUBMIT
  // ================================================================

  function onSubmit() {
    if (locked || selectedIndex === null) return;
    stopTimer();
    locked = true;

    const qEl        = currentQ();
    if (!qEl) return;

    const correctIdx = getCorrectIndex(qEl);
    const isCorrect  = selectedIndex === correctIdx;

    revealAnswers(qEl);

    // Score
    const points = isCorrect ? Math.max(0, timeRemaining) : 0;
    if (isCorrect) {
      totalScore += points;
      if (UI.scoreDisplay) UI.scoreDisplay.textContent = String(totalScore);
    }

    // Feedback
    const feedbackWrap   = el('feedback-msg',    qEl);
    const feedbackAnswer = el('feedback-answer', qEl);

    if (feedbackWrap) {
      feedbackWrap.setAttribute('data-disabled',        'false');
      feedbackWrap.setAttribute('data-feedback-correct', isCorrect ? 'true' : 'false');
    }
    if (feedbackAnswer) {
      feedbackAnswer.textContent = isCorrect
        ? `Correct! +${points} points`
        : `Not quite. The correct answer is ${getCorrectText(qEl)}`;
    }

    setDisabled(getSubmitBtn(), true);
    setDisabled(getNextBtn(),   false);
  }

  // ================================================================
  // TIMEOUT
  // ================================================================

  function onTimeout() {
    locked = true;

    const qEl = currentQ();
    if (!qEl) return;

    revealAnswers(qEl);

    // Populate the timeout overlay's correct-answer span
    if (UI.timeoutAnswerSpan) {
      UI.timeoutAnswerSpan.textContent = getCorrectText(qEl);
    }

    setDisabled(getSubmitBtn(), true);
    setDisabled(getNextBtn(),   true);
    show(timeoutOverlay);
  }

  // ================================================================
  // NEXT QUESTION
  // ================================================================

  function goNext() {
    hide(timeoutOverlay);
    const next = currentIndex + 1;
    if (next >= TOTAL_QUESTIONS) {
      endQuiz();
    } else {
      loadQuestion(next);
    }
  }

  // ================================================================
  // END QUIZ
  // ================================================================

  function endQuiz() {
    stopTimer();
    hide(screenQuiz);
    hide(timerWrap);
    hide(timeoutOverlay);
    show(screenResults);
    if (UI.finalScore) UI.finalScore.textContent = String(totalScore);
  }

  // ================================================================
  // RESET / TRY AGAIN
  // Returns to instructions screen. Timer does not restart.
  // ================================================================

  function resetQuiz() {
    stopTimer();
    currentIndex  = 0;
    selectedIndex = null;
    locked        = false;
    totalScore    = 0;
    timeRemaining = QUESTION_TIME;

    hide(screenResults);
    hide(timeoutOverlay);
    hide(screenQuiz);
    hide(timerWrap);
    questionEls.forEach(q => hide(q));

    if (timerWrap) timerWrap.setAttribute('data-warning', 'false');
    if (UI.timerText) UI.timerText.textContent = String(QUESTION_TIME);
    if (UI.timerBar) {
      UI.timerBar.style.transition = 'none';
      UI.timerBar.style.width      = '100%';
    }

    show(screenInstructions);
  }

  // ================================================================
  // START QUIZ
  // ================================================================

  function startQuiz() {
    totalScore    = 0;
    currentIndex  = 0;
    selectedIndex = null;
    locked        = false;

    hide(screenInstructions);
    show(screenQuiz);
    show(timerWrap);

    if (UI.scoreDisplay) UI.scoreDisplay.textContent = '0';
    loadQuestion(0);
  }

  // ================================================================
  // ANSWER CLICK DELEGATION
  // Delegated to screenQuiz — scoped to current question only
  // to avoid the timeout overlay's [data-quiz-element="answer"] span.
  // ================================================================

  function bindQuizClicks() {
    // Single delegated listener handles answers, submit and next
    // — works for every question without rebinding
    screenQuiz.addEventListener('click', e => {
      const qEl = currentQ();

      // Submit
      if (e.target.closest('[data-quiz-element="submit-btn"]')) {
        onSubmit();
        return;
      }

      // Next
      if (e.target.closest('[data-quiz-element="next-btn"]')) {
        const nextBtn = getNextBtn();
        if (nextBtn && !nextBtn.disabled) goNext();
        return;
      }

      // Answer selection
      if (locked) return;
      const btn = e.target.closest('[data-quiz-element="answer"]');
      if (!btn) return;
      if (!qEl || !qEl.contains(btn)) return; // guard against timeout overlay span
      const idx = parseInt(btn.getAttribute('data-answer-index'), 10);
      if (!isNaN(idx)) selectAnswer(idx);
    });
  }

  // ================================================================
  // INIT
  // ================================================================

  function init() {
    indexAnswers();
    setBaseline();
    bindQuizClicks();

    if (instructionsBtn)   instructionsBtn.addEventListener('click', startQuiz);
    if (UI.timeoutNextBtn) UI.timeoutNextBtn.addEventListener('click', goNext);
    if (restartBtn)        restartBtn.addEventListener('click', resetQuiz);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
