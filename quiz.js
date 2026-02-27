(function () {
  'use strict';

  // ================================================================
  // HELPERS
  // ================================================================
  const el = (name) => document.querySelector(`[data-quiz-element="${name}"]`);

  function show(node) {
    if (node) node.setAttribute('data-visibility', 'True');
  }

  function hide(node) {
    if (node) node.setAttribute('data-visibility', 'False');
  }

  // ================================================================
  // ELEMENTS
  // ================================================================
  const screenInstructions = el('screen-instructions');
  const screenQuiz         = el('screen-quiz');
  const instructionsBtn    = el('instructions-btn');

  // ================================================================
  // SCREEN: INSTRUCTIONS
  // On load  → show instructions, hide quiz
  // On click → hide instructions, show quiz
  // ================================================================
  function initInstructions() {
    // Set baseline visibility on load
    show(screenInstructions);
    hide(screenQuiz);

    if (!instructionsBtn) {
      console.warn('[Quiz] instructions-btn not found.');
      return;
    }

    instructionsBtn.addEventListener('click', function () {
      hide(screenInstructions);
      show(screenQuiz);
    });
  }

  // ================================================================
  // INIT
  // ================================================================
  function init() {
    initInstructions();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
