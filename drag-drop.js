;(function () {
  'use strict'

  // ─── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
  //
  // quiz.js owns: timer, scoring, question flow, submit/next buttons, feedback.
  // drag-drop.js owns: drag lift, z-index elevation, drop detection, snap-back,
  //                    and the wrapper fix that stops logo <img> elements from
  //                    intercepting pointer events meant for the dragged prop.
  //
  // Integration contract (no parallel event system invented):
  //   - Any drop      → snap prop to zone centre; find the matching
  //                      [data-quiz-element="answer"] button and fire .click()
  //                      → quiz.js selectAnswer() (enables submit button)
  //   - User submits  → quiz.js evaluates correct/wrong, shows feedback
  //   - No drop       → snap back; no answer selected
  //   - Quiz locked   → read [data-quiz-element="answer"] data-locked="true"
  //                      (set by quiz.js revealAnswers() on submit or timeout)
  //   - Timeout       → detected via data-visibility="True" on the timeout overlay
  //   - Next question → detected via MutationObserver watching data-visibility on
  //                      [data-quiz-element="question"] elements

  // ─── CONSTANTS ───────────────────────────────────────────────────────────────

  var SNAP_BACK_MS = 350   // ms — spring easing for returning to origin (no-drop)
  var SNAP_TO_MS   = 250   // ms — ease for snapping prop to drop zone centre
  var OVERLAP      = 0.3   // 30 % overlap needed to trigger a drop

  // ─── QUIZ.JS READ-ONLY SIGNALS ───────────────────────────────────────────────

  // quiz.js helper mirror — locate elements by data-quiz-element (same convention)
  function qel (name, root) {
    return (root || document).querySelector('[data-quiz-element="' + name + '"]')
  }
  function qels (name, root) {
    return Array.from((root || document).querySelectorAll('[data-quiz-element="' + name + '"]'))
  }

  // True when quiz.js has locked the current question (submit or timeout fired).
  // quiz.js sets data-locked="true" on every answer button inside revealAnswers().
  function isLocked (qEl) {
    var btn = qEl && qEl.querySelector('[data-quiz-element="answer"]')
    return btn ? btn.dataset.locked === 'true' : true
  }

  // True when quiz.js has shown the timeout overlay for the current question.
  function isTimedOut () {
    var overlay = qel('timeout-overlay')
    return overlay ? overlay.dataset.visibility === 'True' : false
  }

  // ─── ANSWER BUTTON LOOKUP ────────────────────────────────────────────────────
  //
  // quiz.js tracks the selected answer via [data-quiz-element="answer"] elements.
  // We need to map a logo-id from the drop zone onto one of those elements.
  // Three strategies, tried in order:
  //   1. Explicit  — answer button carries a matching [data-logo-id] attribute
  //   2. Self       — the logo-drop-zone <img> itself is the answer button
  //   3. Index      — positional order of .logo-drop-zone matches answer button order
  //
  // Whichever Webflow structure is used, at least one strategy will resolve.
  function findAnswerBtn (qEl, logoId) {
    // Strategy 1: answer button has data-logo-id attribute
    var explicit = qEl.querySelector('[data-quiz-element="answer"][data-logo-id="' + logoId + '"]')
    if (explicit) return explicit

    // Strategy 2: the logo img itself is also an answer button
    var self = qEl.querySelector('.logo-drop-zone[data-logo-id="' + logoId + '"][data-quiz-element="answer"]')
    if (self) return self

    // Strategy 3: positional index — assumes logo-drop-zones and answer buttons
    //             are in the same order within the question
    var zones   = Array.from(qEl.querySelectorAll('.logo-drop-zone'))
    var answers = qels('answer', qEl)
    var idx     = zones.findIndex(function (img) { return img.dataset.logoId === logoId })
    return (idx !== -1 && answers[idx]) ? answers[idx] : null
  }

  // ─── DROP ZONE WRAPPING ──────────────────────────────────────────────────────
  //
  // Problem: .logo-drop-zone elements are <img> tags. When the dragged prop
  // passes over them, the browser hands pointer events to the <img>, not to
  // interact.js's drop zone. Result: drops are missed.
  //
  // Fix (runtime only — Webflow HTML is never changed):
  //   Replace each logo <img> with:
  //     <div class="wih1-drop-overlay" data-logo-id="…">
  //       <img class="logo-drop-zone" style="pointer-events:none" …>
  //     </div>
  //   The wrapper div becomes the interact.js dropzone target.
  //   The img keeps pointer-events:none so it never intercepts drops again.
  //   Idempotent — safe to call more than once on the same question.
  function wrapDropZones (qEl) {
    qEl.querySelectorAll('.logo-drop-zone').forEach(function (img) {
      // Skip if already wrapped
      if (img.parentElement.classList.contains('wih1-drop-overlay')) return

      var wrapper        = document.createElement('div')
      wrapper.className  = 'wih1-drop-overlay'
      // Copy logo-id onto the wrapper so interact.js ondrop can read it
      wrapper.dataset.logoId = img.dataset.logoId

      img.parentNode.insertBefore(wrapper, img)
      wrapper.appendChild(img)
      img.style.pointerEvents = 'none'
    })
  }

  // ─── PROP POSITION HELPERS ───────────────────────────────────────────────────

  function getPropPos (prop) {
    return {
      x: parseFloat(prop.getAttribute('data-x')) || 0,
      y: parseFloat(prop.getAttribute('data-y')) || 0
    }
  }

  function setPropPos (prop, x, y) {
    prop.setAttribute('data-x', x)
    prop.setAttribute('data-y', y)
    prop.style.transform = 'translate(' + x + 'px, ' + y + 'px)'
  }

  // Animate prop back to its natural (0, 0) position with a spring bounce.
  function snapPropBack (prop) {
    prop.style.transition = 'transform ' + SNAP_BACK_MS + 'ms cubic-bezier(0.34, 1.56, 0.64, 1)'
    prop.style.transform  = 'translate(0, 0)'
    prop.setAttribute('data-x', 0)
    prop.setAttribute('data-y', 0)
    prop.style.zIndex    = ''
    prop.style.position  = ''
    setTimeout(function () { prop.style.transition = '' }, SNAP_BACK_MS)
  }

  // Animate prop to the visual centre of its drop zone.
  function snapPropToZone (prop, zone) {
    var propRect = prop.getBoundingClientRect()
    var zoneRect = zone.getBoundingClientRect()
    var pos      = getPropPos(prop)

    // Additional translate needed to centre prop on zone
    var offsetX = (zoneRect.left + zoneRect.width  / 2) - (propRect.left + propRect.width  / 2)
    var offsetY = (zoneRect.top  + zoneRect.height / 2) - (propRect.top  + propRect.height / 2)
    var finalX  = pos.x + offsetX
    var finalY  = pos.y + offsetY

    prop.style.transition = 'transform ' + SNAP_TO_MS + 'ms ease'
    setPropPos(prop, finalX, finalY)
    setTimeout(function () { prop.style.transition = '' }, SNAP_TO_MS)
  }

  // Reset a prop to its original DOM position (no animation — used on question load).
  function resetProp (prop) {
    prop.style.transform     = ''
    prop.style.transition    = ''
    prop.style.zIndex        = ''
    prop.style.position      = ''
    prop.style.pointerEvents = 'auto'
    prop.setAttribute('data-x', 0)
    prop.setAttribute('data-y', 0)
    prop.classList.remove('prop--correct', 'prop--wrong', 'prop--over-zone')
  }

  // ─── PER-QUESTION INIT ───────────────────────────────────────────────────────
  //
  // Called by the MutationObserver whenever quiz.js makes a question visible,
  // and once on boot for the first question.
  function initQuestion (qEl) {
    if (!qEl) return

    var prop = qEl.querySelector('.quiz-prop')
    if (!prop) return

    // 1. Reset prop to origin (instant, no animation)
    resetProp(prop)

    // 2. Wrap logo <img> elements in overlay divs (idempotent)
    wrapDropZones(qEl)

    // 3. Clear any stale interact.js bindings (prevents duplicate listeners
    //    if initQuestion is somehow called twice for the same element)
    try { interact(prop).unset() } catch (_) {}
    qEl.querySelectorAll('.wih1-drop-overlay').forEach(function (w) {
      try { interact(w).unset() } catch (_) {}
    })

    // 4. Reset drop zone visual state
    qEl.querySelectorAll('.wih1-drop-overlay').forEach(function (w) {
      w.removeAttribute('data-drag-over')
      w.classList.remove('drop-zone--active', 'drop-zone--correct', 'drop-zone--wrong', 'drop-zone--ready')
    })

    // Flag: did interact.js fire ondrop during the current drag gesture?
    // Checked in the draggable 'end' listener to decide whether to snap back.
    // Must live in this closure so each question gets a fresh flag.
    var dropHandled = false

    // ── Draggable prop ────────────────────────────────────────────────────────
    interact(prop).draggable({
      inertia:    false,
      autoScroll: true,

      modifiers: [
        // Keep the prop inside the viewport on release
        interact.modifiers.restrictRect({ restriction: 'body', endOnly: true })
      ],

      listeners: {
        start: function (event) {
          // Don't start a drag if quiz.js has already locked this question
          if (isLocked(qEl) || isTimedOut()) {
            event.interaction.stop()  // abort before any movement occurs
            return
          }
          // ── z-index fix ──────────────────────────────────────────────────
          // prop needs position:relative so z-index takes effect in the
          // stacking context; then raise it above all logo images during drag.
          prop.style.position  = 'relative'
          prop.style.zIndex    = '1000'
          prop.style.transition = ''
        },

        move: function (event) {
          // Secondary guard: abort if quiz locks mid-drag (e.g. timeout fires
          // while the user is holding the prop)
          if (isLocked(qEl) || isTimedOut()) {
            snapPropBack(prop)
            return
          }
          var pos = getPropPos(prop)
          setPropPos(prop, pos.x + event.dx, pos.y + event.dy)
        },

        end: function () {
          prop.style.zIndex   = ''
          prop.style.position = ''
          if (!dropHandled) {
            // Prop was released mid-air with no recognised drop — snap back
            snapPropBack(prop)
          }
          // Always reset for the next drag gesture on this question
          dropHandled = false
        }
      }
    })

    // ── Drop zones (one wrapper div per logo) ────────────────────────────────
    qEl.querySelectorAll('.wih1-drop-overlay').forEach(function (wrapper) {
      interact(wrapper).dropzone({
        accept:  '.quiz-prop',  // only accept the draggable from this quiz
        overlap: OVERLAP,

        ondropactivate: function () {
          // A drag started somewhere — prepare all zones
          wrapper.classList.add('drop-zone--ready')
        },

        ondragenter: function (event) {
          wrapper.setAttribute('data-drag-over', 'true')
          wrapper.classList.add('drop-zone--active')
          event.relatedTarget.classList.add('prop--over-zone')
        },

        ondragleave: function (event) {
          wrapper.removeAttribute('data-drag-over')
          wrapper.classList.remove('drop-zone--active')
          event.relatedTarget.classList.remove('prop--over-zone')
        },

        ondrop: function (event) {
          // Mark drop as handled *first* — the draggable 'end' listener fires
          // after ondrop, so setting this flag prevents a double snap-back.
          dropHandled = true

          wrapper.removeAttribute('data-drag-over')
          wrapper.classList.remove('drop-zone--active', 'drop-zone--ready')
          event.relatedTarget.classList.remove('prop--over-zone')

          // Guard: ignore drop if quiz locked between drag-start and drop
          if (isLocked(qEl) || isTimedOut()) {
            snapPropBack(prop)
            return
          }

          // ── Any drop: snap prop to zone, register selection ───────────────
          // Correct-vs-wrong is not evaluated here — that is quiz.js's job
          // when the user clicks the submit button.

          // Snap prop to the centre of whichever zone it landed on
          snapPropToZone(prop, wrapper)

          // Integrate with quiz.js via its own DOM click-event system:
          // clicking the answer button calls quiz.js's selectAnswer(),
          // which sets selectedEl and enables the submit button.
          var answerBtn = findAnswerBtn(qEl, wrapper.dataset.logoId)
          if (answerBtn) answerBtn.click()
        },

        ondropdeactivate: function () {
          wrapper.classList.remove('drop-zone--ready', 'drop-zone--active')
        }
      })
    })
  }

  // ─── QUESTION CHANGE OBSERVER ────────────────────────────────────────────────
  //
  // quiz.js shows/hides questions by setting data-visibility="True/False" on
  // [data-quiz-element="question"] nodes.  We watch that attribute so we can
  // call initQuestion whenever a new question becomes visible — this handles
  // prop reset, interact.js re-binding, and drop zone wrapping.
  function observeQuestions () {
    var screenQuiz = qel('screen-quiz')
    if (!screenQuiz) return

    new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i]
        if (
          m.type === 'attributes' &&
          m.attributeName === 'data-visibility' &&
          m.target.dataset.quizElement === 'question' &&
          m.target.dataset.visibility  === 'True'
        ) {
          initQuestion(m.target)
          break  // only one question visible at a time
        }
      }
    }).observe(screenQuiz, {
      attributes:      true,
      attributeFilter: ['data-visibility'],
      subtree:         true
    })
  }

  // ─── BOOT ────────────────────────────────────────────────────────────────────

  function init () {
    if (typeof interact === 'undefined') {
      console.warn('[wih1-drag-drop] interact.js not found — load it before this script.')
      return
    }

    // Watch for question transitions driven by quiz.js
    observeQuestions()

    // quiz.js's init() calls loadQuestion(0, false) synchronously, so question 0
    // will already have data-visibility="True" by the time our DOMContentLoaded
    // fires.  Init it directly to avoid missing the first question.
    var firstVisible = document.querySelector('[data-quiz-element="question"][data-visibility="True"]')
    if (firstVisible) initQuestion(firstVisible)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }

})() // end IIFE
