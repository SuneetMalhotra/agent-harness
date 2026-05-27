// Minimal TodoMVC-equivalent app. No framework.
//
// On load, seeds the list with three sample todos so screenshots always
// have visible content. Defect-seeding is performed by render.ts, which
// injects a <style id="seed-style"> tag or mutates DOM before snapshot.

(function () {
  'use strict';

  const SEED_TODOS = [
    { id: 1, text: 'Buy milk', completed: false },
    { id: 2, text: 'Walk the dog', completed: true },
    { id: 3, text: 'Write the report', completed: false },
  ];

  const state = {
    todos: SEED_TODOS.slice(),
    nextId: 4,
    filter: 'all',
  };

  function render() {
    const list = document.getElementById('todo-list');
    const count = document.getElementById('todo-count');
    list.innerHTML = '';
    const visible = state.todos.filter((t) => {
      if (state.filter === 'active') return !t.completed;
      if (state.filter === 'completed') return t.completed;
      return true;
    });
    for (const t of visible) {
      const li = document.createElement('li');
      if (t.completed) li.classList.add('completed');
      li.dataset.id = String(t.id);

      const toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.className = 'toggle';
      toggle.checked = t.completed;
      toggle.setAttribute('aria-label', 'Mark complete: ' + t.text);
      toggle.addEventListener('change', () => {
        t.completed = toggle.checked;
        render();
      });

      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = t.text;

      const destroy = document.createElement('button');
      destroy.className = 'destroy';
      destroy.type = 'button';
      destroy.setAttribute('aria-label', 'Delete: ' + t.text);
      destroy.textContent = 'Delete';
      destroy.addEventListener('click', () => {
        state.todos = state.todos.filter((x) => x.id !== t.id);
        render();
      });

      li.appendChild(toggle);
      li.appendChild(label);
      li.appendChild(destroy);
      list.appendChild(li);
    }
    const active = state.todos.filter((t) => !t.completed).length;
    count.innerHTML = '<strong>' + active + '</strong> item' + (active === 1 ? '' : 's') + ' left';
  }

  function addTodo(text) {
    const trimmed = text.trim();
    if (!trimmed) return;
    state.todos.push({ id: state.nextId++, text: trimmed, completed: false });
    render();
  }

  document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('new-todo-form');
    const input = document.getElementById('new-todo');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      addTodo(input.value);
      input.value = '';
    });

    const filters = document.getElementById('filters');
    filters.addEventListener('click', (e) => {
      const target = e.target;
      if (target && target.tagName === 'A' && target.dataset.filter) {
        e.preventDefault();
        state.filter = target.dataset.filter;
        for (const a of filters.querySelectorAll('a')) {
          a.classList.toggle('selected', a.dataset.filter === state.filter);
        }
        render();
      }
    });

    const clear = document.getElementById('clear-completed');
    clear.addEventListener('click', () => {
      state.todos = state.todos.filter((t) => !t.completed);
      render();
    });

    const toggleAll = document.getElementById('toggle-all');
    toggleAll.addEventListener('change', () => {
      for (const t of state.todos) t.completed = toggleAll.checked;
      render();
    });

    render();
  });
})();
