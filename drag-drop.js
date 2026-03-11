;(function () {
  'use strict'

  // ─── STATE ──────────────────────────────────────────────────────────────────
  // Tracks which drop zone the prop is currently hovering over
  let activeDropZone = null

  // ─── INIT ───────────────────────────────────────────────────────────────────
  // Call this once on page load, and again each time you surface a new question
  function initDragDrop() {
    // Clean up any previous interact bindings before re-initialising
    interact('.quiz-prop').unset()
    interact('.logo-drop-zone').unset()

    // Reset all props to their original positions
    document.querySelectorAll('.quiz-prop').forEach(resetProp)

    // Reset all drop zones
    document.querySelectorAll('.logo-drop-zone').forEach(function (zone) {
      zone.classList.remove('drop-zone--active', 'drop-zone--correct', 'drop-zone--wrong')
    })

    // ── Draggable props ──────────────────────────────────────────────────────
    interact('.quiz-prop').draggable({
      inertia: false,
      autoScroll: true,

      // Constrain dragging within the viewport
      modifiers: [
        interact.modifiers.restrictRect({
          restriction: 'body',
          endOnly: true
        })
      ],

      listeners: {
        // Update element position on every move tick
        move: function (event) {
          var target = event.target
          var x = (parseFloat(target.getAttribute('data-x')) || 0) + event.dx
          var y = (parseFloat(target.getAttribute('data-y')) || 0) + event.dy
          target.style.transform = 'translate(' + x + 'px, ' + y + 'px)'
          target.setAttribute('data-x', x)
          target.setAttribute('data-y', y)
        },

        // On drag end: if not over a valid zone, snap back
        end: function (event) {
          if (!activeDropZone) {
            snapPropBack(event.target)
          }
          activeDropZone = null
        }
      }
    })

    // ── Drop zones (logo containers) ─────────────────────────────────────────
    interact('.logo-drop-zone').dropzone({
      // Only accept elements with the quiz-prop class
      accept: '.quiz-prop',

      // Require 50% overlap before a drop is considered valid
      overlap: 0.5,

      ondropactivate: function (event) {
        // A drag has started anywhere — ready the zones
        event.target.classList.add('drop-zone--ready')
      },

      ondragenter: function (event) {
        // Prop is hovering over this zone
        activeDropZone = event.target
        event.target.classList.add('drop-zone--active')
        event.relatedTarget.classList.add('prop--over-zone')
      },

      ondragleave: function (event) {
        // Prop left this zone without dropping
        activeDropZone = null
        event.target.classList.remove('drop-zone--active')
        event.relatedTarget.classList.remove('prop--over-zone')
      },

      ondrop: function (event) {
        var prop   = event.relatedTarget   // the dragged prop element
        var zone   = event.target          // the logo zone it landed on

        zone.classList.remove('drop-zone--active', 'drop-zone--ready')
        prop.classList.remove('prop--over-zone')

        // ── Answer check ────────────────────────────────────────────────────
        // Read the correct answer from the prop's data-correct attribute
        var correctLogoId = prop.getAttribute('data-correct')
        var droppedLogoId = zone.getAttribute('data-logo-id')
        var isCorrect     = correctLogoId === droppedLogoId

        if (isCorrect) {
          handleCorrectDrop(prop, zone)
        } else {
          handleWrongDrop(prop, zone)
        }
      },

      ondropdeactivate: function (event) {
        event.target.classList.remove('drop-zone--ready', 'drop-zone--active')
      }
    })
  }

  // ─── CORRECT DROP ────────────────────────────────────────────────────────────
  function handleCorrectDrop(prop, zone) {
    // Lock the prop — no more dragging
    prop.style.pointerEvents = 'none'
    prop.classList.add('prop--correct')
    zone.classList.add('drop-zone--correct')

    // Snap prop visually to centre of the drop zone
    snapPropToZone(prop, zone)

    // ── Hook into your existing game logic ──────────────────────────────────
    // Replace or extend this with your own next-question / score calls
    if (typeof window.quizOnCorrect === 'function') {
      window.quizOnCorrect(prop, zone)
    }
  }

  // ─── WRONG DROP ──────────────────────────────────────────────────────────────
  function handleWrongDrop(prop, zone) {
    zone.classList.add('drop-zone--wrong')
    prop.classList.add('prop--wrong')

    // Brief visual feedback, then snap prop back to origin
    setTimeout(function () {
      zone.classList.remove('drop-zone--wrong')
      prop.classList.remove('prop--wrong')
      snapPropBack(prop)
    }, 600)

    // ── Hook into your existing game logic ──────────────────────────────────
    if (typeof window.quizOnWrong === 'function') {
      window.quizOnWrong(prop, zone)
    }
  }

  // ─── SNAP PROP BACK TO ORIGIN ────────────────────────────────────────────────
  function snapPropBack(el) {
    el.style.transition = 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)'
    el.style.transform  = 'translate(0, 0)'
    el.setAttribute('data-x', 0)
    el.setAttribute('data-y', 0)
    setTimeout(function () {
      el.style.transition = ''
    }, 350)
  }

  // ─── SNAP PROP TO CENTRE OF DROP ZONE ───────────────────────────────────────
  function snapPropToZone(prop, zone) {
    var propRect  = prop.getBoundingClientRect()
    var zoneRect  = zone.getBoundingClientRect()

    // Current translated position
    var currentX = parseFloat(prop.getAttribute('data-x')) || 0
    var currentY = parseFloat(prop.getAttribute('data-y')) || 0

    // Additional offset needed to centre prop on zone
    var offsetX = (zoneRect.left + zoneRect.width  / 2) - (propRect.left + propRect.width  / 2)
    var offsetY = (zoneRect.top  + zoneRect.height / 2) - (propRect.top  + propRect.height / 2)

    var finalX = currentX + offsetX
    var finalY = currentY + offsetY

    prop.style.transition = 'transform 0.25s ease'
    prop.style.transform  = 'translate(' + finalX + 'px, ' + finalY + 'px)'
    prop.setAttribute('data-x', finalX)
    prop.setAttribute('data-y', finalY)

    setTimeout(function () {
      prop.style.transition = ''
    }, 250)
  }

  // ─── RESET A SINGLE PROP ─────────────────────────────────────────────────────
  function resetProp(el) {
    el.style.transform     = ''
    el.style.transition    = ''
    el.style.pointerEvents = 'auto'
    el.setAttribute('data-x', 0)
    el.setAttribute('data-y', 0)
    el.classList.remove('prop--correct', 'prop--wrong', 'prop--over-zone')
  }

  // ─── PUBLIC API ──────────────────────────────────────────────────────────────
  // Expose on window so your existing quiz logic can call these

  // Call this to advance to the next question
  // Updates data-correct on the prop and re-initialises drag/drop
  window.quizSetQuestion = function (correctLogoId) {
    var prop = document.querySelector('.quiz-prop')
    if (prop) {
      prop.setAttribute('data-correct', correctLogoId)
    }
    initDragDrop()
  }

  // Call this from your timeout handler to disable dragging and snap back
  window.quizOnTimeout = function () {
    interact('.quiz-prop').unset()
    document.querySelectorAll('.quiz-prop').forEach(snapPropBack)
  }

  // ─── AUTO-INIT ───────────────────────────────────────────────────────────────
  // Initialise as soon as the DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDragDrop)
  } else {
    initDragDrop()
  }

})() // end IIFE
