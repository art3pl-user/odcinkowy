// Okno wysuwane od dołu w stylu aplikacji: listy wyboru i objaśnienia.
(function (root) {
  'use strict';

  const { el } = UI;
  const sheet = el('sheet');
  const body = el('sheet-body');
  let opener = null;

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function close() {
    if (sheet.hidden) return;
    sheet.hidden = true;
    opener?.focus({ preventScroll: true });
    opener = null;
  }

  function open(title, content) {
    opener = document.activeElement;
    el('sheet-title').textContent = title;
    body.replaceChildren(content);
    sheet.hidden = false;
    (body.querySelector('[aria-selected="true"]') || el('sheet-close')).focus();
  }

  // Zastępuje systemową listę przyciskiem; sam <select> nadal przechowuje wartość
  function enhance(select) {
    const button = node('button', 'picker');
    button.type = 'button';
    button.id = select.id + '-picker';
    button.setAttribute('aria-haspopup', 'listbox');
    const title = select.getAttribute('aria-label') || '';
    const refresh = () => {
      const text = select.selectedOptions[0]?.textContent || '';
      button.textContent = text;
      button.setAttribute('aria-label', title + ': ' + text);
    };
    button.addEventListener('click', () => {
      const list = node('div', 'options');
      list.setAttribute('role', 'listbox');
      list.append(...Array.from(select.options, (option) => {
        const item = node('button', 'option', option.textContent);
        item.type = 'button';
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', String(option.selected));
        item.addEventListener('click', () => {
          select.value = option.value;
          select.dispatchEvent(new Event('change'));
          close();
        });
        return item;
      }));
      open(title, list);
    });
    select.addEventListener('change', refresh);
    select.hidden = true;
    select.after(button);
    refresh();
  }

  el('sheet-close').addEventListener('click', close);
  sheet.addEventListener('click', (e) => {
    if (e.target === sheet) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
  window.addEventListener('hashchange', close);

  root.Sheet = {
    enhance,
    info: (title, text) => open(title, node('p', 'sheet-text', text)),
  };
})(this);
