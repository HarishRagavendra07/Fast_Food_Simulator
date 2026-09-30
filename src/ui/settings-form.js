// Builds the settings inputs and shows per-field warnings from validateSettings()
import { FIELDS, validateSettings } from '../sim/config.js';

const $ = (id) => document.getElementById(id);

export function renderFields() {
  $('fields').replaceChildren(
    ...FIELDS.map((f) => {
      const wrap = document.createElement('div');
      wrap.className = 'field';
      wrap.innerHTML = `
        <label for="f-${f.key}">${f.label}${f.required ? '' : ' <span class="muted">(optional)</span>'}</label>
        <input id="f-${f.key}" name="${f.key}" type="text" inputmode="decimal" autocomplete="off"
          value="${f.default}" placeholder="${f.required ? '' : 'until stopped'}" aria-describedby="h-${f.key} e-${f.key}" />
        <small id="h-${f.key}" class="hint">${f.hint}</small>
        <small id="e-${f.key}" class="field-error" role="alert"></small>`;
      return wrap;
    })
  );
}

// Returns a config in ms, or null after showing the problems next to each field
export function readSettings() {
  const raw = Object.fromEntries(FIELDS.map((f) => [f.key, $(`f-${f.key}`).value]));
  const { config, errors, warnings } = validateSettings(raw);

  for (const f of FIELDS) {
    const input = $(`f-${f.key}`);
    const message = errors[f.key] ?? '';
    $(`e-${f.key}`).textContent = message;
    input.toggleAttribute('aria-invalid', Boolean(message));
  }
  $('warnings').replaceChildren(
    ...warnings.map((w) => Object.assign(document.createElement('p'), { textContent: `⚠️ ${w}` }))
  );

  if (!config) {
    const first = FIELDS.find((f) => errors[f.key]);
    $(`f-${first.key}`).focus();
    return null;
  }
  return { ...config, speed: Number($('speed').value) };
}

// Clear a field's warning as soon as the user edits it
export function clearErrorOnInput() {
  $('fields').addEventListener('input', (e) => {
    if (e.target.name) {
      $(`e-${e.target.name}`).textContent = '';
      e.target.removeAttribute('aria-invalid');
    }
  });
}
